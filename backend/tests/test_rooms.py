import pytest
from httpx import AsyncClient


async def _auth_headers(client: AsyncClient, email: str = "host@example.com") -> dict[str, str]:
    signup = await client.post(
        "/auth/signup",
        json={"email": email, "password": "password123", "name": "Host"},
    )
    assert signup.status_code == 201
    token = signup.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_and_list_rooms(client: AsyncClient) -> None:
    headers = await _auth_headers(client)
    created = await client.post(
        "/rooms",
        headers=headers,
        json={"title": "Standup", "max_participants": 5},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "Standup"
    assert body["chat_room_id"] == "mock-chat-room-id"
    assert body["share_path"].startswith("/room/")

    mine = await client.get("/rooms/mine", headers=headers)
    assert mine.status_code == 200
    assert len(mine.json()) == 1


@pytest.mark.asyncio
async def test_join_returns_agora_tokens(client: AsyncClient) -> None:
    headers = await _auth_headers(client, email="joiner@example.com")
    created = await client.post("/rooms", headers=headers, json={"title": "Call"})
    slug = created.json()["slug"]

    joined = await client.post(f"/rooms/{slug}/join", headers=headers)
    assert joined.status_code == 200
    payload = joined.json()
    assert payload["channel"] == slug
    assert payload["app_id"]
    assert payload["rtc_token"]
    assert payload["chat_token"]
    assert payload["chat_user"]
    assert payload["chat_room_id"] == "mock-chat-room-id"
    assert isinstance(payload["uid"], int)


@pytest.mark.asyncio
async def test_get_room_by_slug(client: AsyncClient) -> None:
    headers = await _auth_headers(client, email="viewer@example.com")
    created = await client.post("/rooms", headers=headers, json={"title": "Public"})
    slug = created.json()["slug"]

    # Room info is public (no auth) so share links can load metadata after login redirect.
    got = await client.get(f"/rooms/{slug}")
    assert got.status_code == 200
    assert got.json()["slug"] == slug
