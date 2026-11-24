"""FastAPI Application Entry Point.

Configures CORS, lifespan database initialization, automatic seed data,
and registers all API routers.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal, init_db
from app.models.attestation import AttestationType, PdfTemplate
from app.routers import attestation_types, excel, send, settings, templates
from app.services import pdf_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("app.main")


async def seed_initial_data() -> None:
    """Seed initial PDF template and TTSA attestation types if database is fresh."""
    settings_cfg = get_settings()
    os.makedirs(settings_cfg.upload_dir, exist_ok=True)
    os.makedirs(settings_cfg.generated_dir, exist_ok=True)

    async with AsyncSessionLocal() as db:
        # Check if templates already exist
        res = await db.execute(select(PdfTemplate).limit(1))
        existing_tpl = res.scalars().first()

        tpl_id = None
        if not existing_tpl:
            # Check for Certification_template.pdf in project root
            root_template_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Certification_template.pdf"))
            if not os.path.exists(root_template_path):
                # Try relative to CWD
                root_template_path = os.path.abspath("Certification_template.pdf")

            if os.path.exists(root_template_path):
                dest_filename = "default_Certification_template.pdf"
                dest_path = os.path.join(settings_cfg.upload_dir, dest_filename)
                try:
                    shutil.copyfile(root_template_path, dest_path)
                    info = pdf_service.get_pdf_info(dest_path)
                    template = PdfTemplate(
                        name="TTSA 2026 Certificate Template",
                        original_filename="Certification_template.pdf",
                        path=dest_filename,
                        page_count=info["page_count"],
                        has_acroform=info["has_acroform"],
                    )
                    db.add(template)
                    await db.flush()
                    await db.refresh(template)
                    tpl_id = template.id
                    logger.info("Seeded default PDF template (id=%s)", tpl_id)
                except Exception as exc:
                    logger.warning("Could not auto-seed template: %s", exc)
        else:
            tpl_id = existing_tpl.id

        # Check if attestation types already exist
        res_types = await db.execute(select(AttestationType).order_by(AttestationType.id.asc()))
        existing_types = res_types.scalars().all()

        default_mappings = [
            {
                "field_name": "participant_name",
                "label": "Participant Name",
                "x": 430.0,
                "y": 285.0,
                "page": 0,
                "font": "Helvetica-Bold",
                "font_size": 22.0,
                "color": 0x1A2B4C,
                "alignment": "center",
                "max_width": 450.0,
                "is_bold": True,
                "is_italic": False,
            },
            {
                "field_name": "role_description",
                "label": "Role Description",
                "x": 430.0,
                "y": 320.0,
                "page": 0,
                "font": "Helvetica-Oblique",
                "font_size": 14.0,
                "color": 0x333333,
                "alignment": "center",
                "max_width": 500.0,
                "is_bold": False,
                "is_italic": True,
            },
            {
                "field_name": "presentation_title",
                "label": "Presentation Title",
                "x": 430.0,
                "y": 345.0,
                "page": 0,
                "font": "Helvetica-Oblique",
                "font_size": 12.0,
                "color": 0x444444,
                "alignment": "center",
                "max_width": 520.0,
                "is_bold": False,
                "is_italic": True,
            },
        ]

        if not existing_types:
            # Seed recommended TTSA types with Conference as default (#0)
            types_to_create = [
                AttestationType(
                    name="Conference",
                    template_id=tpl_id,
                    field_mappings=json.dumps(default_mappings),
                    email_subject="Your Certificate of Conference — 5th TTSA Congress",
                    email_body=(
                        "Dear Dr. {{name}},\n\n"
                        "Thank you for your presentation at the 5th National Tunisian Thoracic Surgery Congress.\n"
                        "Please find your certificate attached.\n\n"
                        "Best regards,\n"
                        "The TTSA Organizing Committee"
                    ),
                    filename_pattern="Certificate_Conference_{{name}}.pdf",
                    description="Certificate for conference presentations",
                    email_column="email",
                    name_column="participant_name",
                    sheet_name="Conference",
                ),
                AttestationType(
                    name="Poster Presentation",
                    template_id=tpl_id,
                    field_mappings=json.dumps(default_mappings),
                    email_subject="Your Certificate of Poster Presentation — 5th TTSA Congress",
                    email_body=(
                        "Dear Dr. {{name}},\n\n"
                        "Thank you for presenting your e-poster at the 5th National Tunisian Thoracic Surgery Congress.\n"
                        "Please find your certificate attached.\n\n"
                        "Best regards,\n"
                        "The TTSA Organizing Committee"
                    ),
                    filename_pattern="Certificate_Poster_{{name}}.pdf",
                    description="Certificate for poster presenters",
                    email_column="email",
                    name_column="participant_name",
                    sheet_name="Eposter",
                ),
                AttestationType(
                    name="Attendee / Participation",
                    template_id=tpl_id,
                    field_mappings=json.dumps(default_mappings[:2]),  # name + role
                    email_subject="Your Certificate of Attendance — 5th TTSA Congress",
                    email_body=(
                        "Dear Dr. {{name}},\n\n"
                        "Thank you for attending the 5th National Tunisian Thoracic Surgery Congress.\n"
                        "Please find your attendance certificate attached.\n\n"
                        "Best regards,\n"
                        "The TTSA Organizing Committee"
                    ),
                    filename_pattern="Certificate_Attendee_{{name}}.pdf",
                    description="Certificate of attendance for registered congress participants",
                    email_column="email",
                    name_column="participant_name",
                    sheet_name="Participants",
                ),
            ]

            for item in types_to_create:
                db.add(item)

            await db.commit()
            logger.info("Seeded initial attestation types.")
        else:
            # Ensure first default type is named Conference
            conf = next((t for t in existing_types if t.name in ["Conference", "Oral Communication"]), None)
            if conf and conf.name != "Conference":
                conf.name = "Conference"
                conf.sheet_name = "Conference"
                conf.filename_pattern = "Certificate_Conference_{{name}}.pdf"
                conf.email_subject = "Your Certificate of Conference — 5th TTSA Congress"
                await db.commit()
                logger.info("Updated existing type #%s to Conference", conf.id)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifespan handler."""
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database initialized.")
    await seed_initial_data()
    yield
    logger.info("Shutting down application...")


app = FastAPI(
    title="Attestation Generator API",
    description="Bulk certificate generation and email dispatch for TTSA Congress",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(templates.router)
app.include_router(attestation_types.router)
app.include_router(excel.router)
app.include_router(send.router)
app.include_router(settings.router)


@app.get("/api/health", tags=["system"])
async def health_check():
    """Health status endpoint."""
    return {"status": "ok", "service": "attestation-generator-api", "version": "1.0.0"}


# Mount frontend static distribution if built
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/", tags=["system"])
    async def root():
        """Root redirect / information endpoint."""
        return {
            "name": "Attestation Generator API",
            "docs_url": "/docs",
            "health": "/api/health",
        }

