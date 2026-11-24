"""Router: Attestation Types CRUD and field mapping configuration.

Endpoints
---------
GET    /api/types/                  List all attestation types
POST   /api/types/                  Create a new attestation type
GET    /api/types/{id}              Get a specific attestation type
PUT    /api/types/{id}              Update an attestation type
DELETE /api/types/{id}              Delete an attestation type
POST   /api/types/{id}/duplicate    Duplicate an attestation type
GET    /api/types/{id}/fields       Get field mappings for a type
PUT    /api/types/{id}/fields       Update field mappings for a type
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.attestation import AttestationType, PdfTemplate
from app.models.schemas import (
    AttestationTypeCreate,
    AttestationTypeOut,
    AttestationTypeUpdate,
    FieldMapping,
)

router = APIRouter(prefix="/api/types", tags=["attestation-types"])


@router.get("/", response_model=list[AttestationTypeOut])
async def list_attestation_types(
    db: AsyncSession = Depends(get_db),
) -> list[AttestationTypeOut]:
    """List all registered attestation types with optional template metadata."""
    result = await db.execute(
        select(AttestationType)
        .options(selectinload(AttestationType.template))
        .order_by(AttestationType.id.asc())
    )
    types = result.scalars().all()
    return [AttestationTypeOut.model_validate(t) for t in types]


@router.post("/", response_model=AttestationTypeOut, status_code=status.HTTP_201_CREATED)
async def create_attestation_type(
    payload: AttestationTypeCreate,
    db: AsyncSession = Depends(get_db),
) -> AttestationTypeOut:
    """Create a new attestation type configuration."""
    # Verify template exists if provided
    if payload.template_id is not None:
        tpl = await db.get(PdfTemplate, payload.template_id)
        if not tpl:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template with id {payload.template_id} not found.",
            )

    # Convert field_mappings list to JSON string
    mappings_json = json.dumps([m.model_dump() for m in payload.field_mappings])

    attestation_type = AttestationType(
        name=payload.name.strip(),
        template_id=payload.template_id,
        field_mappings=mappings_json,
        email_subject=payload.email_subject,
        email_body=payload.email_body,
        filename_pattern=payload.filename_pattern,
        description=payload.description,
        email_column=payload.email_column,
        name_column=payload.name_column,
        sheet_name=payload.sheet_name,
    )

    db.add(attestation_type)
    await db.flush()
    await db.refresh(attestation_type, ["template"])
    return AttestationTypeOut.model_validate(attestation_type)


@router.get("/{type_id}", response_model=AttestationTypeOut)
async def get_attestation_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
) -> AttestationTypeOut:
    """Retrieve details of an attestation type."""
    result = await db.execute(
        select(AttestationType)
        .options(selectinload(AttestationType.template))
        .where(AttestationType.id == type_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {type_id} not found.",
        )
    return AttestationTypeOut.model_validate(item)


@router.put("/{type_id}", response_model=AttestationTypeOut)
async def update_attestation_type(
    type_id: int,
    payload: AttestationTypeUpdate,
    db: AsyncSession = Depends(get_db),
) -> AttestationTypeOut:
    """Update an existing attestation type."""
    result = await db.execute(
        select(AttestationType)
        .options(selectinload(AttestationType.template))
        .where(AttestationType.id == type_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {type_id} not found.",
        )

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.template_id is not None:
        tpl = await db.get(PdfTemplate, payload.template_id)
        if not tpl:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Template with id {payload.template_id} not found.",
            )
        item.template_id = payload.template_id
    if payload.field_mappings is not None:
        item.field_mappings = json.dumps([m.model_dump() for m in payload.field_mappings])
    if payload.email_subject is not None:
        item.email_subject = payload.email_subject
    if payload.email_body is not None:
        item.email_body = payload.email_body
    if payload.filename_pattern is not None:
        item.filename_pattern = payload.filename_pattern
    if payload.description is not None:
        item.description = payload.description
    if payload.email_column is not None:
        item.email_column = payload.email_column
    if payload.name_column is not None:
        item.name_column = payload.name_column
    if payload.sheet_name is not None:
        item.sheet_name = payload.sheet_name

    await db.flush()
    await db.refresh(item, ["template"])
    return AttestationTypeOut.model_validate(item)


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attestation_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an attestation type."""
    item = await db.get(AttestationType, type_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {type_id} not found.",
        )
    await db.delete(item)


@router.post("/{type_id}/duplicate", response_model=AttestationTypeOut, status_code=status.HTTP_201_CREATED)
async def duplicate_attestation_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
) -> AttestationTypeOut:
    """Duplicate an existing attestation type."""
    result = await db.execute(
        select(AttestationType)
        .options(selectinload(AttestationType.template))
        .where(AttestationType.id == type_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {type_id} not found.",
        )

    cloned = AttestationType(
        name=f"{item.name} (Copy)",
        template_id=item.template_id,
        field_mappings=item.field_mappings,
        email_subject=item.email_subject,
        email_body=item.email_body,
        filename_pattern=item.filename_pattern,
        description=item.description,
        email_column=item.email_column,
        name_column=item.name_column,
        sheet_name=item.sheet_name,
    )
    db.add(cloned)
    await db.flush()
    await db.refresh(cloned, ["template"])
    return AttestationTypeOut.model_validate(cloned)


@router.get("/{type_id}/fields", response_model=list[dict[str, Any]])
async def get_type_fields(
    type_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Retrieve the field mappings list for an attestation type."""
    item = await db.get(AttestationType, type_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {type_id} not found.",
        )
    try:
        return json.loads(item.field_mappings or "[]")
    except Exception:
        return []


@router.put("/{type_id}/fields", response_model=list[dict[str, Any]])
async def update_type_fields(
    type_id: int,
    fields: list[FieldMapping],
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Save the field mappings configuration for an attestation type."""
    item = await db.get(AttestationType, type_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation type {type_id} not found.",
        )
    serialized = [f.model_dump() for f in fields]
    item.field_mappings = json.dumps(serialized)
    await db.flush()
    return serialized

