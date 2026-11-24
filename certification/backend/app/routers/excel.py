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
from app.models.attestation import AttestationType, SendJob, SendLog
from app.models.schemas import ExcelValidationResult, SendJobOut
from app.services import excel_service

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


@router.post("/upload")
async def upload_excel(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload an Excel file and parse all sheet names, columns, and preview data."""
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

    return {
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
    email_col = att_type.email_column or "Email"
    name_col = att_type.name_column or "Author"

    # Filter by selected indices if provided
    selected_indices_set = (
        set(payload.selected_indices) if payload.selected_indices is not None else None
    )

    eligible_rows = []
    for r in all_rows:
        row_idx = r.get("_row_index", 0)
        if selected_indices_set is not None and row_idx not in selected_indices_set:
            continue
        email_val = str(r.get(email_col) or "").strip()
        if not email_val:
            continue
        eligible_rows.append(r)

    if not eligible_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid recipient rows found to process.",
        )

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

    # Create SendLog records
    for r in eligible_rows:
        email_val = str(r.get(email_col) or "").strip()
        name_val = str(r.get(name_col) or "").strip() or "Participant"
        row_idx = r.get("_row_index", 0)

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

    await db.commit()
    await db.refresh(job)
    return SendJobOut.model_validate(job)

