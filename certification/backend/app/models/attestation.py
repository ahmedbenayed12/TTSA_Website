"""SQLAlchemy ORM models for the attestation bulk-send application.

Tables
------
pdf_templates        - Uploaded PDF template files
attestation_types    - Certificate type configurations (field mappings, email templates)
send_jobs            - Bulk-send job tracking
send_logs            - Per-recipient send status
gmail_config         - Stored email sending credentials
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# PdfTemplate
# ---------------------------------------------------------------------------

class PdfTemplate(Base):
    """Uploaded PDF template used to stamp certificates."""

    __tablename__ = "pdf_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    # Relative path under upload_dir
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=1)
    has_acroform: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    # Back-reference from AttestationType
    attestation_types: Mapped[list[AttestationType]] = relationship(
        "AttestationType", back_populates="template", lazy="select"
    )


# ---------------------------------------------------------------------------
# AttestationType
# ---------------------------------------------------------------------------

class AttestationType(Base):
    """Configuration for one kind of certificate (Conference, Eposter, etc.)."""

    __tablename__ = "attestation_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("pdf_templates.id", ondelete="SET NULL"), nullable=True
    )

    # JSON string: list of FieldMapping dicts
    field_mappings: Mapped[str] = mapped_column(Text, default="[]")

    # Email composition
    email_subject: Mapped[str] = mapped_column(
        String(500), default="Your Certificate"
    )
    email_body: Mapped[str] = mapped_column(
        Text,
        default="Dear {{name}},\n\nPlease find your certificate attached.\n\nBest regards",
    )

    # PDF filename pattern — supports {{column_name}} placeholders
    filename_pattern: Mapped[str] = mapped_column(
        String(500), default="Certificate_{{name}}.pdf"
    )

    description: Mapped[str] = mapped_column(Text, default="")

    # Excel column that contains the recipient e-mail address
    email_column: Mapped[str] = mapped_column(String(255), default="Email")
    # Excel column that contains the recipient display name
    name_column: Mapped[str] = mapped_column(String(255), default="Author")
    # If set, only process this sheet from a multi-sheet workbook
    sheet_name: Mapped[str] = mapped_column(String(255), default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    template: Mapped[PdfTemplate | None] = relationship(
        "PdfTemplate", back_populates="attestation_types", lazy="select"
    )
    send_jobs: Mapped[list[SendJob]] = relationship(
        "SendJob", back_populates="attestation_type", lazy="select"
    )


# ---------------------------------------------------------------------------
# SendJob
# ---------------------------------------------------------------------------

class SendJob(Base):
    """Tracks a bulk-send operation initiated from one Excel file."""

    __tablename__ = "send_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("attestation_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Relative path of the uploaded Excel file
    excel_path: Mapped[str] = mapped_column(String(1024), default="")
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    # pending / running / done / partial / error
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    attestation_type: Mapped[AttestationType | None] = relationship(
        "AttestationType", back_populates="send_jobs", lazy="select"
    )
    send_logs: Mapped[list[SendLog]] = relationship(
        "SendLog", back_populates="send_job", lazy="select", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# SendLog
# ---------------------------------------------------------------------------

class SendLog(Base):
    """Per-recipient record within a SendJob."""

    __tablename__ = "send_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("send_jobs.id", ondelete="CASCADE"), nullable=False
    )
    row_index: Mapped[int] = mapped_column(Integer, default=0)
    recipient_email: Mapped[str] = mapped_column(String(512), default="")
    recipient_name: Mapped[str] = mapped_column(String(512), default="")
    # pending / sent / failed / skipped
    status: Mapped[str] = mapped_column(String(50), default="pending")
    error_message: Mapped[str] = mapped_column(Text, default="")
    # Relative path of the generated PDF under generated_dir
    generated_pdf_path: Mapped[str] = mapped_column(Text, default="")
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    # Full JSON of the source Excel row
    row_data: Mapped[str] = mapped_column(Text, default="{}")

    send_job: Mapped[SendJob] = relationship(
        "SendJob", back_populates="send_logs", lazy="select"
    )


# ---------------------------------------------------------------------------
# GmailConfig
# ---------------------------------------------------------------------------

class GmailConfig(Base):
    """Stored email configuration (OAuth2 tokens or SMTP credentials)."""

    __tablename__ = "gmail_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # oauth2 or smtp
    auth_type: Mapped[str] = mapped_column(String(50), default="smtp")
    # Fernet-encrypted JSON string containing tokens or SMTP password
    encrypted_credentials: Mapped[str] = mapped_column(Text, default="")
    sender_email: Mapped[str] = mapped_column(String(512), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


# ---------------------------------------------------------------------------
# ExcelFile
# ---------------------------------------------------------------------------

class ExcelFile(Base):
    """Uploaded Excel participant file registry."""

    __tablename__ = "excel_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    sheet_names: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of sheet names
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


# ---------------------------------------------------------------------------
# NoEmailCertificate
# ---------------------------------------------------------------------------

class NoEmailCertificate(Base):
    """Generated PDF certificate for participants with missing or invalid emails."""

    __tablename__ = "no_email_certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("send_jobs.id", ondelete="SET NULL"), nullable=True
    )
    type_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("attestation_types.id", ondelete="SET NULL"), nullable=True
    )
    type_name: Mapped[str] = mapped_column(String(255), default="")
    recipient_name: Mapped[str] = mapped_column(String(512), default="")
    recipient_email: Mapped[str] = mapped_column(String(512), default="")
    email_issue: Mapped[str] = mapped_column(String(255), default="Missing email")
    role_description: Mapped[str] = mapped_column(String(512), default="")
    presentation_title: Mapped[str] = mapped_column(String(512), default="")
    pdf_filename: Mapped[str] = mapped_column(String(512), default="")
    pdf_path: Mapped[str] = mapped_column(String(1024), default="")
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    row_index: Mapped[int] = mapped_column(Integer, default=0)
    source_excel_name: Mapped[str] = mapped_column(String(512), default="")
    sheet_name: Mapped[str] = mapped_column(String(255), default="")
    row_data: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

