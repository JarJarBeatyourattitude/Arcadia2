from __future__ import annotations

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from .db import Base


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(String(400), nullable=False)
    prompt = Column(Text, nullable=False)
    code = Column(Text, nullable=False)
    creator_id = Column(Integer, nullable=True, index=True)
    is_public = Column(Boolean, nullable=False, default=True)
    play_count = Column(Integer, nullable=False, default=0)
    multiplayer = Column(Boolean, nullable=False, default=False)
    max_players = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GameVersion(Base):
    __tablename__ = "game_versions"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(String(400), nullable=False)
    prompt = Column(Text, nullable=False)
    code = Column(Text, nullable=False)
    action = Column(String(50), nullable=False, default="edit")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String(120), primary_key=True, index=True)
    count = Column(Integer, nullable=False, default=0)
    max_players = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Party(Base):
    __tablename__ = "parties"

    id = Column(String(120), primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    is_private = Column(Boolean, nullable=False, default=False)
    join_code = Column(String(40), nullable=True)
    max_players = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PartyMember(Base):
    __tablename__ = "party_members"
    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uniq_party_member"),)

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(String(120), ForeignKey("parties.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())


class PartyVote(Base):
    __tablename__ = "party_votes"
    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uniq_party_vote"),)

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(String(120), ForeignKey("parties.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), unique=True, index=True, nullable=False)
    username = Column(String(80), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String(120), primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GameVote(Base):
    __tablename__ = "game_votes"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GameComment(Base):
    __tablename__ = "game_comments"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
