import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str
    agora_uid: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RoomCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    max_participants: int = Field(default=10, ge=2, le=50)


class RoomOut(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    host_id: uuid.UUID
    max_participants: int
    chat_room_id: str | None
    is_active: bool
    created_at: datetime
    share_path: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_room(cls, room: object) -> "RoomOut":
        return cls(
            id=room.id,  # type: ignore[attr-defined]
            slug=room.slug,  # type: ignore[attr-defined]
            title=room.title,  # type: ignore[attr-defined]
            host_id=room.host_id,  # type: ignore[attr-defined]
            max_participants=room.max_participants,  # type: ignore[attr-defined]
            chat_room_id=room.chat_room_id,  # type: ignore[attr-defined]
            is_active=room.is_active,  # type: ignore[attr-defined]
            created_at=room.created_at,  # type: ignore[attr-defined]
            share_path=f"/room/{room.slug}",  # type: ignore[attr-defined]
        )


class JoinResponse(BaseModel):
    app_id: str
    channel: str
    rtc_token: str
    uid: int
    screen_rtc_token: str
    screen_uid: int
    chat_token: str
    chat_user: str
    chat_room_id: str | None
    session_id: uuid.UUID | None = None


class ParticipantOut(BaseModel):
    user_id: uuid.UUID
    name: str
    agora_uid: int | None = None
    joined_at: datetime
    left_at: datetime | None

    model_config = {"from_attributes": True}


class CallSessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    recording_url: str | None
    transcript: str | None
    participants: list[ParticipantOut]

    model_config = {"from_attributes": True}

