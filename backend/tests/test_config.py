from app.config import normalize_database_url


def test_render_postgres_url_uses_asyncpg_and_ssl() -> None:
    url, connect_args = normalize_database_url(
        "postgres://user:pass@dpg.render.com:5432/supersoul?sslmode=require"
    )
    assert url == "postgresql+asyncpg://user:pass@dpg.render.com:5432/supersoul"
    assert connect_args == {"ssl": True}


def test_asyncpg_url_is_unchanged() -> None:
    original = "postgresql+asyncpg://supersoul:supersoul@localhost:5432/supersoul"
    url, connect_args = normalize_database_url(original)
    assert url == original
    assert connect_args == {}
