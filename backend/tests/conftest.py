import os
import uuid
from collections.abc import AsyncGenerator, Iterator
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.security import create_access_token

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session", autouse=True)
def agora_env() -> Iterator[None]:
    # AccessToken2 requires 32-char hex UUID-shaped App ID and certificate.
    os.environ["AGORA_APP_ID"] = "a1b2c3d4e5f6478980a1b2c3d4e5f647"
    os.environ["AGORA_APP_CERTIFICATE"] = "f647e5d4c3b2a1808976f5e4d3c2b1a0"
    os.environ["AGORA_CHAT_REST_HOST"] = "https://chat.example.com"
    os.environ["JWT_SECRET"] = "test-jwt-secret-phase2"
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with (
        patch("app.services.agora.register_chat_user", new_callable=AsyncMock) as reg,
        patch("app.services.agora.create_chat_room", new_callable=AsyncMock) as create_room,
    ):
        reg.return_value = None
        create_room.return_value = "mock-chat-room-id"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def expired_token() -> str:
    get_settings.cache_clear()
    return create_access_token(str(uuid.uuid4()), expires_delta=timedelta(seconds=-10))
