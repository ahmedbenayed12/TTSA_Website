"""Async SQLAlchemy database setup.
Provides engine, session factory, base model class, and dependency injection helper.
"""
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.config import get_settings

# Lazily created engine — built once at import time using resolved settings
settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,          # Set True for SQL debug logging
    future=True,
)

# Session factory — reused across requests
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# Declarative base shared by all ORM models
Base = declarative_base()


async def get_db() -> AsyncSession:  # type: ignore[return]
    """FastAPI dependency that yields an async database session.

    Usage::

        @router.get("/")
        async def handler(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all database tables defined in ORM models.

    Called once during application startup via the lifespan context manager.
    """
    # Import models here to ensure they are registered with Base before create_all
    from app.models import attestation  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
