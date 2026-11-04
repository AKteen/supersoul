from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
