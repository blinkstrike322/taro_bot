import asyncio
import logging
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from config import settings, logger
from core.reminder import reminder_loop
from bot.router import register_handlers
from bot.webapp_handler import router as webapp_router
from storage.db import create_tables


async def start_polling(bot: Bot, dp: Dispatcher) -> None:
    await dp.start_polling(bot)


def create_webapp() -> web.Application:
    app = web.Application()
    webapp_dir = Path(__file__).parent / "webapp"
    if webapp_dir.is_dir():
        app.router.add_static("/", webapp_dir, append_version=True)
    return app


async def run_webapp(app: web.Application) -> None:
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)
    await site.start()
    logger.info("aiohttp server started on port 8080")


async def main() -> None:
    await create_tables(settings.DB_PATH)

    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    register_handlers(dp)
    dp.include_router(webapp_router)

    webapp = create_webapp()

    await asyncio.gather(
        run_webapp(webapp),
        start_polling(bot, dp),
        reminder_loop(bot),
    )


if __name__ == "__main__":
    asyncio.run(main())
