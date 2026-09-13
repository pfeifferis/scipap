import os
import json
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, text
from models import Base, SchemaFieldDB, SettingDB

DATA_DIR = os.getenv("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data")))
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "extraction.db")
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(
    DATABASE_URL,
    connect_args={"timeout": 30},
    echo=False
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Load schema fields from single canonical source of truth (schema_fields.json)
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "schema_fields.json")
try:
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        DEFAULT_SCHEMA_FIELDS = json.load(f)
except Exception as e:
    print(f"[SCHEMA] Warning: could not load schema file {SCHEMA_FILE}: {e}")
    DEFAULT_SCHEMA_FIELDS = []


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA busy_timeout=30000"))
        except Exception:
            pass
        await conn.run_sync(Base.metadata.create_all)
        # Check if category column exists in schema_fields table, if not add it
        try:
            await conn.execute(text("ALTER TABLE schema_fields ADD COLUMN category VARCHAR(150) DEFAULT 'General'"))
        except Exception:
            pass
        # Check if citations column exists in extractions table, if not add it
        try:
            await conn.execute(text("ALTER TABLE extractions ADD COLUMN citations TEXT"))
        except Exception:
            pass
        # Check if is_checked column exists in papers table, if not add it
        try:
            await conn.execute(text("ALTER TABLE papers ADD COLUMN is_checked BOOLEAN DEFAULT 0"))
        except Exception:
            pass

    # Seed and sync schema fields (remove obsolete fields, add/update new fields)
    async with AsyncSessionLocal() as session:
        target_keys = {item["key"] for item in DEFAULT_SCHEMA_FIELDS}
        
        # Remove any fields not in the active structure
        result = await session.execute(select(SchemaFieldDB))
        all_existing = result.scalars().all()
        for f in all_existing:
            if f.key not in target_keys:
                await session.delete(f)
        await session.commit()

        # Update or insert current fields
        existing_res = await session.execute(select(SchemaFieldDB.key))
        existing_keys = set(existing_res.scalars().all())

        for item in DEFAULT_SCHEMA_FIELDS:
            if item["key"] not in existing_keys:
                field_obj = SchemaFieldDB(
                    key=item["key"],
                    label=item["label"],
                    category=item["category"],
                    description=item["description"],
                    field_type=item["field_type"],
                    order_index=item["order_index"],
                    is_active=True
                )
                session.add(field_obj)
            else:
                res_field = await session.execute(select(SchemaFieldDB).where(SchemaFieldDB.key == item["key"]))
                f = res_field.scalar_one_or_none()
                if f:
                    f.label = item["label"]
                    f.category = item["category"]
                    f.description = item["description"]
                    f.field_type = item["field_type"]
                    f.order_index = item["order_index"]
                    f.is_active = True
        await session.commit()

        # Check default model setting
        res = await session.execute(select(SettingDB).where(SettingDB.key == "model"))
        model_setting = res.scalar_one_or_none()
        if not model_setting:
            session.add(SettingDB(key="model", value="google/gemini-2.5-flash-lite:batch"))
            await session.commit()

        # Check OpenRouter API key from env if not already in DB
        res_key = await session.execute(select(SettingDB).where(SettingDB.key == "openrouter_api_key"))
        key_setting = res_key.scalar_one_or_none()
        env_key = os.getenv("OPENROUTER_API_KEY", "")
        if not key_setting and env_key:
            session.add(SettingDB(key="openrouter_api_key", value=env_key))
            await session.commit()
