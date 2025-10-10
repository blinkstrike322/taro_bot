# main.py
import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from dotenv import load_dotenv
from pydantic import BaseSettings
from bot.handlers import register_handlers
from core.tarot import validate_cards

load_dotenv()

class Settings(BaseSettings):
  BOT_TOKEN: str

  class Config:
    env_file = ".env"
    env_file_encoding = "utf-8"

settings = Settings()

async def main():
  logging.basicConfig(level=logging.INFO)
  logger = logging.getLogger("taro_bot")
  try:
    validate_cards()
  except Exception:
    logger.exception("Валидация карт не пройдена — исправь структуру data/static и перезапусти")
    raise
  bot = Bot(token=settings.BOT_TOKEN)
  dp = Dispatcher(storage=MemoryStorage())
  register_handlers(dp)
  await dp.start_polling(bot)

if __name__ == "__main__":
  asyncio.run(main())
