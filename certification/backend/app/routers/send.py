"""Router: Bulk sending, progress monitoring via SSE, preview, CSV/ZIP export.

Endpoints
---------
GET    /api/send/jobs                     List all jobs
GET    /api/send/jobs/{job_id}            Get job summary
GET    /api/send/jobs/{job_id}/logs       List recipient logs for a job
POST   /api/send/start/{job_id}           Start background bulk-send
POST   /api/send/retry/{job_id}           Retry failed recipients
POST   /api/send/cancel/{job_id}          Cancel running job
GET    /api/send/progress/{job_id}        SSE progress stream
GET    /api/send/jobs/{job_id}/export-csv Download send logs as CSV
GET    /api/send/jobs/{job_id}/download-zip Download all generated PDFs as ZIP
POST   /api/send/preview-row              Render live PDF preview for a row
"""
from __future__ import annotations

import csv
import io
import json
import os
import zipfile
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import AsyncSessionLocal, get_db
from app.models.attestation import AttestationType, GmailConfig, PdfTemplate, SendJob, SendLog
from app.models.schemas import SendJobOut, SendLogOut
from app.services import crypto_service, pdf_service
from app.services.queue_service import send_queue

router = APIRouter(prefix="/api/send", tags=["send"])


class PreviewRowRequest(BaseModel):
    job_id: Optional[int] = None
    log_id: Optional[int] = None
    type_id: Optional[int] = None
    row_data: Optional[dict[str, Any]] = None


@router.get("/jobs", response_model=list[SendJobOut])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
) -> list[SendJobOut]:
    """List all bulk send jobs."""
    result = await db.execute(
        select(SendJob).order_by(SendJob.created_at.desc())
    )
    jobs = result.scalars().all()
    return [SendJobOut.model_validate(j) for j in jobs]


@router.get("/jobs/{job_id}", response_model=SendJobOut)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
) -> SendJobOut:
    """Get details of a specific send job."""
    job = await db.get(SendJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found.",
        )
    return SendJobOut.model_validate(job)


@router.get("/jobs/{job_id}/logs", response_model=list[SendLogOut])
async def get_job_logs(
    job_id: int,
    status_filter: Optional[str] = Query(None, description="Filter by status: pending, sent, failed"),
    db: AsyncSession = Depends(get_db),
) -> list[SendLogOut]:
    """List recipient log items for a specific send job."""
    query = select(SendLog).where(SendLog.job_id == job_id)
    if status_filter:
        query = query.where(SendLog.status == status_filter)
    query = query.order_by(SendLog.row_index.asc())

    result = await db.execute(query)
    logs = result.scalars().all()
    return [SendLogOut.model_validate(log) for log in logs]


