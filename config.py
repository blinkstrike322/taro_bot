import logging
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    BOT_TOKEN: str
    OPENROUTER_API_KEY: str
    DB_PATH: str = "/data/taro_bot.db"
    WEBAPP_URL: str = "http://localhost:8080"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("taro_bot")
