"""Agora RTC + Chat helpers. Token builders are vendored from AgoraIO/Tools."""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings
from app.vendor.agora import ChatTokenBuilder, Role_Publisher, RtcTokenBuilder

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 3600
SCREEN_UID_OFFSET = 1_000_000_000
_AGORA_UID_MAX = 2**32 - 1


class AgoraConfigError(RuntimeError):
    """Raised when required Agora credentials are missing."""


class AgoraAPIError(RuntimeError):
    """Raised when an Agora REST call fails."""


def _require_rtc_creds() -> tuple[str, str]:
    settings = get_settings()
    if not settings.agora_app_id or not settings.agora_app_certificate:
        raise AgoraConfigError("AGORA_APP_ID and AGORA_APP_CERTIFICATE are required")
    return settings.agora_app_id, settings.agora_app_certificate


def _require_chat_rest() -> tuple[str, str, str]:
    settings = get_settings()
    app_id, app_certificate = _require_rtc_creds()
    if not settings.agora_chat_rest_host:
        raise AgoraConfigError("AGORA_CHAT_REST_HOST is required for Chat REST")
    return app_id, app_certificate, settings.agora_chat_rest_host.rstrip("/")


def screen_uid(agora_uid: int) -> int:
    uid = agora_uid + SCREEN_UID_OFFSET
    if uid > _AGORA_UID_MAX:
        raise AgoraConfigError("screen uid is outside Agora's 32-bit range")
    return uid


def build_rtc_token(*, channel: str, uid: int) -> str:
    app_id, app_certificate = _require_rtc_creds()
    # Official AccessToken2 API: expire values are seconds-from-now, not unix ts.
    return RtcTokenBuilder.build_token_with_uid(
        app_id,
        app_certificate,
        channel,
        uid,
        Role_Publisher,
        TOKEN_TTL_SECONDS,
        TOKEN_TTL_SECONDS,
    )


def build_chat_user_token(chat_user_id: str) -> str:
    app_id, app_certificate = _require_rtc_creds()
    return ChatTokenBuilder.build_user_token(
        app_id, app_certificate, chat_user_id, TOKEN_TTL_SECONDS
    )


def build_chat_app_token() -> str:
    app_id, app_certificate = _require_rtc_creds()
    return ChatTokenBuilder.build_app_token(app_id, app_certificate, TOKEN_TTL_SECONDS)


def _rest_base(host: str, app_id: str) -> str:
    # Current Agora Chat REST path style from official docs.
    return f"{host}/app-id/{app_id}"


async def register_chat_user(username: str) -> None:
    app_id, _cert, host = _require_chat_rest()
    token = build_chat_app_token()
    url = f"{_rest_base(host, app_id)}/users"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={"username": username},
        )
    # 200 = created; some deployments return error if user already exists — treat as ok.
    if response.status_code == 200:
        return
    body = response.text
    if response.status_code in {400, 409} and "already" in body.lower():
        logger.info("Agora chat user already exists: %s", username)
        return
    # Duplicate username codes vary; accept non-fatal duplicates by keyword.
    if response.status_code == 400 and ("duplicate" in body.lower() or "exist" in body.lower()):
        return
    raise AgoraAPIError(f"register_chat_user failed ({response.status_code}): {body}")


async def create_chat_room(
    *,
    name: str,
    description: str,
    owner: str,
    max_users: int = 10,
) -> str:
    app_id, _cert, host = _require_chat_rest()
    token = build_chat_app_token()
    url = f"{_rest_base(host, app_id)}/chatrooms"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={
                "name": name[:128],
                "description": description[:512],
                "maxusers": max_users,
                "owner": owner,
            },
        )
    if response.status_code != 200:
        raise AgoraAPIError(f"create_chat_room failed ({response.status_code}): {response.text}")
    data = response.json()
    chat_room_id = (data.get("data") or {}).get("id")
    if not chat_room_id:
        raise AgoraAPIError(f"create_chat_room missing id in response: {data}")
    return str(chat_room_id)
