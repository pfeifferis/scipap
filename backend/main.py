import os
import csv
import io
import json
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db, init_db, DATA_DIR
from models import (
    PaperDB, SchemaFieldDB, ExtractionDB, SettingDB,
    PaperOut, PaperCheckedUpdate, SchemaFieldOut, SchemaFieldCreate, SchemaFieldUpdate,
    ExtractionOut, ExtractionUpdate, ExtractionCreateManual, ExtractionAddCitation,
    SettingsOut, SettingsUpdate, ExtractRequest, BatchExtractRequest
)
import pdf_extractor
import llm_service

app = FastAPI(
    title="SciPap - Paper Extraction Tool API",
    version="1.0.0",
    description="Evidence-grounded literature extraction and interactive auditing API for scientific literature."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PAPERS_DIR = os.getenv("PAPERS_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "papers")))
os.makedirs(PAPERS_DIR, exist_ok=True)


def get_paper_real_filepath(paper: Optional[PaperDB]) -> Optional[str]:
    """Resolves paper filepath against PAPERS_DIR or existing path seamlessly."""
    if not paper or not paper.filepath:
        return None
    if os.path.exists(paper.filepath):
        return paper.filepath
    if paper.filename:
        candidate = os.path.join(PAPERS_DIR, paper.filename)
        if os.path.exists(candidate):
            return candidate
    candidate = os.path.join(PAPERS_DIR, os.path.basename(paper.filepath))
    if os.path.exists(candidate):
        return candidate
    return paper.filepath


@app.on_event("startup")
async def startup_event():
    await init_db()
    # Initial scan of papers folder
    async with (await anext(get_db())) as session:
        await sync_papers_folder(session)


async def sync_papers_folder(session: AsyncSession):
    """Scans the PAPERS_DIR folder and adds new PDF files to DB."""
    if not os.path.exists(PAPERS_DIR):
        return

    # Fix existing papers with invalid or legacy container filepaths
    all_papers_res = await session.execute(select(PaperDB))
    for p in all_papers_res.scalars().all():
        if not os.path.exists(p.filepath):
            corrected = os.path.join(PAPERS_DIR, p.filename)
            if os.path.exists(corrected):
                p.filepath = corrected

    existing_res = await session.execute(select(PaperDB.filename))
    existing_files = set(existing_res.scalars().all())

    for fname in os.listdir(PAPERS_DIR):
        if fname.lower().endswith(".pdf") and fname not in existing_files:
            fpath = os.path.join(PAPERS_DIR, fname)
            try:
                meta = pdf_extractor.get_pdf_metadata(fpath)
                file_size = os.path.getsize(fpath)
                new_paper = PaperDB(
                    filename=fname,
                    title=meta.get("title") or fname.replace(".pdf", "").replace("_", " ").replace("-", " ").title(),
                    filepath=fpath,
                    file_size=file_size,
                    num_pages=meta.get("num_pages", 0),
                    status="pending"
                )
                session.add(new_paper)
            except Exception as e:
                print(f"Error scanning PDF {fname}: {e}")
    await session.commit()



def serialize_extraction(ext: ExtractionDB) -> dict:
    rects = []
    if ext.rects:
        try:
            rects = json.loads(ext.rects)
        except Exception:
            rects = []

    citations = []
    if hasattr(ext, "citations") and ext.citations:
        try:
            citations = json.loads(ext.citations)
        except Exception:
            citations = []

    # If citations array is empty but legacy single quote exists, wrap it
    if not citations and ext.quote:
        citations = [{
            "quote": ext.quote,
            "page": ext.page,
            "rects": rects,
            "page_width": ext.page_width,
            "page_height": ext.page_height
        }]

    return {
        "id": ext.id,
        "paper_id": ext.paper_id,
        "field_key": ext.field_key,
        "value": ext.value,
        "edited_value": ext.edited_value,
        "display_value": ext.edited_value if ext.edited_value is not None else ext.value,
        "quote": ext.quote,
        "page": ext.page,
        "rects": rects,
        "page_width": ext.page_width,
        "page_height": ext.page_height,
        "citations": citations,
        "confidence": ext.confidence,
        "updated_at": ext.updated_at
    }


# ==================== PAPERS ENDPOINTS ====================

@app.get("/api/papers")
async def list_papers(sync: bool = False, db: AsyncSession = Depends(get_db)):
    if sync:
        await sync_papers_folder(db)
    result = await db.execute(select(PaperDB).order_by(PaperDB.created_at.desc()))
    papers = result.scalars().all()
    
    out = []
    for p in papers:
        # Load extractions
        ext_res = await db.execute(select(ExtractionDB).where(ExtractionDB.paper_id == p.id))
        extractions = [serialize_extraction(e) for e in ext_res.scalars().all()]
        out.append({
            "id": p.id,
            "filename": p.filename,
            "title": p.title,
            "filepath": p.filepath,
            "file_size": p.file_size,
            "num_pages": p.num_pages,
            "status": p.status,
            "is_checked": bool(p.is_checked),
            "error_message": p.error_message,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "extractions": extractions
        })
    return out


@app.post("/api/papers/scan")
async def scan_papers(db: AsyncSession = Depends(get_db)):
    await sync_papers_folder(db)
    return {"status": "ok", "message": "Folder scan completed"}


@app.post("/api/papers/upload")
async def upload_paper(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    dest_path = os.path.join(PAPERS_DIR, file.filename)
    with open(dest_path, "wb") as f:
        content = await file.read()
        f.write(content)

    meta = pdf_extractor.get_pdf_metadata(dest_path)
    file_size = os.path.getsize(dest_path)

    # Check if existing in DB
    res = await db.execute(select(PaperDB).where(PaperDB.filename == file.filename))
    paper = res.scalar_one_or_none()
    if not paper:
        paper = PaperDB(
            filename=file.filename,
            title=meta.get("title") or file.filename.replace(".pdf", "").replace("_", " ").title(),
            filepath=dest_path,
            file_size=file_size,
            num_pages=meta.get("num_pages", 0),
            status="pending"
        )
        db.add(paper)
    else:
        paper.filepath = dest_path
        paper.file_size = file_size
        paper.num_pages = meta.get("num_pages", 0)

    await db.commit()
    await db.refresh(paper)
    return {"status": "ok", "paper_id": paper.id, "filename": paper.filename}


@app.get("/api/papers/{paper_id}")
async def get_paper(paper_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PaperDB).where(PaperDB.id == paper_id))
    paper = res.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    ext_res = await db.execute(select(ExtractionDB).where(ExtractionDB.paper_id == paper_id))
    extractions = [serialize_extraction(e) for e in ext_res.scalars().all()]
    
    return {
        "id": paper.id,
        "filename": paper.filename,
        "title": paper.title,
        "filepath": paper.filepath,
        "file_size": paper.file_size,
        "num_pages": paper.num_pages,
        "status": paper.status,
        "is_checked": bool(paper.is_checked),
        "error_message": paper.error_message,
        "created_at": paper.created_at,
        "updated_at": paper.updated_at,
        "extractions": extractions
    }


@app.get("/api/papers/{paper_id}/pdf")
async def get_paper_pdf(paper_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PaperDB).where(PaperDB.id == paper_id))
    paper = res.scalar_one_or_none()
    real_path = get_paper_real_filepath(paper)
    if not paper or not real_path or not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    return FileResponse(
        real_path,
        media_type="application/pdf",
        filename=paper.filename,
        headers={"Content-Disposition": f'inline; filename="{paper.filename}"'}
    )


@app.get("/api/papers/{paper_id}/search")
async def search_paper_keywords(
    paper_id: int,
    q: str = Query("", description="Keyword or phrase to search"),
    case_sensitive: bool = Query(False, description="Case-sensitive search flag"),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(PaperDB).where(PaperDB.id == paper_id))
    paper = res.scalar_one_or_none()
    real_path = get_paper_real_filepath(paper)
    if not paper or not real_path or not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="Paper or PDF file not found")

    result = pdf_extractor.search_pdf_keywords(
        pdf_path=real_path,
        query=q,
        case_sensitive=case_sensitive
    )
    result["paper_id"] = paper.id

    result["paper_title"] = paper.title
    return result


