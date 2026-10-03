import logging
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    BOT_TOKEN: str
    OPENROUTER_API_KEY: str
    OPENCODE_ZEN_KEY: str = ""
    OPENCODE_ZEN_SESSION: str = ""  # заголовок x-session-id для Zen free tier
    DB_PATH: str = "/data/taro_bot.db"
    WEBAPP_URL: str = "http://localhost:8080"
    OFFER_URL: str = "http://localhost:8080/offer/"
    ADMIN_IDS: str = ""  # comma-separated tg_ids, e.g. "123456,789012"
    TESTER_IDS: str = ""  # comma-separated tg_ids — unlimited spreads like admins

    # .env ищется рядом с config.py: при запуске из другого CWD (systemd,
    # контейнер) относительный ".env" молча не находился и применялись
    # dev-дефолты (WEBAPP_URL=http://localhost:8080 в проде).
    class Config:
        env_file = Path(__file__).resolve().parent / ".env"
        env_file_encoding = "utf-8"


settings = Settings()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("taro_bot")
