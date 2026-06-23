import logging
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    BOT_TOKEN: str
    OPENROUTER_API_KEY: str
    DB_PATH: str = "/data/taro_bot.db"
    WEBAPP_URL: str = "http://localhost:8080"
    OFFER_URL: str = "http://localhost:8080/offer/"
    ADMIN_IDS: str = ""  # comma-separated tg_ids, e.g. "123456,789012"
    TESTER_IDS: str = ""  # comma-separated tg_ids — unlimited spreads like admins

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("taro_bot")
