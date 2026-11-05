from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> tuple[str, dict]:
    """Use asyncpg, and turn Render's postgres:// + sslmode into connect args."""
    raw = url.strip()
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        raw = "postgresql+asyncpg://" + raw[len("postgresql://") :]

    parts = urlsplit(raw)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    connect_args: dict = {}
    sslmode = query.pop("sslmode", None)
    ssl_flag = query.pop("ssl", None)
    if sslmode in {"require", "verify-ca", "verify-full"} or str(ssl_flag).lower() in {"1", "true", "require"}:
        connect_args["ssl"] = True
    cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return cleaned, connect_args


class Settings(BaseSettings):
    """App settings loaded from env / .env at repo root."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://supersoul:supersoul@localhost:5432/supersoul"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 10080
    cors_origins: str = "http://localhost:3000"
    agora_app_id: str = ""
    agora_app_certificate: str = ""
    agora_chat_app_key: str = ""
    agora_chat_rest_host: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        return normalize_database_url(self.database_url)[0]

    @property
    def database_connect_args(self) -> dict:
        return normalize_database_url(self.database_url)[1]


@lru_cache
def get_settings() -> Settings:
    return Settings()