@router.post("/start/{job_id}")
async def start_send_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Start the bulk email dispatch job."""
    settings = get_settings()

    job = await db.get(SendJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    att_type = await db.get(AttestationType, job.type_id)
    if not att_type:
        raise HTTPException(status_code=404, detail="Attestation type not found.")

    template_file = ""
    if att_type.template_id:
        template = await db.get(PdfTemplate, att_type.template_id)
        if template:
            template_file = os.path.join(settings.upload_dir, template.path)

    # If no template linked, check if workspace Certification_template.pdf can be used
    if not template_file or not os.path.exists(template_file):
        root_tpl = os.path.abspath("Certification_template.pdf")
        if os.path.exists(root_tpl):
            template_file = root_tpl

    if not template_file or not os.path.exists(template_file):
        raise HTTPException(
            status_code=400,
            detail="No valid PDF template assigned or template file missing.",
        )

    # Get active Gmail credentials
    res_creds = await db.execute(
        select(GmailConfig).where(GmailConfig.is_active == True).order_by(GmailConfig.id.desc())
    )
    gmail_cfg = res_creds.scalars().first()
    if not gmail_cfg:
        raise HTTPException(
            status_code=400,
            detail="No email credentials configured. Please configure Gmail or SMTP in Settings.",
        )

    try:
        decrypted_json = crypto_service.decrypt(gmail_cfg.encrypted_credentials, settings.secret_key)
        credentials = json.loads(decrypted_json)
        credentials["auth_type"] = gmail_cfg.auth_type
        credentials["sender_email"] = gmail_cfg.sender_email
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not decrypt email credentials: {exc}",
        ) from exc

    # Parse field mappings
    try:
        field_mappings = json.loads(att_type.field_mappings or "[]")
    except Exception:
        field_mappings = []

    type_config = {
        "template_path": template_file,
        "field_mappings": field_mappings,
        "email_subject": att_type.email_subject,
        "email_body": att_type.email_body,
        "filename_pattern": att_type.filename_pattern,
        "generated_dir": settings.generated_dir,
    }

    # Fetch rows to send (skipping already sent or no_email rows)
    res_logs = await db.execute(
        select(SendLog).where(
            SendLog.job_id == job_id,
            SendLog.status.notin_(["sent", "no_email"]),
        )
    )
    logs = res_logs.scalars().all()
    if not logs:
        return {
            "message": "All email-eligible recipients have already been processed (no-email certificates are in 'No Email Address Certification').",
            "job_id": job_id,
        }

    rows = []
    for log in logs:
        try:
            row_data = json.loads(log.row_data or "{}")
        except Exception:
            row_data = {}
        row_data["_row_index"] = log.row_index
        row_data["_email"] = log.recipient_email
        row_data["_name"] = log.recipient_name
        rows.append(row_data)

    # Launch background job in a fresh session
    job_db = AsyncSessionLocal()
    await send_queue.start_job(
        job_id=job_id,
        rows=rows,
        type_config=type_config,
        credentials=credentials,
        db=job_db,
        send_delay=settings.send_delay_seconds,
    )

    return {"message": "Job started successfully", "job_id": job_id, "count": len(rows)}


@router.post("/retry/{job_id}")
async def retry_send_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retry sending to recipients that previously failed."""
    settings = get_settings()

    job = await db.get(SendJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    att_type = await db.get(AttestationType, job.type_id)
    if not att_type:
        raise HTTPException(status_code=404, detail="Attestation type not found.")

    template_file = ""
    if att_type.template_id:
        template = await db.get(PdfTemplate, att_type.template_id)
        if template:
            template_file = os.path.join(settings.upload_dir, template.path)

    if not template_file or not os.path.exists(template_file):
        root_tpl = os.path.abspath("Certification_template.pdf")
        if os.path.exists(root_tpl):
            template_file = root_tpl

    res_creds = await db.execute(
        select(GmailConfig).where(GmailConfig.is_active == True).order_by(GmailConfig.id.desc())
    )
    gmail_cfg = res_creds.scalars().first()
    if not gmail_cfg:
        raise HTTPException(status_code=400, detail="No email credentials configured.")

    decrypted_json = crypto_service.decrypt(gmail_cfg.encrypted_credentials, settings.secret_key)
    credentials = json.loads(decrypted_json)
    credentials["auth_type"] = gmail_cfg.auth_type
    credentials["sender_email"] = gmail_cfg.sender_email

    field_mappings = json.loads(att_type.field_mappings or "[]")

    type_config = {
        "template_path": template_file,
        "field_mappings": field_mappings,
        "email_subject": att_type.email_subject,
        "email_body": att_type.email_body,
        "filename_pattern": att_type.filename_pattern,
        "generated_dir": settings.generated_dir,
    }

    job_db = AsyncSessionLocal()
    await send_queue.retry_failed(
        job_id=job_id,
        type_config=type_config,
        credentials=credentials,
        db=job_db,
        send_delay=settings.send_delay_seconds,
    )

    return {"message": "Retry job triggered", "job_id": job_id}


@router.post("/cancel/{job_id}")
async def cancel_job(job_id: int) -> dict[str, str]:
    """Cancel an active in-flight sending task."""
    send_queue.cancel_job(job_id)
    return {"message": f"Job {job_id} cancelled."}


@router.get("/progress/{job_id}")
async def progress_stream(job_id: int):
    """Server-Sent Events endpoint streaming real-time progress for job_id."""
    return EventSourceResponse(send_queue.progress_generator(job_id))


@router.get("/jobs/{job_id}/export-csv")
async def export_logs_csv(
    job_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Generate and download a CSV report of recipient delivery logs."""
    res = await db.execute(
        select(SendLog).where(SendLog.job_id == job_id).order_by(SendLog.row_index.asc())
    )
    logs = res.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Row", "Recipient Name", "Recipient Email", "Status", "Sent At", "Error Message", "PDF Path"
    ])

    for log in logs:
        writer.writerow([
            log.row_index,
            log.recipient_name,
            log.recipient_email,
            log.status,
            log.sent_at.isoformat() if log.sent_at else "",
            log.error_message,
            log.generated_pdf_path,
        ])

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=send_report_job_{job_id}.csv"},
    )


@router.get("/jobs/{job_id}/download-zip")
async def download_all_zip(
    job_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Archive all generated PDFs for this job into a single downloadable ZIP file."""
    res = await db.execute(
        select(SendLog).where(
            SendLog.job_id == job_id,
            SendLog.generated_pdf_path != "",
        )
    )
    logs = res.scalars().all()

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        added_names = set()
        for log in logs:
            if log.generated_pdf_path and os.path.exists(log.generated_pdf_path):
                base_name = os.path.basename(log.generated_pdf_path)
                # Handle filename collisions in zip
                target_name = base_name
                count = 1
                while target_name in added_names:
                    target_name = f"{count}_{base_name}"
                    count += 1
                added_names.add(target_name)
                zip_file.write(log.generated_pdf_path, arcname=target_name)

    zip_buffer.seek(0)
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=certificates_job_{job_id}.zip"},
    )


@router.post("/preview-row")
async def preview_row_pdf(
    payload: PreviewRowRequest,
    as_image: bool = Query(False, description="True for PNG image, False for PDF binary"),
    db: AsyncSession = Depends(get_db),
):
    """Generate a preview certificate for a specific row without sending."""
    settings = get_settings()

    row_data: dict[str, Any] = {}
    type_id = payload.type_id

    if payload.log_id:
        log = await db.get(SendLog, payload.log_id)
        if log:
            row_data = json.loads(log.row_data or "{}")
            row_data["name"] = log.recipient_name
            row_data["email"] = log.recipient_email
            job = await db.get(SendJob, log.job_id)
            if job:
                type_id = job.type_id
    elif payload.job_id:
        job = await db.get(SendJob, payload.job_id)
        if job:
            type_id = job.type_id
            res = await db.execute(
                select(SendLog).where(SendLog.job_id == payload.job_id).limit(1)
            )
            log = res.scalars().first()
            if log:
                row_data = json.loads(log.row_data or "{}")
                row_data["name"] = log.recipient_name
                row_data["email"] = log.recipient_email

    if payload.row_data:
        row_data.update(payload.row_data)

    if not type_id:
        res = await db.execute(select(AttestationType).limit(1))
        t = res.scalars().first()
        if t:
            type_id = t.id

    if not type_id:
        raise HTTPException(status_code=404, detail="No attestation type available.")

    att_type = await db.get(AttestationType, type_id)
    if not att_type:
        raise HTTPException(status_code=404, detail="Attestation type not found.")

    template_file = ""
    if att_type.template_id:
        tpl = await db.get(PdfTemplate, att_type.template_id)
        if tpl:
            template_file = os.path.join(settings.upload_dir, tpl.path)

    if not template_file or not os.path.exists(template_file):
        root_tpl = os.path.abspath("Certification_template.pdf")
        if os.path.exists(root_tpl):
            template_file = root_tpl

    if not template_file or not os.path.exists(template_file):
        raise HTTPException(status_code=400, detail="No template file found.")

    field_mappings = json.loads(att_type.field_mappings or "[]")

    preview_output = os.path.join(settings.generated_dir, "preview_temp.pdf")
    os.makedirs(settings.generated_dir, exist_ok=True)

    pdf_service.generate_pdf_for_row(
        template_path=template_file,
        field_mappings=field_mappings,
        row_data=row_data,
        output_path=preview_output,
    )

    if as_image:
        png_bytes = pdf_service.pdf_page_to_image(preview_output, page_num=0, zoom=2.0)
        return Response(content=png_bytes, media_type="image/png")

    with open(preview_output, "rb") as fh:
        pdf_bytes = fh.read()

    return Response(content=pdf_bytes, media_type="application/pdf")