@app.patch("/api/papers/{paper_id}/checked")
async def toggle_paper_checked(
    paper_id: int,
    payload: Optional[PaperCheckedUpdate] = None,
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(PaperDB).where(PaperDB.id == paper_id))
    paper = res.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    if payload is not None and payload.is_checked is not None:
        paper.is_checked = payload.is_checked
    else:
        paper.is_checked = not bool(paper.is_checked)

    await db.commit()
    await db.refresh(paper)
    return {"status": "ok", "paper_id": paper.id, "is_checked": paper.is_checked}



# ==================== SCHEMA ENDPOINTS ====================

@app.get("/api/schema", response_model=List[SchemaFieldOut])
async def get_schema(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SchemaFieldDB).order_by(SchemaFieldDB.order_index))
    return res.scalars().all()


@app.post("/api/schema", response_model=SchemaFieldOut)
async def create_schema_field(field_in: SchemaFieldCreate, db: AsyncSession = Depends(get_db)):
    # Check if key already exists
    res = await db.execute(select(SchemaFieldDB).where(SchemaFieldDB.key == field_in.key))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Field key '{field_in.key}' already exists.")
    
    new_field = SchemaFieldDB(**field_in.model_dump())
    db.add(new_field)
    await db.commit()
    await db.refresh(new_field)
    return new_field


