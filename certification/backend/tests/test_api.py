"""Integration tests for Attestation Generator API."""
import os
import json
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_list_templates_and_types():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Templates
        res_tpl = await ac.get("/api/templates/")
        assert res_tpl.status_code == 200
        templates = res_tpl.json()
        assert isinstance(templates, list)
        assert len(templates) > 0  # Should be seeded with Certification_template.pdf

        # Attestation Types
        res_types = await ac.get("/api/types/")
        assert res_types.status_code == 200
        types = res_types.json()
        assert isinstance(types, list)
        assert len(types) >= 3  # Seeded with Oral, Poster, Attendee


@pytest.mark.asyncio
async def test_settings_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/settings/gmail")
        assert res.status_code == 200
        data = res.json()
        assert "configured" in data


@pytest.mark.asyncio
async def test_attestation_type_crud():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Create
        new_type = {
            "name": "Workshop Moderator",
            "email_subject": "Workshop Certificate",
            "email_body": "Thank you for moderating.",
            "field_mappings": [
                {
                    "field_name": "participant_name",
                    "label": "Name",
                    "x": 400.0,
                    "y": 250.0,
                    "page": 0,
                    "font": "Helvetica-Bold",
                    "font_size": 20.0,
                    "color": 0,
                    "alignment": "center",
                    "max_width": 400.0,
                }
            ],
            "email_column": "email",
            "name_column": "participant_name",
        }
        res_create = await ac.post("/api/types/", json=new_type)
        assert res_create.status_code == 201
        created = res_create.json()
        type_id = created["id"]
        assert created["name"] == "Workshop Moderator"

        # Update
        res_update = await ac.put(f"/api/types/{type_id}", json={"description": "Updated desc"})
        assert res_update.status_code == 200
        assert res_update.json()["description"] == "Updated desc"

        # Duplicate
        res_dup = await ac.post(f"/api/types/{type_id}/duplicate")
        assert res_dup.status_code == 201
        dup_id = res_dup.json()["id"]

        # Delete
        res_del = await ac.delete(f"/api/types/{dup_id}")
        assert res_del.status_code == 204


@pytest.mark.asyncio
async def test_excel_upload_and_validate():
    sample_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "donnees.xlsx"))
    if not os.path.exists(sample_path):
        pytest.skip("sample_data/donnees.xlsx not found")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with open(sample_path, "rb") as fh:
            files = {"file": ("donnees.xlsx", fh.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            res = await ac.post("/api/excel/upload", files=files)
            assert res.status_code == 200
            data = res.json()
            assert "sheet_names" in data
            assert len(data["sheet_names"]) > 0
            sheet = data["sheet_names"][0]
            file_path = data["file_path"]

            # Validate
            res_val = await ac.post("/api/excel/validate", json={
                "file_path": file_path,
                "sheet_name": sheet,
                "email_column": "email",
                "name_column": "participant_name",
            })
            assert res_val.status_code == 200
            val_data = res_val.json()
            assert val_data["valid_rows"] > 0
