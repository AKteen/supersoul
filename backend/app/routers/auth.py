import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserOut
from app.security import create_access_token, hash_password, verify_password
from app.services import agora
from app.services.agora import AgoraAPIError, AgoraConfigError
from app.services.rate_limit import check_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


async def _next_agora_uid(db: AsyncSession) -> int:
    """Allocate a unique RTC uid (Agora requires an int)."""
    result = await db.execute(select(func.max(User.agora_uid)))
    current = result.scalar_one_or_none()
    if current is None:
        return secrets.randbelow(1_000_000_000) + 1
    return int(current) + 1


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        agora_uid=await _next_agora_uid(db),
    )
    db.add(user)
    try:
        await db.flush()
        try:
            await agora.register_chat_user(user.chat_username)
        except AgoraConfigError:
            # Chat not configured yet — allow local auth; room create will still need Chat.
            pass
        except AgoraAPIError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Agora Chat registration failed: {exc}",
            ) from exc
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered") from exc
    await db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    await check_rate_limit(f"rl:login:{client_ip}", limit=10)
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
