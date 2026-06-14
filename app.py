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
import aiosqlite

from storage.db import create_tables, get_user_readings_by_month, save_reading, get_or_create_user
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
    async with aiosqlite.connect(settings.DB_PATH) as db:
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
    )
    async with aiosqlite.connect(settings.DB_PATH) as db:
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


async def handle_card_pick(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    tg_id = body.get('tg_id', 0)
    card_index = body.get('card_index', 0)
    if not tg_id:
        return web.json_response({"error": "tg_id required"}, status=400)
    cards = draw_cards(3)
    chosen = cards[card_index] if 0 <= card_index < len(cards) else cards[0]
    interpretation = await interpret_reading(
        question=None,
        cards=[chosen],
        character_id='shadow_walker',
    )
    async with aiosqlite.connect(settings.DB_PATH) as db:
        user = await get_or_create_user(db, tg_id)
        await save_reading(
            db=db,
            user_id=user.id,
            type="daily",
            question=None,
            cards_data={"chosen_index": card_index, "chosen_card": chosen},
            interpretation=interpretation,
            character_id='shadow_walker',
        )
    return web.json_response({"cards": [chosen], "interpretation": interpretation})


def create_webapp() -> web.Application:
    app = web.Application()
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_post('/api/spread', handle_spread)
    app.router.add_post('/api/card_pick', handle_card_pick)
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
