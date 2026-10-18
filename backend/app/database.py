from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, LargeBinary, String, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./fieldwise.db")
    # Railway may supply the legacy postgres:// scheme; psycopg 3 uses this URL.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgres://")
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


_url = database_url()
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}
engine = create_engine(_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class PredictionRecord(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), default="leaf-image")
    crop: Mapped[str] = mapped_column(String(120))
    disease: Mapped[str] = mapped_column(String(180))
    predicted_class: Mapped[str] = mapped_column(String(255))
    confidence: Mapped[float] = mapped_column(Float)
    is_healthy: Mapped[bool] = mapped_column(Boolean)
    image_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    image_content_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_dataset: Mapped[str | None] = mapped_column(String(160), nullable=True)
    dataset_split: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dataset_image_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_class: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class DatasetImage(Base):
    """Metadata index for Kaggle image files kept on local disk."""

    __tablename__ = "dataset_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    path_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    relative_path: Mapped[str] = mapped_column(String(1024))
    split: Mapped[str] = mapped_column(String(40), index=True)
    class_name: Mapped[str] = mapped_column(String(255), index=True)
    crop: Mapped[str] = mapped_column(String(120))
    disease: Mapped[str] = mapped_column(String(180))
    size_bytes: Mapped[int] = mapped_column(Integer)
    modified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    # Add image columns to databases created by earlier dashboard versions.
    columns = {column["name"] for column in inspect(engine).get_columns("predictions")}
    blob_type = "BLOB" if engine.dialect.name == "sqlite" else "BYTEA"
    with engine.begin() as connection:
        if "image_data" not in columns:
            connection.execute(text(f"ALTER TABLE predictions ADD COLUMN image_data {blob_type}"))
        if "image_content_type" not in columns:
            connection.execute(text("ALTER TABLE predictions ADD COLUMN image_content_type VARCHAR(80)"))
        migrations = {
            "source_dataset": "VARCHAR(160)",
            "dataset_split": "VARCHAR(40)",
            "dataset_image_id": "INTEGER",
            "expected_class": "VARCHAR(255)",
            "is_correct": "BOOLEAN",
        }
        for column, sql_type in migrations.items():
            if column not in columns:
                connection.execute(text(f"ALTER TABLE predictions ADD COLUMN {column} {sql_type}"))
