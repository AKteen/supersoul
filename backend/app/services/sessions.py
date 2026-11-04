"""Call session / participant bookkeeping."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import CallSession, Participant, Room, User


def _now() -> datetime:
    return datetime.now(UTC)


async def get_or_open_session(db: AsyncSession, room: Room) -> CallSession:
    result = await db.execute(
        select(CallSession)
        .where(CallSession.room_id == room.id, CallSession.ended_at.is_(None))
        .order_by(CallSession.started_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()
    if session is not None:
        return session
    session = CallSession(room_id=room.id)
    db.add(session)
    await db.flush()
    return session


async def add_participant(db: AsyncSession, session: CallSession, user_id: uuid.UUID) -> Participant:
    result = await db.execute(
        select(Participant).where(
            Participant.session_id == session.id,
            Participant.user_id == user_id,
            Participant.left_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing
    participant = Participant(session_id=session.id, user_id=user_id)
    db.add(participant)
    await db.flush()
    return participant


async def mark_left(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(CallSession).where(CallSession.room_id == room_id, CallSession.ended_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if session is None:
        return
    part = await db.execute(
        select(Participant).where(
            Participant.session_id == session.id,
            Participant.user_id == user_id,
            Participant.left_at.is_(None),
        )
    )
    participant = part.scalar_one_or_none()
    if participant is not None:
        participant.left_at = _now()


async def mark_users_left(db: AsyncSession, room_id: uuid.UUID, user_ids: list[str]) -> None:
    if not user_ids:
        return
    ids = []
    for raw in user_ids:
        try:
            ids.append(uuid.UUID(raw))
        except ValueError:
            continue
    for uid in ids:
        await mark_left(db, room_id, uid)


async def close_session_if_empty(db: AsyncSession, room_id: uuid.UUID, remaining: int) -> None:
    if remaining > 0:
        return
    result = await db.execute(
        select(CallSession).where(CallSession.room_id == room_id, CallSession.ended_at.is_(None))
    )
    session = result.scalar_one_or_none()
    if session is None:
        return
    # Close any still-open participants.
    open_parts = await db.execute(
        select(Participant).where(Participant.session_id == session.id, Participant.left_at.is_(None))
    )
    now = _now()
    for p in open_parts.scalars().all():
        p.left_at = now
    session.ended_at = now


async def list_sessions(db: AsyncSession, room: Room) -> list[CallSession]:
    result = await db.execute(
        select(CallSession)
        .where(CallSession.room_id == room.id)
        .options(selectinload(CallSession.participants).selectinload(Participant.user))
        .order_by(CallSession.started_at.desc())
    )
    return list(result.scalars().all())
