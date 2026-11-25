"""Router: Excel file upload, sheet inspection, validation, and job creation.

Endpoints
---------
POST   /api/excel/upload        Upload an Excel file and parse its sheets
POST   /api/excel/validate      Validate rows in a sheet against column mappings
POST   /api/excel/create-job    Create a SendJob from selected sheet rows
GET    /api/excel/sample        Get sample Excel file
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.attestation import (
    AttestationType,
    ExcelFile,
    NoEmailCertificate,
    PdfTemplate,
    SendJob,
    SendLog,
)
from app.models.schemas import ExcelValidationResult, SendJobOut
from app.services import email_service, excel_service, pdf_service

router = APIRouter(prefix="/api/excel", tags=["excel"])


class ValidateRequest(BaseModel):
    file_path: str
    sheet_name: str
    email_column: str = "Email"
    name_column: str = "Author"
    required_columns: list[str] = Field(default_factory=list)


class CreateJobRequest(BaseModel):
    type_id: int
    file_path: str
    sheet_name: str
    selected_indices: Optional[list[int]] = None  # None = select all valid rows


@router.get("/files")
async def list_excel_files(
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all previously uploaded Excel workbooks."""
    result = await db.execute(select(ExcelFile).order_by(ExcelFile.id.desc()))
    files = result.scalars().all()
    out = []
    for f in files:
        try:
            s_names = json.loads(f.sheet_names)
        except Exception:
            s_names = []
        out.append({
            "id": f.id,
            "filename": f.filename,
            "file_path": f.file_path,
            "sheet_names": s_names,
            "total_rows": f.total_rows,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return out


@router.get("/files/{file_id}")
async def get_excel_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve details and parsed sheet data of an uploaded Excel file."""
    settings = get_settings()
    excel_file = await db.get(ExcelFile, file_id)
    if not excel_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Excel file with ID {file_id} not found.",
        )

    full_path = os.path.join(settings.upload_dir, excel_file.file_path)
    if not os.path.exists(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Excel file '{excel_file.filename}' is missing from storage.",
        )

    try:
        parsed = excel_service.parse_excel(full_path)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse Excel workbook: {exc}",
        ) from exc

    return {
        "id": excel_file.id,
        "file_path": excel_file.file_path,
        "original_filename": excel_file.filename,
        "sheet_names": parsed["sheet_names"],
        "sheets": parsed["sheets"],
    }


@router.delete("/files/{file_id}")
async def delete_excel_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete an uploaded Excel file from storage and database."""
    settings = get_settings()
    excel_file = await db.get(ExcelFile, file_id)
    if not excel_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Excel file with ID {file_id} not found.",
        )

    full_path = os.path.join(settings.upload_dir, excel_file.file_path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except Exception:
            pass

    await db.delete(excel_file)
    await db.commit()
    return {"message": f"Excel file '{excel_file.filename}' deleted successfully."}


@router.post("/upload")
async def upload_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Upload an Excel file, register it in DB, and parse all sheet names and data."""
    settings = get_settings()

    if not file.filename or not (
        file.filename.lower().endswith(".xlsx") or file.filename.lower().endswith(".xls")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Excel files (.xlsx, .xls) are accepted.",
        )

    unique_id = uuid.uuid4().hex[:8]
    safe_name = Path(file.filename).name
    dest_filename = f"excel_{unique_id}_{safe_name}"
    dest_path = os.path.join(settings.upload_dir, dest_filename)

    os.makedirs(settings.upload_dir, exist_ok=True)

    contents = await file.read()
    with open(dest_path, "wb") as fh:
        fh.write(contents)

    try:
        parsed = excel_service.parse_excel(dest_path)
    except Exception as exc:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse Excel workbook: {exc}",
        ) from exc

    # Register in database for persistence across sessions
    total_rows = sum(s.get("row_count", 0) for s in parsed["sheets"].values())
    sheet_names_json = json.dumps(parsed["sheet_names"])

    excel_file = ExcelFile(
        filename=file.filename,
        file_path=dest_filename,
        sheet_names=sheet_names_json,
        total_rows=total_rows,
    )
    db.add(excel_file)
    await db.commit()
    await db.refresh(excel_file)

    return {
        "id": excel_file.id,
        "file_path": dest_filename,
        "original_filename": file.filename,
        "sheet_names": parsed["sheet_names"],
        "sheets": parsed["sheets"],
    }


@router.post("/validate", response_model=ExcelValidationResult)
async def validate_sheet(
    payload: ValidateRequest,
) -> ExcelValidationResult:
    """Validate rows of a specific sheet against expected columns."""
    settings = get_settings()
    full_path = os.path.join(settings.upload_dir, payload.file_path)
    if not os.path.exists(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File {payload.file_path} not found.",
        )

    try:
        parsed = excel_service.parse_excel(full_path)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read Excel file: {exc}",
        ) from exc

    sheet_data = parsed["sheets"].get(payload.sheet_name)
    if not sheet_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sheet '{payload.sheet_name}' not found in workbook.",
        )

    req_cols = list(payload.required_columns)
    if payload.name_column and payload.name_column not in req_cols:
        req_cols.append(payload.name_column)

    return excel_service.validate_rows(
        rows=sheet_data["rows"],
        required_columns=req_cols,
        email_column=payload.email_column,
    )


@router.post("/create-job", response_model=SendJobOut, status_code=status.HTTP_201_CREATED)
async def create_send_job(
    payload: CreateJobRequest,
    db: AsyncSession = Depends(get_db),
) -> SendJobOut:
    """Create a new SendJob and populate SendLog recipient rows from Excel."""
    settings = get_settings()
    att_type = await db.get(AttestationType, payload.type_id)
    if not att_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {payload.type_id} not found.",
        )

    full_path = os.path.join(settings.upload_dir, payload.file_path)
    if not os.path.exists(full_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File {payload.file_path} not found.",
        )

    parsed = excel_service.parse_excel(full_path)
    sheet_data = parsed["sheets"].get(payload.sheet_name)
    if not sheet_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sheet '{payload.sheet_name}' not found.",
        )

    all_rows = sheet_data["rows"]
    email_col = att_type.email_column or "email"
    name_col = att_type.name_column or "participant_name"

    # Flexible column resolution (handles E-MAIL, PARTICIPANT NAME, case, hyphens, spaces)
    sample_row = all_rows[0] if all_rows else {}
    actual_email_col = excel_service.resolve_column(sample_row.keys(), email_col) or email_col
    actual_name_col = excel_service.resolve_column(sample_row.keys(), name_col) or name_col
    actual_role_col = excel_service.resolve_column(sample_row.keys(), "role_description") or "role_description"
    actual_title_col = excel_service.resolve_column(sample_row.keys(), "presentation_title") or "presentation_title"

    # Filter by selected indices if provided (include rows even without valid email)
    selected_indices_set = (
        set(payload.selected_indices) if payload.selected_indices is not None else None
    )

    eligible_rows = []
    for r in all_rows:
        row_idx = r.get("_row_index", 0)
        if selected_indices_set is not None and row_idx not in selected_indices_set:
            continue
        eligible_rows.append(r)

    if not eligible_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No rows selected or available in this sheet.",
        )

    # Resolve PDF template for immediate no-email certificate generation
    template_file = ""
    if att_type.template_id:
        template = await db.get(PdfTemplate, att_type.template_id)
        if template:
            template_file = os.path.join(settings.upload_dir, template.path)
    if not template_file or not os.path.exists(template_file):
        root_tpl = os.path.abspath("Certification_template.pdf")
        if os.path.exists(root_tpl):
            template_file = root_tpl

    try:
        field_mappings = json.loads(att_type.field_mappings or "[]")
    except Exception:
        field_mappings = []

    # Look up original Excel filename
    res_ef = await db.execute(
        select(ExcelFile).where(ExcelFile.file_path == payload.file_path).limit(1)
    )
    excel_file_rec = res_ef.scalars().first()
    source_excel_name = excel_file_rec.filename if excel_file_rec else payload.file_path

    # Create SendJob
    job = SendJob(
        type_id=payload.type_id,
        excel_path=payload.file_path,
        total_rows=len(eligible_rows),
        sent_count=0,
        failed_count=0,
        status="pending",
    )
    db.add(job)
    await db.flush()

    pending_email_count = 0
    no_email_dir = os.path.join(settings.generated_dir, f"no_email_job{job.id}")

    # Create SendLog records & immediately generate PDFs for no-email / invalid-email rows
    for r in eligible_rows:
        email_val = str(r.get(actual_email_col) or "").strip()
        name_val = str(r.get(actual_name_col) or "").strip() or "Participant"
        role_val = str(r.get(actual_role_col) or "").strip()
        title_val = str(r.get(actual_title_col) or "").strip()
        row_idx = r.get("_row_index", 0)

        has_valid_email = bool(email_val and excel_service.is_valid_email(email_val))

        if has_valid_email:
            pending_email_count += 1
            log_item = SendLog(
                job_id=job.id,
                row_index=row_idx,
                recipient_email=email_val,
                recipient_name=name_val,
                status="pending",
                error_message="",
                generated_pdf_path="",
                row_data=json.dumps(r),
            )
            db.add(log_item)
        else:
            email_issue = "Missing email" if not email_val else f"Invalid email: {email_val}"
            output_path = ""
            pdf_filename = ""
            file_size = 0

            if template_file and os.path.exists(template_file):
                os.makedirs(no_email_dir, exist_ok=True)
                row_for_interp = dict(r)
                row_for_interp["name"] = name_val
                raw_filename = email_service.interpolate_template(
                    att_type.filename_pattern or "Certificate_{{name}}.pdf",
                    row_for_interp,
                )
                safe_filename = "".join(c for c in raw_filename if c not in r'\/:*?"<>|').strip()
                if not safe_filename:
                    safe_filename = f"cert_row_{row_idx}.pdf"
                if not safe_filename.lower().endswith(".pdf"):
                    safe_filename += ".pdf"

                # Avoid overwriting if two participants share a name
                candidate_path = os.path.join(no_email_dir, safe_filename)
                if os.path.exists(candidate_path):
                    base, ext = os.path.splitext(safe_filename)
                    safe_filename = f"{base}_row{row_idx}{ext}"
                    candidate_path = os.path.join(no_email_dir, safe_filename)

                pdf_service.generate_pdf_for_row(
                    template_path=template_file,
                    field_mappings=field_mappings,
                    row_data=r,
                    output_path=candidate_path,
                )
                output_path = candidate_path
                pdf_filename = safe_filename
                if os.path.exists(output_path):
                    file_size = os.path.getsize(output_path)

            log_item = SendLog(
                job_id=job.id,
                row_index=row_idx,
                recipient_email=email_val,
                recipient_name=name_val,
                status="no_email",
                error_message=f"{email_issue} — saved to No Email Address Certification",
                generated_pdf_path=output_path,
                row_data=json.dumps(r),
            )
            db.add(log_item)

            no_email_cert = NoEmailCertificate(
                job_id=job.id,
                type_id=att_type.id,
                type_name=att_type.name,
                recipient_name=name_val,
                recipient_email=email_val,
                email_issue=email_issue,
                role_description=role_val,
                presentation_title=title_val,
                pdf_filename=pdf_filename,
                pdf_path=output_path,
                file_size_bytes=file_size,
                row_index=row_idx,
                source_excel_name=source_excel_name,
                sheet_name=payload.sheet_name,
                row_data=json.dumps(r),
            )
            db.add(no_email_cert)

    if pending_email_count == 0:
        job.status = "done"

    await db.commit()
    await db.refresh(job)
    return SendJobOut.model_validate(job)

