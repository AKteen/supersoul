import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_signup_returns_token(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/signup",
        json={"email": "alice@example.com", "password": "password123", "name": "Alice"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["token_type"] == "bearer"
    assert isinstance(data["access_token"], str) and data["access_token"]


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient) -> None:
    await client.post(
        "/auth/signup",
        json={"email": "bob@example.com", "password": "password123", "name": "Bob"},
    )
    response = await client.post(
        "/auth/login",
        json={"email": "bob@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient) -> None:
    await client.post(
        "/auth/signup",
        json={"email": "carol@example.com", "password": "password123", "name": "Carol"},
    )
    response = await client.post(
        "/auth/login",
        json={"email": "carol@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token(client: AsyncClient) -> None:
    signup = await client.post(
        "/auth/signup",
        json={"email": "dave@example.com", "password": "password123", "name": "Dave"},
    )
    token = signup.json()["access_token"]
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "dave@example.com"
    assert body["name"] == "Dave"
    assert isinstance(body["agora_uid"], int)


@pytest.mark.asyncio
async def test_expired_token(client: AsyncClient, expired_token: str) -> None:
    response = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
