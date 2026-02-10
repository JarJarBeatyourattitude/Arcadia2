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
            conn.execute(text("CREATE TABLE IF NOT EXISTS rooms (id VARCHAR(120) PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, max_players INTEGER, updated_at DATETIME)"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE rooms ADD COLUMN max_players INTEGER"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE games ADD COLUMN creator_id INTEGER"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE games ADD COLUMN is_public BOOLEAN DEFAULT 1"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE games ADD COLUMN play_count INTEGER DEFAULT 0"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE games ADD COLUMN multiplayer BOOLEAN DEFAULT 0"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE games ADD COLUMN max_players INTEGER"))
        except Exception:
            pass
        try:
            conn.execute(text("CREATE TABLE IF NOT EXISTS parties (id VARCHAR(120) PRIMARY KEY, name VARCHAR(120) NOT NULL, is_private BOOLEAN NOT NULL DEFAULT 0, join_code VARCHAR(40), max_players INTEGER, created_at DATETIME, updated_at DATETIME)"))
        except Exception:
            pass
        try:
            conn.execute(text("CREATE TABLE IF NOT EXISTS party_members (id INTEGER PRIMARY KEY, party_id VARCHAR(120) NOT NULL, user_id INTEGER NOT NULL, joined_at DATETIME, UNIQUE(party_id,user_id))"))
        except Exception:
            pass
        try:
            conn.execute(text("CREATE TABLE IF NOT EXISTS party_votes (id INTEGER PRIMARY KEY, party_id VARCHAR(120) NOT NULL, user_id INTEGER NOT NULL, game_id INTEGER NOT NULL, created_at DATETIME, UNIQUE(party_id,user_id))"))
        except Exception:
            pass
