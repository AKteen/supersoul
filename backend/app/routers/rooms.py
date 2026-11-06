import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user, get_current_user_beacon
from app.models import Room, User
from app.schemas import CallSessionOut, JoinResponse, ParticipantOut, RoomCreateRequest, RoomOut
from app.services import agora
from app.services.agora import AgoraAPIError, AgoraConfigError
from app.services.presence import heartbeat_presence, join_presence, leave_presence, prune_stale
from app.services.rate_limit import check_rate_limit
from app.services.sessions import (
    add_participant,
    close_session_if_empty,
    get_or_open_session,
    list_sessions,
    mark_left,
    mark_users_left,
)

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _new_slug() -> str:
    return secrets.token_urlsafe(9).replace("_", "").replace("-", "")[:12].lower()


async def _get_active_room(db: AsyncSession, slug: str) -> Room:
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if room is None or not room.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoomOut:
    slug = _new_slug()
    try:
        await agora.register_chat_user(current_user.chat_username)
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
    room = await _get_active_room(db, slug)
    return RoomOut.from_room(room)


@router.post("/{slug}/join", response_model=JoinResponse)
async def join_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JoinResponse:
    await check_rate_limit(f"rl:join:{current_user.id}", limit=20)
    room = await _get_active_room(db, slug)

    stale = await prune_stale(slug)
    await mark_users_left(db, room.id, stale)

    await join_presence(slug, current_user.id, room.max_participants)

    session = await get_or_open_session(db, room)
    await add_participant(db, session, current_user.id)
    await db.commit()

    settings = get_settings()
    try:
        await agora.register_chat_user(current_user.chat_username)
        rtc_token = agora.build_rtc_token(channel=room.slug, uid=current_user.agora_uid)
        share_uid = agora.screen_uid(current_user.agora_uid)
        screen_rtc_token = agora.build_rtc_token(channel=room.slug, uid=share_uid)
        chat_token = agora.build_chat_user_token(current_user.chat_username)
    except AgoraConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AgoraAPIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return JoinResponse(
        app_id=settings.agora_app_id,
        channel=room.slug,
        rtc_token=rtc_token,
        uid=current_user.agora_uid,
        screen_rtc_token=screen_rtc_token,
        screen_uid=share_uid,
        chat_token=chat_token,
        chat_user=current_user.chat_username,
        chat_room_id=room.chat_room_id,
        session_id=session.id,
    )


@router.post("/{slug}/heartbeat")
async def heartbeat(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    room = await _get_active_room(db, slug)
    stale = await prune_stale(slug)
    await mark_users_left(db, room.id, stale)
    await heartbeat_presence(slug, current_user.id)
    await db.commit()
    return {"status": "ok"}


@router.post("/{slug}/leave")
async def leave_room(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_beacon),
) -> dict[str, str]:
    room = await _get_active_room(db, slug)
    remaining = await leave_presence(slug, current_user.id)
    await mark_left(db, room.id, current_user.id)
    await close_session_if_empty(db, room.id, remaining)
    await db.commit()
    return {"status": "left"}


@router.get("/{slug}/sessions", response_model=list[CallSessionOut])
async def room_sessions(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CallSessionOut]:
    room = await _get_active_room(db, slug)
    sessions = await list_sessions(db, room)
    out: list[CallSessionOut] = []
    for s in sessions:
        parts = [
            ParticipantOut(
                user_id=p.user_id,
                name=p.user.name if p.user else "Unknown",
                agora_uid=p.user.agora_uid if p.user else None,
                joined_at=p.joined_at,
                left_at=p.left_at,
            )
            for p in s.participants
        ]
        out.append(
            CallSessionOut(
                id=s.id,
                started_at=s.started_at,
                ended_at=s.ended_at,
                recording_url=s.recording_url,
                transcript=s.transcript,
                participants=parts,
            )
        )
    return out
