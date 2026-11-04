import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Room, User
from app.schemas import JoinResponse, RoomCreateRequest, RoomOut
from app.services import agora
from app.services.agora import AgoraAPIError, AgoraConfigError

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _new_slug() -> str:
    return secrets.token_urlsafe(9).replace("_", "").replace("-", "")[:12].lower()


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoomOut:
    slug = _new_slug()
    try:
        chat_room_id = await agora.create_chat_room(
            name=body.title,
            description=f"SuperSoul room {slug}",
            owner=current_user.chat_username,
            max_users=body.max_participants,
        )
    except AgoraConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AgoraAPIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    room = Room(
        slug=slug,
        title=body.title.strip(),
        host_id=current_user.id,
        max_participants=body.max_participants,
        chat_room_id=chat_room_id,
        is_active=True,
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return RoomOut.from_room(room)


@router.get("/mine", response_model=list[RoomOut])
async def my_rooms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RoomOut]:
    result = await db.execute(
        select(Room).where(Room.host_id == current_user.id).order_by(Room.created_at.desc())
    )
    rooms = result.scalars().all()
    return [RoomOut.from_room(r) for r in rooms]


@router.get("/{slug}", response_model=RoomOut)
async def get_room(slug: str, db: AsyncSession = Depends(get_db)) -> RoomOut:
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if room is None or not room.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return RoomOut.from_room(room)


@router.post("/{slug}/join", response_model=JoinResponse)
async def join_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JoinResponse:
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if room is None or not room.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    settings = get_settings()
    try:
        rtc_token = agora.build_rtc_token(channel=room.slug, uid=current_user.agora_uid)
        chat_token = agora.build_chat_user_token(current_user.chat_username)
    except AgoraConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return JoinResponse(
        app_id=settings.agora_app_id,
        channel=room.slug,
        rtc_token=rtc_token,
        uid=current_user.agora_uid,
        chat_token=chat_token,
        chat_user=current_user.chat_username,
        chat_room_id=room.chat_room_id,
    )
