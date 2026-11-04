import pytest
from httpx import AsyncClient


async def _signup(client: AsyncClient, email: str) -> dict[str, str]:
    res = await client.post(
        "/auth/signup",
        json={"email": email, "password": "password123", "name": email.split("@")[0]},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_join_over_limit_returns_409(client: AsyncClient) -> None:
    host = await _signup(client, "host-limit@example.com")
    created = await client.post(
        "/rooms",
        headers=host,
        json={"title": "Tiny", "max_participants": 2},
    )
    assert created.status_code == 201
    slug = created.json()["slug"]

    await client.post(f"/rooms/{slug}/join", headers=host)

    u2 = await _signup(client, "u2-limit@example.com")
    await client.post(f"/rooms/{slug}/join", headers=u2)

    u3 = await _signup(client, "u3-limit@example.com")
    overcrowded = await client.post(f"/rooms/{slug}/join", headers=u3)
    assert overcrowded.status_code == 409
    assert "full" in overcrowded.json()["detail"].lower()


@pytest.mark.asyncio
async def test_join_rate_limit_returns_429(client: AsyncClient) -> None:
    headers = await _signup(client, "rate@example.com")
    created = await client.post("/rooms", headers=headers, json={"title": "RL", "max_participants": 50})
    slug = created.json()["slug"]

    last_status = 200
    for _ in range(25):
        last_status = (await client.post(f"/rooms/{slug}/join", headers=headers)).status_code
        if last_status == 429:
            break
    assert last_status == 429
