from fastapi import HTTPException, status

from app.services.redis_client import get_redis


async def check_rate_limit(key: str, limit: int, window_seconds: int = 60) -> None:
    """INCR + EXPIRE window; raise 429 when over limit."""
    r = get_redis()
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, window_seconds)
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
