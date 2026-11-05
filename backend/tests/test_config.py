from app.config import normalize_database_url


def test_render_postgres_url_uses_asyncpg_and_ssl() -> None:
    url, connect_args = normalize_database_url(
        "postgres://user:pass@dpg.render.com:5432/supersoul?sslmode=require"
    )
    assert url == "postgresql+asyncpg://user:pass@dpg.render.com:5432/supersoul"
    assert connect_args == {"ssl": True}


def test_render_rejects_localhost_database(monkeypatch) -> None:
    from app.config import _reject_localhost_on_render

    monkeypatch.setenv("RENDER", "true")
    try:
        _reject_localhost_on_render(
            "postgresql+asyncpg://supersoul:supersoul@localhost:5432/supersoul",
            "redis://example.internal:6379/0",
        )
    except RuntimeError as exc:
        assert "Internal Database URL" in str(exc)
    else:
        raise AssertionError("localhost DATABASE_URL should fail on Render")


def test_asyncpg_url_is_unchanged() -> None:
    original = "postgresql+asyncpg://supersoul:supersoul@localhost:5432/supersoul"
    url, connect_args = normalize_database_url(original)
    assert url == original
    assert connect_args == {}