@app.put("/api/schema/{field_id}", response_model=SchemaFieldOut)
async def update_schema_field(field_id: int, field_in: SchemaFieldUpdate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SchemaFieldDB).where(SchemaFieldDB.id == field_id))
    field = res.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    update_data = field_in.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(field, k, v)
        
    await db.commit()
    await db.refresh(field)
    return field


@app.delete("/api/schema/{field_id}")
async def delete_schema_field(field_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SchemaFieldDB).where(SchemaFieldDB.id == field_id))
    field = res.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    await db.delete(field)
    await db.commit()
    return {"status": "ok", "message": f"Deleted field {field.label}"}


# ==================== EXTRACTION ENDPOINTS ====================

def prepare_fields_dict(fields: List[SchemaFieldDB]) -> List[Dict[str, Any]]:
    return [
        {
            "key": f.key,
            "label": f.label,
            "description": f.description or "",
            "category": f.category or "General",
            "field_type": f.field_type or "text"
        }
        for f in fields
    ]


def resolve_item_citations(pdf_path: str, item: dict, val: Optional[str] = None):
    """
    Normalizes single/multiple quotes or citations from LLM output into a list of
    resolved citation objects: [{"quote": ..., "page": ..., "rects": ..., "page_width": ..., "page_height": ...}]
    Returns (resolved_citations, primary_location)
    """
    raw_citations = []
    
    # 1. Collect candidate citation inputs
    if "citations" in item and isinstance(item["citations"], list):
        for c in item["citations"]:
            if isinstance(c, dict) and c.get("quote"):
                raw_citations.append({"quote": c.get("quote"), "page": c.get("page")})
            elif isinstance(c, str) and c.strip():
                raw_citations.append({"quote": c.strip(), "page": item.get("page")})
    elif "quotes" in item and isinstance(item["quotes"], list):
        for q in item["quotes"]:
            if isinstance(q, str) and q.strip():
                raw_citations.append({"quote": q.strip(), "page": item.get("page")})
            elif isinstance(q, dict) and q.get("quote"):
                raw_citations.append({"quote": q.get("quote"), "page": q.get("page", item.get("page"))})
    elif item.get("quote"):
        raw_citations.append({"quote": item.get("quote"), "page": item.get("page")})

    # If no quotes were provided at all, but we have a value, try fallback on value
    if not raw_citations and val and len(str(val).strip()) >= 3:
        raw_citations.append({"quote": None, "page": item.get("page")})

    resolved_citations = []
    primary_loc = None

    for c_item in raw_citations:
        q_text = c_item.get("quote")
        h_page = c_item.get("page")
        loc = pdf_extractor.find_quote_location(pdf_path, quote=q_text, hint_page=h_page, fallback_value=val)
        
        final_quote = q_text or (loc.get("matched_quote") if loc else val)
        final_page = loc.get("page") if loc else h_page
        final_rects = loc.get("rects", []) if loc else []
        final_pw = loc.get("page_width") if loc else None
        final_ph = loc.get("page_height") if loc else None

        if final_quote:
            cit_obj = {
                "quote": final_quote,
                "page": final_page,
                "rects": final_rects,
                "page_width": final_pw,
                "page_height": final_ph
            }
            resolved_citations.append(cit_obj)
            if not primary_loc and loc:
                primary_loc = loc

    return resolved_citations, primary_loc


