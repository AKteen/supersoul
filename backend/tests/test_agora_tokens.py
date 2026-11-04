from app.services.agora import build_chat_app_token, build_chat_user_token, build_rtc_token


def test_rtc_and_chat_tokens_are_nonempty() -> None:
    rtc = build_rtc_token(channel="demo-channel", uid=42)
    chat_user = build_chat_user_token("abc123")
    chat_app = build_chat_app_token()
    assert rtc.startswith("007")
    assert chat_user.startswith("007")
    assert chat_app.startswith("007")
