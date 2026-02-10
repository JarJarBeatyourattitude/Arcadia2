from __future__ import annotations

from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

DB_PATH = Path(__file__).parent / "game_factory.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    # Lightweight migration for new columns
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE game_versions ADD COLUMN action VARCHAR(50)"))
        except Exception:
            pass
        try:
            conn.execute(text("CREATE TABLE IF NOT EXISTS rooms (id VARCHAR(120) PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, updated_at DATETIME)"))
        except Exception:
            pass
