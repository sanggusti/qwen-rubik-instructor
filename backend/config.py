"""Backend settings, loaded from the repo-root .env (which holds DASHSCOPE_API_KEY)."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    dashscope_api_key: str = ""
    # Qwen model id served over DashScope's OpenAI-compatible endpoint.
    qwen_model: str = "qwen3.7-plus"
    dashscope_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Per-request LLM timeout (seconds) so a slow/hung call can't stall the stream.
    qwen_timeout_s: float = 20.0
    # How many frames to narrate concurrently (frames are independent LLM calls).
    narration_workers: int = 6


settings = Settings()
