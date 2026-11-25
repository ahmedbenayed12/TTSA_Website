"""Router: No Email Address Certification management and downloads.

Stores, lists, previews, and exports (individually or in bulk ZIP) certificates
generated for Excel rows whose email address was missing or invalid.

Endpoints
---------
GET    /api/no-email-certs/               List all no-email certificates
GET    /api/no-email-certs/download-zip   Download selected/all certificates (or all certs) as ZIP
GET    /api/no-email-certs/{id}/download  Download a single certificate PDF
GET    /api/no-email-certs/{id}/preview   Preview certificate as PNG image or PDF
DELETE /api/no-email-certs/{id}           Delete a single certificate
POST   /api/no-email-certs/bulk-delete    Delete multiple certificates
"""
from __future__ import annotations

import io
import os
import zipfile
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.attestation import NoEmailCertificate, SendLog
from app.models.schemas import NoEmailCertificateOut
from app.services import pdf_service

router = APIRouter(prefix="/api/no-email-certs", tags=["no-email-certificates"])


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.get("/", response_model=list[NoEmailCertificateOut])
async def list_no_email_certificates(
    type_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[NoEmailCertificateOut]:
    """List all certificates stored in No Email Address Certification."""
    query = select(NoEmailCertificate).order_by(NoEmailCertificate.created_at.desc())

    if type_id is not None:
        query = query.where(NoEmailCertificate.type_id == type_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                NoEmailCertificate.recipient_name.ilike(term),
                NoEmailCertificate.presentation_title.ilike(term),
                NoEmailCertificate.role_description.ilike(term),
                NoEmailCertificate.source_excel_name.ilike(term),
            )
        )

    result = await db.execute(query)
    certs = result.scalars().all()
    return [NoEmailCertificateOut.model_validate(c) for c in certs]


@router.get("/download-zip")
async def download_certificates_zip(
    ids: Optional[str] = Query(None, description="Comma-separated IDs to include; omit for all"),
    include_all: bool = Query(
        False,
        description="If true, include all other generated certificates from SendLog as well",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Download no-email certificates (alone or in mass with all other certifications) as ZIP."""
    query = select(NoEmailCertificate).order_by(NoEmailCertificate.created_at.desc())

    if ids and ids.strip():
        try:
            id_list = [int(x.strip()) for x in ids.split(",") if x.strip()]
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid IDs format.",
            ) from exc
        if id_list:
            query = query.where(NoEmailCertificate.id.in_(id_list))

    res = await db.execute(query)
    certs = res.scalars().all()

    zip_buffer = io.BytesIO()
    added_paths: set[str] = set()
    added_names: set[str] = set()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # 1. Add no-email certificates
        for cert in certs:
            if cert.pdf_path and os.path.exists(cert.pdf_path):
                norm_p = os.path.abspath(cert.pdf_path)
                if norm_p in added_paths:
                    continue
                added_paths.add(norm_p)

                base_name = cert.pdf_filename or os.path.basename(cert.pdf_path)
                folder_prefix = "no_email_certifications/" if include_all else ""
                target_name = f"{folder_prefix}{base_name}"
                count = 1
                while target_name in added_names:
                    name_no_ext, ext = os.path.splitext(base_name)
                    target_name = f"{folder_prefix}{name_no_ext}_{count}{ext}"
                    count += 1
                added_names.add(target_name)
                zip_file.write(cert.pdf_path, arcname=target_name)

        # 2. Optionally include all other generated certificates from SendLog
        if include_all:
            res_logs = await db.execute(
                select(SendLog).where(SendLog.generated_pdf_path != "")
            )
            logs = res_logs.scalars().all()
            for log in logs:
                if log.generated_pdf_path and os.path.exists(log.generated_pdf_path):
                    norm_p = os.path.abspath(log.generated_pdf_path)
                    if norm_p in added_paths:
                        continue
                    added_paths.add(norm_p)

                    base_name = os.path.basename(log.generated_pdf_path)
                    target_name = f"sent_certifications/{base_name}"
                    count = 1
                    while target_name in added_names:
                        name_no_ext, ext = os.path.splitext(base_name)
                        target_name = f"sent_certifications/{name_no_ext}_{count}{ext}"
                        count += 1
                    added_names.add(target_name)
                    zip_file.write(log.generated_pdf_path, arcname=target_name)

    zip_buffer.seek(0)
    zip_filename = (
        "all_ttsa_certifications.zip" if include_all else "no_email_certifications.zip"
    )
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_filename}"},
    )


@router.get("/{cert_id}/download")
async def download_single_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Download a single PDF certificate directly."""
    cert = await db.get(NoEmailCertificate, cert_id)
    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Certificate {cert_id} not found.",
        )

    if not cert.pdf_path or not os.path.exists(cert.pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Generated PDF file is missing from storage.",
        )

    filename = cert.pdf_filename or os.path.basename(cert.pdf_path)
    return FileResponse(
        path=cert.pdf_path,
        media_type="application/pdf",
        filename=filename,
    )


@router.get("/{cert_id}/preview")
async def preview_single_certificate(
    cert_id: int,
    as_image: bool = Query(True, description="True for PNG preview, False for raw PDF"),
    db: AsyncSession = Depends(get_db),
):
    """Preview a generated no-email certificate."""
    cert = await db.get(NoEmailCertificate, cert_id)
    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Certificate {cert_id} not found.",
        )

    if not cert.pdf_path or not os.path.exists(cert.pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Generated PDF file is missing from storage.",
        )

    if as_image:
        png_bytes = pdf_service.pdf_page_to_image(cert.pdf_path, page_num=0, zoom=2.0)
        return Response(content=png_bytes, media_type="image/png")

    with open(cert.pdf_path, "rb") as fh:
        pdf_bytes = fh.read()
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.delete("/{cert_id}")
async def delete_no_email_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete a certificate from No Email Address Certification."""
    cert = await db.get(NoEmailCertificate, cert_id)
    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Certificate {cert_id} not found.",
        )

    if cert.pdf_path and os.path.exists(cert.pdf_path):
        try:
            os.remove(cert.pdf_path)
        except Exception:
            pass

    await db.delete(cert)
    await db.commit()
    return {"message": f"Certificate for '{cert.recipient_name}' deleted."}


@router.post("/bulk-delete")
async def bulk_delete_no_email_certificates(
    payload: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete multiple certificates at once."""
    if not payload.ids:
        return {"deleted": 0}

    res = await db.execute(
        select(NoEmailCertificate).where(NoEmailCertificate.id.in_(payload.ids))
    )
    certs = res.scalars().all()
    deleted_count = 0
    for cert in certs:
        if cert.pdf_path and os.path.exists(cert.pdf_path):
            try:
                os.remove(cert.pdf_path)
            except Exception:
                pass
        await db.delete(cert)
        deleted_count += 1

    await db.commit()
    return {"deleted": deleted_count}