@app.post("/api/papers/{paper_id}/extract")
@app.post("/api/extract/{paper_id}")
async def extract_paper(
    paper_id: int,
    req: Optional[ExtractRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    paper_res = await db.execute(select(PaperDB).where(PaperDB.id == paper_id))
    paper = paper_res.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    pdf_real_path = get_paper_real_filepath(paper)
    if not pdf_real_path or not os.path.exists(pdf_real_path):
        raise HTTPException(status_code=404, detail=f"PDF file not found at {paper.filepath}")

    # Fetch API Key
    key_res = await db.execute(select(SettingDB).where(SettingDB.key == "openrouter_api_key"))
    key_setting = key_res.scalar_one_or_none()
    api_key = key_setting.value if key_setting and key_setting.value else os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key is not configured.")

    # Fetch model setting
    model_res = await db.execute(select(SettingDB).where(SettingDB.key == "model"))
    model_setting = model_res.scalar_one_or_none()
    model = (req.model if req and req.model else None) or (model_setting.value if model_setting else "google/gemini-2.5-flash-lite:batch")

    # Fetch system prompt
    prompt_res = await db.execute(select(SettingDB).where(SettingDB.key == "system_prompt"))
    prompt_setting = prompt_res.scalar_one_or_none()
    system_prompt = prompt_setting.value if prompt_setting else None

    # Fetch active schema fields
    schema_query = select(SchemaFieldDB).where(SchemaFieldDB.is_active == True).order_by(SchemaFieldDB.order_index)
    if req and req.field_keys:
        schema_query = schema_query.where(SchemaFieldDB.key.in_(req.field_keys))
    schema_res = await db.execute(schema_query)
    fields = schema_res.scalars().all()

    if not fields:
        raise HTTPException(status_code=400, detail="No active fields defined for extraction.")

    fields_dict = prepare_fields_dict(fields)

    # Update paper status
    paper.status = "extracting"
    paper.error_message = None
    await db.commit()

    try:
        # 1. Extract text with page markers
        print(f"[EXTRACT] Reading PDF text from {pdf_real_path}...", flush=True)
        paper_text = pdf_extractor.extract_text_for_llm(pdf_real_path)
        print(f"[EXTRACT] Extracted {len(paper_text)} characters from PDF.", flush=True)

        # 2. Call OpenRouter LLM
        extracted_items = await llm_service.extract_paper_data(
            api_key=api_key,
            model=model,
            paper_text=paper_text,
            fields=fields_dict,
            system_prompt=system_prompt
        )

        if not extracted_items:
            paper.status = "error"
            paper.error_message = "No fields could be extracted from this paper. Please retry extraction."
            await db.commit()
            raise HTTPException(status_code=500, detail="No fields could be extracted from this paper.")

        # 3. Locate quotes in PDF and save extractions (supporting multiple citations)
        print(f"[EXTRACT] Resolving text citations and coordinates for {len(extracted_items)} fields...", flush=True)
        for item in extracted_items:
            f_key = item.get("field_key")
            val = item.get("value")
            confidence = item.get("confidence", 1.0)

            # Resolve all citations (single or multiple)
            resolved_citations, primary_loc = resolve_item_citations(pdf_real_path, item, val=val)
            citations_json = json.dumps(resolved_citations) if resolved_citations else None

            primary_cit = resolved_citations[0] if resolved_citations else {}
            quote = primary_cit.get("quote") or item.get("quote")
            page_num = primary_cit.get("page") or item.get("page")
            rects_json = json.dumps(primary_cit.get("rects", [])) if primary_cit.get("rects") else None
            p_width = primary_cit.get("page_width")
            p_height = primary_cit.get("page_height")

            # Upsert into ExtractionDB
            ext_q = await db.execute(
                select(ExtractionDB).where(ExtractionDB.paper_id == paper.id, ExtractionDB.field_key == f_key)
            )
            existing_ext = ext_q.scalar_one_or_none()

            val_to_save = val if val and val != "null" else "NR"

            if existing_ext:
                existing_ext.value = val_to_save
                existing_ext.quote = quote
                existing_ext.page = page_num
                existing_ext.rects = rects_json
                existing_ext.page_width = p_width
                existing_ext.page_height = p_height
                existing_ext.citations = citations_json
                existing_ext.confidence = confidence
            else:
                new_ext = ExtractionDB(
                    paper_id=paper.id,
                    field_key=f_key,
                    value=val_to_save,
                    quote=quote,
                    page=page_num,
                    rects=rects_json,
                    page_width=p_width,
                    page_height=p_height,
                    citations=citations_json,
                    confidence=confidence
                )
                db.add(new_ext)


        paper.status = "extracted"
        paper.error_message = None
        await db.commit()
        print(f"[EXTRACT] Extraction completed successfully for paper {paper.id} ({paper.filename}).", flush=True)

        # Return updated paper with extractions
        ext_res = await db.execute(select(ExtractionDB).where(ExtractionDB.paper_id == paper.id))
        all_exts = [serialize_extraction(e) for e in ext_res.scalars().all()]
        return {"status": "ok", "paper_id": paper.id, "extractions": all_exts}

    except Exception as e:
        import traceback
        traceback.print_exc()
        paper.status = "error"
        paper.error_message = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

@app.post("/api/extract-batch")
async def extract_batch_papers(req: Optional[BatchExtractRequest] = None, db: AsyncSession = Depends(get_db)):
    """
    Extracts all papers or selected papers in a single batch operation using OpenRouter.
    """
    # 1. Fetch papers to process
    if req and req.paper_ids:
        query = select(PaperDB).where(PaperDB.id.in_(req.paper_ids))
    elif req and req.include_already_extracted:
        query = select(PaperDB)
    else:
        # By default, process pending or errored papers (or all if none extracted yet)
        query = select(PaperDB).where(PaperDB.status != "extracted")

    res = await db.execute(query)
    papers = res.scalars().all()

    # Fallback: if no pending papers and no specific IDs provided, take all papers
    if not papers and (not req or not req.paper_ids):
        res_all = await db.execute(select(PaperDB))
        papers = res_all.scalars().all()

    if not papers:
        return {"status": "ok", "message": "No papers found to extract", "processed_count": 0}

    # 2. Fetch settings
    key_res = await db.execute(select(SettingDB).where(SettingDB.key == "openrouter_api_key"))
    api_key_setting = key_res.scalar_one_or_none()
    api_key = (api_key_setting.value if api_key_setting else "") or os.getenv("OPENROUTER_API_KEY", "")

    if not api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API Key is not configured. Please add it in Settings.")

    model_res = await db.execute(select(SettingDB).where(SettingDB.key == "model"))
    model_setting = model_res.scalar_one_or_none()
    model = (req.model if req and req.model else None) or (model_setting.value if model_setting else "google/gemini-2.5-flash-lite:batch")

    prompt_res = await db.execute(select(SettingDB).where(SettingDB.key == "system_prompt"))
    prompt_setting = prompt_res.scalar_one_or_none()
    system_prompt = prompt_setting.value if prompt_setting else None

    # 3. Fetch active schema fields
    schema_res = await db.execute(select(SchemaFieldDB).where(SchemaFieldDB.is_active == True).order_by(SchemaFieldDB.order_index))
    fields = schema_res.scalars().all()
    if not fields:
        raise HTTPException(status_code=400, detail="No active fields defined for extraction.")

    fields_dict = prepare_fields_dict(fields)

    # 4. Extract text from each paper and set status to extracting
    papers_data = []
    for p in papers:
        p_real_path = get_paper_real_filepath(p)
        if p_real_path and os.path.exists(p_real_path):
            p.status = "extracting"
            p.error_message = None
            text = pdf_extractor.extract_text_for_llm(p_real_path)
            papers_data.append({"paper_id": p.id, "paper_text": text, "paper_obj": p, "real_path": p_real_path})

    await db.commit()

    # 5. Call batch LLM extraction service
    try:
        results_map = await llm_service.extract_multiple_papers_batch(
            api_key=api_key,
            model=model,
            papers_data=[{"paper_id": item["paper_id"], "paper_text": item["paper_text"]} for item in papers_data],
            fields=fields_dict,
            system_prompt=system_prompt
        )

        # 6. Save extractions & locate quotes
        for item in papers_data:
            p = item["paper_obj"]
            p_real_path = item["real_path"]
            extracted_items = results_map.get(p.id, [])

            if not extracted_items:
                p.status = "error"
                p.error_message = "No extraction fields returned by LLM. Please retry."
                continue

            for ext_data in extracted_items:
                f_key = ext_data.get("field_key")
                val = ext_data.get("value")
                confidence = ext_data.get("confidence", 1.0)

                # Resolve all citations (single or multiple)
                resolved_citations, primary_loc = resolve_item_citations(p_real_path, ext_data, val=val)
                citations_json = json.dumps(resolved_citations) if resolved_citations else None

                primary_cit = resolved_citations[0] if resolved_citations else {}
                quote = primary_cit.get("quote") or ext_data.get("quote")
                page_num = primary_cit.get("page") or ext_data.get("page")
                rects_json = json.dumps(primary_cit.get("rects", [])) if primary_cit.get("rects") else None
                p_width = primary_cit.get("page_width")
                p_height = primary_cit.get("page_height")

                ext_q = await db.execute(
                    select(ExtractionDB).where(ExtractionDB.paper_id == p.id, ExtractionDB.field_key == f_key)
                )
                existing_ext = ext_q.scalar_one_or_none()

                val_to_save = val if val and val != "null" else "NR"

                if existing_ext:
                    existing_ext.value = val_to_save
                    existing_ext.quote = quote
                    existing_ext.page = page_num
                    existing_ext.rects = rects_json
                    existing_ext.page_width = p_width
                    existing_ext.page_height = p_height
                    existing_ext.citations = citations_json
                    existing_ext.confidence = confidence
                else:
                    new_ext = ExtractionDB(
                        paper_id=p.id,
                        field_key=f_key,
                        value=val_to_save,
                        quote=quote,
                        page=page_num,
                        rects=rects_json,
                        page_width=p_width,
                        page_height=p_height,
                        citations=citations_json,
                        confidence=confidence
                    )
                    db.add(new_ext)


            p.status = "extracted"
            p.error_message = None

        await db.commit()
        return {
            "status": "ok",
            "processed_count": len(papers_data),
            "paper_ids": [item["paper_id"] for item in papers_data]
        }

    except Exception as e:
        for item in papers_data:
            p = item["paper_obj"]
            p.status = "error"
            p.error_message = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Batch extraction failed: {str(e)}")


@app.put("/api/extractions/{extraction_id}")
async def update_extraction(extraction_id: int, payload: ExtractionUpdate, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ExtractionDB).where(ExtractionDB.id == extraction_id))
    ext = res.scalar_one_or_none()
    if not ext:
        raise HTTPException(status_code=404, detail="Extraction record not found")

    if payload.edited_value is not None:
        ext.edited_value = payload.edited_value

    # If quote was manually edited or provided, re-attempt coordinate search
    if payload.quote is not None:
        ext.quote = payload.quote
        paper_res = await db.execute(select(PaperDB).where(PaperDB.id == ext.paper_id))
        paper = paper_res.scalar_one_or_none()
        real_path = get_paper_real_filepath(paper)
        if paper and real_path and os.path.exists(real_path):
            loc = pdf_extractor.find_quote_location(real_path, payload.quote, hint_page=payload.page)
            if loc:
                ext.page = loc["page"]
                ext.rects = json.dumps(loc["rects"])
                ext.page_width = loc["page_width"]
                ext.page_height = loc["page_height"]

    if payload.page is not None:
        ext.page = payload.page
    if payload.citations is not None:
        ext.citations = json.dumps([c.dict() for c in payload.citations])

    await db.commit()
    await db.refresh(ext)
    return serialize_extraction(ext)


@app.post("/api/extractions/{extraction_id}/citations")
async def add_extraction_citation(
    extraction_id: int,
    payload: ExtractionAddCitation,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually add a citation snippet to an existing extraction item,
    automatically finding coordinates in the PDF.
    """
    res = await db.execute(select(ExtractionDB).where(ExtractionDB.id == extraction_id))
    ext = res.scalar_one_or_none()
    if not ext:
        raise HTTPException(status_code=404, detail="Extraction record not found")

    paper_res = await db.execute(select(PaperDB).where(PaperDB.id == ext.paper_id))
    paper = paper_res.scalar_one_or_none()
    real_path = get_paper_real_filepath(paper)
    if not paper or not real_path or not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="Underlying paper PDF not found")

    # Locate quote in PDF
    loc = pdf_extractor.find_quote_location(real_path, quote=payload.quote, hint_page=payload.page)
    new_citation = {
        "quote": payload.quote.strip(),
        "page": loc.get("page") if loc else payload.page,
        "rects": loc.get("rects", []) if loc else [],
        "page_width": loc.get("page_width") if loc else None,
        "page_height": loc.get("page_height") if loc else None
    }

    # Unpack existing citations
    existing_citations = []
    if ext.citations:
        try:
            existing_citations = json.loads(ext.citations)
        except Exception:
            existing_citations = []
    elif ext.quote:
        existing_citations = [{
            "quote": ext.quote,
            "page": ext.page,
            "rects": json.loads(ext.rects) if ext.rects else [],
            "page_width": ext.page_width,
            "page_height": ext.page_height
        }]

    existing_citations.append(new_citation)
    ext.citations = json.dumps(existing_citations)

    # If primary quote is empty, assign it
    if not ext.quote:
        ext.quote = new_citation["quote"]
        ext.page = new_citation["page"]
        ext.rects = json.dumps(new_citation["rects"]) if new_citation["rects"] else None
        ext.page_width = new_citation["page_width"]
        ext.page_height = new_citation["page_height"]

    await db.commit()
    await db.refresh(ext)
    return serialize_extraction(ext)


@app.delete("/api/extractions/{extraction_id}/citations/{citation_index}")
async def delete_extraction_citation(
    extraction_id: int,
    citation_index: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Remove a citation at a specific index from an extraction item.
    """
    res = await db.execute(select(ExtractionDB).where(ExtractionDB.id == extraction_id))
    ext = res.scalar_one_or_none()
    if not ext:
        raise HTTPException(status_code=404, detail="Extraction record not found")

    existing_citations = []
    if ext.citations:
        try:
            existing_citations = json.loads(ext.citations)
        except Exception:
            existing_citations = []

    if 0 <= citation_index < len(existing_citations):
        existing_citations.pop(citation_index)
        ext.citations = json.dumps(existing_citations)

        # Update primary quote if needed
        if existing_citations:
            ext.quote = existing_citations[0].get("quote")
            ext.page = existing_citations[0].get("page")
            ext.rects = json.dumps(existing_citations[0].get("rects", [])) if existing_citations[0].get("rects") else None
            ext.page_width = existing_citations[0].get("page_width")
            ext.page_height = existing_citations[0].get("page_height")
        else:
            ext.quote = None
            ext.page = None
            ext.rects = None
            ext.page_width = None
            ext.page_height = None

        await db.commit()
        await db.refresh(ext)

    return serialize_extraction(ext)


# ==================== SETTINGS ENDPOINTS ====================

@app.get("/api/settings", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    key_res = await db.execute(select(SettingDB).where(SettingDB.key == "openrouter_api_key"))
    key_row = key_res.scalar_one_or_none()
    has_key = bool((key_row and key_row.value) or os.getenv("OPENROUTER_API_KEY"))

    model_res = await db.execute(select(SettingDB).where(SettingDB.key == "model"))
    model_row = model_res.scalar_one_or_none()
    model = model_row.value if model_row and model_row.value else "google/gemini-2.5-flash-lite:batch"

    prompt_res = await db.execute(select(SettingDB).where(SettingDB.key == "system_prompt"))
    prompt_row = prompt_res.scalar_one_or_none()
    prompt = prompt_row.value if prompt_row else llm_service.DEFAULT_EXTRACTION_SYSTEM_PROMPT

    return SettingsOut(
        openrouter_api_key_set=has_key,
        model=model,
        system_prompt=prompt
    )


@app.post("/api/settings")
async def save_settings(payload: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    if payload.openrouter_api_key is not None:
        key_res = await db.execute(select(SettingDB).where(SettingDB.key == "openrouter_api_key"))
        row = key_res.scalar_one_or_none()
        if not row:
            db.add(SettingDB(key="openrouter_api_key", value=payload.openrouter_api_key.strip()))
        else:
            row.value = payload.openrouter_api_key.strip()

    if payload.model is not None:
        model_res = await db.execute(select(SettingDB).where(SettingDB.key == "model"))
        row = model_res.scalar_one_or_none()
        if not row:
            db.add(SettingDB(key="model", value=payload.model.strip()))
        else:
            row.value = payload.model.strip()

    if payload.system_prompt is not None:
        prompt_res = await db.execute(select(SettingDB).where(SettingDB.key == "system_prompt"))
        row = prompt_res.scalar_one_or_none()
        if not row:
            db.add(SettingDB(key="system_prompt", value=payload.system_prompt))
        else:
            row.value = payload.system_prompt

    await db.commit()
    return {"status": "ok", "message": "Settings saved successfully"}


# ==================== EXPORT ENDPOINT ====================

@app.get("/api/export")
async def export_data(
    format: str = Query("csv", regex="^(csv|json)$"),
    paper_id: Optional[int] = None,
    checked_only: bool = Query(False, description="Export only papers marked as checked"),
    db: AsyncSession = Depends(get_db)
):
    # Fetch active fields for column ordering
    fields_res = await db.execute(select(SchemaFieldDB).order_by(SchemaFieldDB.order_index))
    fields = fields_res.scalars().all()
    field_map = {f.key: f.label for f in fields}

    # Fetch papers
    paper_query = select(PaperDB)
    if paper_id:
        paper_query = paper_query.where(PaperDB.id == paper_id)
    elif checked_only:
        paper_query = paper_query.where(PaperDB.is_checked == True)

    paper_res = await db.execute(paper_query)
    papers = paper_res.scalars().all()

    export_rows = []
    for p in papers:
        ext_res = await db.execute(select(ExtractionDB).where(ExtractionDB.paper_id == p.id))
        extractions = {e.field_key: e for e in ext_res.scalars().all()}
        
        row_data = {
            "paper_id": p.id,
            "filename": p.filename,
            "paper_title": p.title,
            "status": p.status,
            "manually_checked": "Yes" if p.is_checked else "No"
        }
        for f in fields:
            ext = extractions.get(f.key)
            raw_v = ext.edited_value if ext and ext.edited_value is not None and ext.edited_value != "" else (ext.value if ext and ext.value else "")
            final_val = raw_v.strip() if raw_v else "NR"
            if final_val.lower() in ("null", "none", "not reported", "not applicable", ""):
                final_val = "NR"
            row_data[f.label] = final_val

        export_rows.append(row_data)


    if format == "json":
        return JSONResponse(content=export_rows)

    # CSV Format
    output = io.StringIO()
    if export_rows:
        fieldnames = list(export_rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for r in export_rows:
            writer.writerow(r)
    else:
        # If no rows, output schema column headers
        base_headers = ["paper_id", "filename", "paper_title", "status", "manually_checked"] + [f.label for f in fields]
        writer = csv.DictWriter(output, fieldnames=base_headers)
        writer.writeheader()

    csv_data = output.getvalue()
    
    if paper_id:
        filename = f"paper_{paper_id}_extractions.csv"
    elif checked_only:
        filename = "scipap_extractions_checked.csv"
    else:
        filename = "scipap_extractions_all.csv"

    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

