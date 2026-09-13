import json
from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class PaperDB(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    filename = Column(String(255), unique=True, index=True, nullable=False)
    title = Column(String(500), nullable=True)
    filepath = Column(String(1000), nullable=False)
    file_size = Column(Integer, default=0)
    num_pages = Column(Integer, default=0)
    status = Column(String(50), default="pending")  # pending, extracting, extracted, error
    is_checked = Column(Boolean, default=False, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    extractions = relationship("ExtractionDB", back_populates="paper", cascade="all, delete-orphan")


class SchemaFieldDB(Base):
    __tablename__ = "schema_fields"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    label = Column(String(200), nullable=False)
    description = Column(Text, default="")
    category = Column(String(150), default="General")
    field_type = Column(String(50), default="text")
    order_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class ExtractionDB(Base):
    __tablename__ = "extractions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), index=True, nullable=False)
    field_key = Column(String(100), index=True, nullable=False)
    value = Column(Text, nullable=True)
    edited_value = Column(Text, nullable=True)
    quote = Column(Text, nullable=True)
    page = Column(Integer, nullable=True)  # 1-indexed page number
    rects = Column(Text, nullable=True)  # JSON-encoded array of [[x0, y0, x1, y1], ...]
    page_width = Column(Float, nullable=True)
    page_height = Column(Float, nullable=True)
    citations = Column(Text, nullable=True)  # JSON-encoded array of citation objects
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    paper = relationship("PaperDB", back_populates="extractions")


class SettingDB(Base):
    __tablename__ = "settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=True)


# Pydantic Schemas

class SchemaFieldBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = ""
    category: Optional[str] = "General"
    field_type: Optional[str] = "text"
    order_index: Optional[int] = 0
    is_active: Optional[bool] = True

class SchemaFieldCreate(SchemaFieldBase):
    pass

class SchemaFieldUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    field_type: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None

class SchemaFieldOut(SchemaFieldBase):
    id: int
    class Config:
        from_attributes = True


class CitationItem(BaseModel):
    quote: str
    page: Optional[int] = None
    rects: Optional[List[List[float]]] = None
    page_width: Optional[float] = None
    page_height: Optional[float] = None


class ExtractionRect(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float

class ExtractionOut(BaseModel):
    id: int
    paper_id: int
    field_key: str
    value: Optional[str] = None
    edited_value: Optional[str] = None
    display_value: Optional[str] = None  # computed: edited_value if present else value
    quote: Optional[str] = None
    page: Optional[int] = None
    rects: Optional[List[List[float]]] = None  # list of [x0, y0, x1, y1]
    page_width: Optional[float] = None
    page_height: Optional[float] = None
    citations: Optional[List[CitationItem]] = None
    confidence: Optional[float] = 1.0
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExtractionUpdate(BaseModel):
    edited_value: Optional[str] = None
    quote: Optional[str] = None
    page: Optional[int] = None
    rects: Optional[List[List[float]]] = None
    citations: Optional[List[CitationItem]] = None


class ExtractionAddCitation(BaseModel):
    quote: str
    page: Optional[int] = None


class ExtractionCreateManual(BaseModel):
    field_key: str
    value: str
    quote: Optional[str] = None
    page: Optional[int] = None
    rects: Optional[List[List[float]]] = None


class PaperBase(BaseModel):
    filename: str
    title: Optional[str] = None
    num_pages: int = 0
    file_size: int = 0
    status: str = "pending"
    is_checked: bool = False

class PaperCheckedUpdate(BaseModel):
    is_checked: Optional[bool] = None

class PaperOut(PaperBase):
    id: int
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None
    extractions: List[ExtractionOut] = []

    class Config:
        from_attributes = True


class SettingsOut(BaseModel):
    openrouter_api_key_set: bool
    model: str
    system_prompt: Optional[str] = None

class SettingsUpdate(BaseModel):
    openrouter_api_key: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None


class ExtractRequest(BaseModel):
    paper_id: Optional[int] = None
    model: Optional[str] = None
    field_keys: Optional[List[str]] = None  # if None, extracts all active fields


class BatchExtractRequest(BaseModel):
    paper_ids: Optional[List[int]] = None  # if None, extracts all pending or all papers
    model: Optional[str] = None
    include_already_extracted: Optional[bool] = False
