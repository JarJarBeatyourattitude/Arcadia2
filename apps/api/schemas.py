from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class GameCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=400)
    prompt: str = Field(min_length=1)
    code: str = Field(min_length=1)


class GameOut(BaseModel):
    id: int
    title: str
    description: str
    prompt: str
    code: str
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateIn(BaseModel):
    prompt: str = Field(min_length=1)


class GenerateOut(BaseModel):
    title: str
    description: str
    code: str


class GameVersionOut(BaseModel):
    id: int
    game_id: int
    title: str
    description: str
    prompt: str
    code: str
    action: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class EditIn(BaseModel):
    instruction: str = Field(min_length=1)


class AiIn(BaseModel):
    prompt: str = Field(min_length=1)
    system: str | None = None


class AiOut(BaseModel):
    content: str
