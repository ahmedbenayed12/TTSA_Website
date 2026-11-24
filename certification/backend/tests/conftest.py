"""Pytest configuration and fixtures."""
import pytest_asyncio
from app.database import init_db
from app.main import seed_initial_data


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()
    await seed_initial_data()

