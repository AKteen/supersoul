import time
import uuid

from fastapi import HTTPException, status

from app.services.redis_client import get_redis

PRESENCE_TTL_SECONDS = 90


def _members_key(slug: str) -> str:
    return f"room:{slug}:members"


async def prune_stale(slug: str) -> list[str]:
    """Remove members with score older than 90s. Returns removed user id strings."""
    r = get_redis()
    key = _members_key(slug)
    cutoff = time.time() - PRESENCE_TTL_SECONDS
    stale = await r.zrangebyscore(key, min="-inf", max=cutoff)
    if stale:
        await r.zremrangebyscore(key, min="-inf", max=cutoff)
    return list(stale)


async def join_presence(slug: str, user_id: uuid.UUID, max_participants: int) -> int:
    """ZADD member then ZCARD; if over limit, ZREM and 409."""
    r = get_redis()
    key = _members_key(slug)
    member = str(user_id)
    await prune_stale(slug)
    await r.zadd(key, {member: time.time()})
    count = await r.zcard(key)
    if count > max_participants:
        await r.zrem(key, member)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Room is full",
        )
    return int(count)


async def heartbeat_presence(slug: str, user_id: uuid.UUID) -> None:
    r = get_redis()
    await r.zadd(_members_key(slug), {str(user_id): time.time()})


async def leave_presence(slug: str, user_id: uuid.UUID) -> int:
    r = get_redis()
    key = _members_key(slug)
    await r.zrem(key, str(user_id))
    return int(await r.zcard(key))


async def presence_count(slug: str) -> int:
    await prune_stale(slug)
    return int(await get_redis().zcard(_members_key(slug)))
