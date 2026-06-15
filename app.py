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

from storage.db import init_db, get_db, get_user_readings_by_month, save_reading, get_or_create_user
from core.tarot import draw_cards
from core.llm import interpret_reading


async def start_polling(bot: Bot, dp: Dispatcher) -> None:
    await dp.start_polling(bot)


async def handle_readings(request):
    tg_id = int(request.query.get('tg_id', 0))
    year = request.query.get('year', '')
    month = request.query.get('month', '')
    if not tg_id or not year or not month:
        return web.json_response({"readings": []})
    db = await get_db()
    rows = await get_user_readings_by_month(db, tg_id, year, month)
    return web.json_response({"readings": rows})


async def handle_spread(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    tg_id = body.get('tg_id', 0)
    spread_type = body.get('spread_type', 1)
    question = body.get('question')
    character_id = body.get('character_id', 'shadow_walker')
    if not tg_id:
        return web.json_response({"error": "tg_id required"}, status=400)
    count = 3 if spread_type == 3 else 1
    cards = draw_cards(count)
    interpretation = await interpret_reading(
        question=question,
        cards=cards,
        character_id=character_id,
        spread_type=spread_type,
    )
    db = await get_db()
    user = await get_or_create_user(db, tg_id)
    await save_reading(
        db=db,
        user_id=user.id,
        type=f"spread_{spread_type}",
        question=question,
        cards_data={"cards": cards, "spread_type": spread_type},
        interpretation=interpretation,
        character_id=character_id,
    )
    return web.json_response({"cards": cards, "interpretation": interpretation})


def create_webapp() -> web.Application:
    app = web.Application()
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_post('/api/spread', handle_spread)
    webapp_dir = Path(__file__).parent / "static" / "webapp"
    if webapp_dir.is_dir():
        index = webapp_dir / "index.html"
        if index.exists():
            async def index_handler(_):
                return web.FileResponse(index)
            app.router.add_get("/", index_handler)
        app.router.add_static("/", webapp_dir)
    return app


async def run_webapp(app: web.Application) -> None:
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)
    await site.start()
    logger.info("aiohttp server started on port 8080")


async def main() -> None:
    await init_db(settings.DB_PATH)

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
