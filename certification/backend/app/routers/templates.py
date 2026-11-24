"""Router: PDF template upload and management.

Endpoints
---------
POST   /api/templates/upload       Upload a PDF template
GET    /api/templates/             List all templates
DELETE /api/templates/{id}         Delete a template
GET    /api/templates/{id}/fields  Detect AcroForm fields
GET    /api/templates/{id}/preview Render page as PNG image
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.attestation import PdfTemplate
from app.models.schemas import PdfTemplateOut
from app.services import pdf_service

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.post("/upload", response_model=PdfTemplateOut, status_code=201)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Query("", description="Human-readable name for the template"),
    db: AsyncSession = Depends(get_db),
) -> PdfTemplateOut:
    """Upload a PDF file and register it as a reusable template.

    Parameters
    ----------
    file:
        Uploaded PDF file.
    name:
        Optional display name; defaults to the original filename stem.
    db:
        Injected DB session.

    Returns
    -------
    PdfTemplateOut
        The newly created template record.
    """
    settings = get_settings()

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Build a unique filename to avoid collisions
    unique_id = uuid.uuid4().hex[:8]
    safe_name = Path(file.filename).name
    dest_filename = f"{unique_id}_{safe_name}"
    dest_path = os.path.join(settings.upload_dir, dest_filename)

    os.makedirs(settings.upload_dir, exist_ok=True)

    # Stream file to disk
    contents = await file.read()
    with open(dest_path, "wb") as fh:
        fh.write(contents)

    # Inspect PDF metadata
    try:
        info = pdf_service.get_pdf_info(dest_path)
    except Exception as exc:
        os.remove(dest_path)
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}") from exc

    display_name = name.strip() or Path(file.filename).stem

    template = PdfTemplate(
        name=display_name,
        original_filename=file.filename,
        path=dest_filename,
        page_count=info["page_count"],
        has_acroform=info["has_acroform"],
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return PdfTemplateOut.model_validate(template)


@router.get("/", response_model=list[PdfTemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db)) -> list[PdfTemplateOut]:
    """Return all registered PDF templates."""
    result = await db.execute(select(PdfTemplate).order_by(PdfTemplate.created_at.desc()))
    templates = result.scalars().all()
    return [PdfTemplateOut.model_validate(t) for t in templates]


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a template record and its associated file from disk.

    Parameters
    ----------
    template_id:
        Primary key of the template to remove.
    """
    settings = get_settings()
    result = await db.execute(select(PdfTemplate).where(PdfTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    # Remove file from disk (best-effort)
    file_path = os.path.join(settings.upload_dir, template.path)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass  # Non-fatal — file may already be gone

    await db.execute(delete(PdfTemplate).where(PdfTemplate.id == template_id))


@router.get("/{template_id}/fields")
async def get_template_fields(
    template_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Detect interactive AcroForm fields in a template.

    Returns an empty list for templates without AcroForm widgets.
    """
    settings = get_settings()
    result = await db.execute(select(PdfTemplate).where(PdfTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    file_path = os.path.join(settings.upload_dir, template.path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Template file missing on disk.")

    return pdf_service.detect_acroform_fields(file_path)


@router.get("/{template_id}/preview")
async def preview_template_page(
    template_id: int,
    page: int = Query(0, ge=0, description="Zero-based page index to render"),
    zoom: float = Query(2.0, gt=0, le=5.0, description="Render zoom / DPI factor"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Render one page of a template as a PNG image.

    Parameters
    ----------
    page:
        Zero-based page number.
    zoom:
        Magnification factor (2.0 = 144 dpi).

    Returns
    -------
    Response
        PNG image bytes.
    """
    settings = get_settings()
    result = await db.execute(select(PdfTemplate).where(PdfTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    file_path = os.path.join(settings.upload_dir, template.path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Template file missing on disk.")

    try:
        png_bytes = pdf_service.pdf_page_to_image(file_path, page_num=page, zoom=zoom)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Render error: {exc}") from exc

    return Response(content=png_bytes, media_type="image/png")
