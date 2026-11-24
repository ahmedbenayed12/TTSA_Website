"""Pydantic schemas for request/response validation.

Each schema corresponds to an ORM model or a specific API operation.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Field Mapping
# ---------------------------------------------------------------------------

class FieldMapping(BaseModel):
    """Describes one dynamic text field to overlay on a PDF page."""

    field_name: str = Field(..., description="Column name from the Excel sheet")
    label: str = Field("", description="Human-readable label shown in the UI")
    x: float = Field(..., description="X coordinate (points) on the page")
    y: float = Field(..., description="Y coordinate (points) on the page")
    page: int = Field(0, description="Zero-based page index")
    font: str = Field("Helvetica", description="Font name (built-in or file name)")
    font_size: float = Field(12.0, description="Font size in points")
    color: int = Field(0x000000, description="Color as 24-bit int (e.g. 0x000000)")
    alignment: str = Field("center", description="left / center / right")
    max_width: float = Field(0.0, description="Max text width in pts; 0 = no wrap")
    is_bold: bool = False
    is_italic: bool = False


# ---------------------------------------------------------------------------
# PDF Template
# ---------------------------------------------------------------------------

class PdfTemplateOut(BaseModel):
    """Serialised PdfTemplate returned by the API."""

    id: int
    name: str
    original_filename: str
    path: str
    page_count: int
    has_acroform: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Attestation Type
# ---------------------------------------------------------------------------

class AttestationTypeCreate(BaseModel):
    """Payload to create a new attestation type."""

    name: str
    template_id: Optional[int] = None
    field_mappings: list[FieldMapping] = Field(default_factory=list)
    email_subject: str = "Your Certificate"
    email_body: str = "Dear {{name}},\n\nPlease find your certificate attached.\n\nBest regards"
    filename_pattern: str = "Certificate_{{name}}.pdf"
    description: str = ""
    email_column: str = "Email"
    name_column: str = "Author"
    sheet_name: str = ""


class AttestationTypeUpdate(BaseModel):
    """Payload to update an existing attestation type (all fields optional)."""

    name: Optional[str] = None
    template_id: Optional[int] = None
    field_mappings: Optional[list[FieldMapping]] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    filename_pattern: Optional[str] = None
    description: Optional[str] = None
    email_column: Optional[str] = None
    name_column: Optional[str] = None
    sheet_name: Optional[str] = None


class AttestationTypeOut(BaseModel):
    """Serialised AttestationType returned by the API."""

    id: int
    name: str
    template_id: Optional[int]
    field_mappings: str  # raw JSON string — parsed by the client
    email_subject: str
    email_body: str
    filename_pattern: str
    description: str
    email_column: str
    name_column: str
    sheet_name: str
    created_at: datetime
    updated_at: datetime
    template: Optional[PdfTemplateOut] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Send Job
# ---------------------------------------------------------------------------

class SendJobOut(BaseModel):
    """Serialised SendJob returned by the API."""

    id: int
    type_id: Optional[int]
    excel_path: str
    total_rows: int
    sent_count: int
    failed_count: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Send Log
# ---------------------------------------------------------------------------

class SendLogOut(BaseModel):
    """Serialised SendLog returned by the API."""

    id: int
    job_id: int
    row_index: int
    recipient_email: str
    recipient_name: str
    status: str
    error_message: str
    generated_pdf_path: str
    sent_at: Optional[datetime]
    row_data: str  # raw JSON string

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Gmail / SMTP Config
# ---------------------------------------------------------------------------

class GmailConfigSMTP(BaseModel):
    """Payload for configuring SMTP credentials."""

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    sender_email: Optional[str] = ""


class GmailConfigOut(BaseModel):
    """Serialised GmailConfig returned by the API (no secrets exposed)."""

    id: int
    auth_type: str
    sender_email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Excel Validation
# ---------------------------------------------------------------------------

class ValidationError(BaseModel):
    """Single row-level validation problem."""

    row_index: int
    field: str
    message: str


class ExcelValidationResult(BaseModel):
    """Summary of Excel validation results."""

    valid_rows: int
    errors: list[ValidationError] = Field(default_factory=list)
    warnings: list[ValidationError] = Field(default_factory=list)


class ExcelFileOut(BaseModel):
    """Metadata for an uploaded Excel workbook."""

    id: int
    filename: str
    file_path: str
    sheet_names: list[str] = Field(default_factory=list)
    total_rows: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

class GeneratePreviewRequest(BaseModel):
    """Request to render a single-row PDF preview."""

    job_id: int
    row_index: int
    type_id: int


class GenerateBatchRequest(BaseModel):
    """Request to generate PDFs for all rows of a job."""

    job_id: int
    type_id: int


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

class SendTestRequest(BaseModel):
    """Request to send a test email to a specific address."""

    job_id: int
    row_index: int
    test_email: str


class StartSendRequest(BaseModel):
    """Body for starting a bulk-send job."""

    type_id: int


class RetrySendRequest(BaseModel):
    """Body for retrying failed rows."""

    type_id: Optional[int] = None


# ---------------------------------------------------------------------------
# SSE Progress
# ---------------------------------------------------------------------------

class ProgressEvent(BaseModel):
    """Payload emitted via Server-Sent Events during a send job."""

    job_id: int
    total: int
    sent: int
    failed: int
    current_row: int
    status: str
    current_email: str = ""
