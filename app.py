import asyncio
import hashlib
import hmac
import json
import logging
import os
import shutil
from pathlib import Path
from urllib.parse import parse_qs

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand

from config import settings, logger
from core.reminder import reminder_loop
from bot.router import register_handlers
from bot.webapp_handler import router as webapp_router

from storage.db import (
    init_db, get_db, get_user_readings_by_month, save_reading,
    get_or_create_user, get_user_by_tg_id, update_last_active,
    get_reading_by_id, save_followup, get_followups, count_followups,
    get_recent_guide_texts,
)
from core.tarot import draw_cards
from core.llm import interpret_reading, interpret_followup, close_client
from core.quota import check_quota

# Follow-up questions allowed per single reading
FOLLOWUP_LIMIT = 15


def verify_telegram_init_data(init_data: str) -> dict | None:
    """Verify Telegram WebApp initData and return parsed user data."""
    try:
        parsed = parse_qs(init_data)
        hash_value = parsed.pop('hash', [None])[0]
        if not hash_value:
            return None

        items = sorted(
            [(k, v[0]) for k, v in parsed.items()],
            key=lambda x: x[0]
        )
        check_string = '\n'.join(f"{k}={v}" for k, v in items)

        secret_key = hmac.new(
            b"WebAppData",
            settings.BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()

        signature = hmac.new(
            secret_key,
            check_string.encode(),
            hashlib.sha256
        ).hexdigest()

        if signature != hash_value:
            return None

        user_data = parsed.get('user', [None])[0]
        if user_data:
            return json.loads(user_data)
        return None
    except Exception:
        return None


async def start_polling(bot: Bot, dp: Dispatcher) -> None:
    await dp.start_polling(bot)


async def handle_readings(request):
    init_data = request.query.get('init_data', '')
    user = verify_telegram_init_data(init_data)
    if not user:
        return web.json_response({"readings": []})
    tg_id = user.get('id', 0)
    year = request.query.get('year', '')
    month = request.query.get('month', '')
    if not tg_id or not year or not month:
        return web.json_response({"readings": []})
    db = await get_db()
    rows = await get_user_readings_by_month(db, tg_id, year, month)
    return web.json_response({"readings": rows})


async def handle_disk_usage(request):
    db_path = settings.DB_PATH
    db_dir = os.path.dirname(db_path)

    usage = {}
    try:
        du = shutil.disk_usage(db_dir)
        usage["disk"] = {
            "total": du.total,
            "used": du.used,
            "free": du.free,
            "total_mb": round(du.total / 1048576, 1),
            "used_mb": round(du.used / 1048576, 1),
            "free_mb": round(du.free / 1048576, 1),
            "pct_used": round(du.used / du.total * 100, 1),
        }
    except Exception as e:
        usage["disk"] = {"error": str(e)}

    for suffix in ("", "-wal", "-shm"):
        f = db_path + suffix
        try:
            sz = os.path.getsize(f)
            usage[f"db{suffix}"] = {"bytes": sz, "mb": round(sz / 1048576, 2)}
        except OSError:
            usage[f"db{suffix}"] = None

    # WAL checkpoint status — read-only, no checkpoint
    from storage.db import get_db
    try:
        db = await get_db()
        cursor = await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        row = await cursor.fetchone()
        usage["wal_checkpoint"] = {"result": row[0] if row else "unknown",
                                    "pages": row[1] if row and len(row) > 1 else 0,
                                    "checkpointed": row[2] if row and len(row) > 2 else 0}
    except Exception as e:
        usage["wal_checkpoint"] = {"error": str(e)}

    return web.json_response(usage)


async def handle_character(request):
    """Return the user's active character/guide."""
    init_data = request.query.get('init_data', '')
    user_data = verify_telegram_init_data(init_data)
    if not user_data:
        return web.json_response({"character_id": "shadow_walker"})
    tg_id = user_data.get('id', 0)
    if not tg_id:
        return web.json_response({"character_id": "shadow_walker"})
    db = await get_db()
    user = await get_user_by_tg_id(db, tg_id)
    char_id = user.character_id if user else "shadow_walker"
    return web.json_response({"character_id": char_id})


async def handle_spread(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    init_data = body.get('init_data', '')
    user_data = verify_telegram_init_data(init_data)
    if not user_data:
        return web.json_response({"error": "unauthorized"}, status=403)
    tg_id = user_data.get('id', 0)
    spread_type = body.get('spread_type', 1)
    question = body.get('question')
    character_id = body.get('character_id', 'shadow_walker')
    if not tg_id:
        return web.json_response({"error": "tg_id required"}, status=400)

    # Quota check — frontend sends spread_type=1 with no question for daily card
    is_daily = spread_type == "daily" or (spread_type in (1, "1") and not question)
    spread_type_str = "daily" if is_daily else "non_daily"
    db = await get_db()
    user = await get_or_create_user(db, tg_id)
    quota = await check_quota(db, user.id, tg_id, spread_type_str)
    if not quota["ok"]:
        return web.json_response({"error": quota["reason"]}, status=429)

    # Normalize numeric spread type ("3" → 3)
    try:
        st = int(spread_type) if not is_daily else 1
    except (TypeError, ValueError):
        st = 1

    # Daily is now a 3-card spread (Energy / Challenge / Advice of the day)
    count = 3 if is_daily else (3 if st == 3 else 1)
    cards = draw_cards(count)

    # Recent texts by this guide → anti-repetition in the prompt
    avoid_texts = await get_recent_guide_texts(db, user.id, character_id)

    interpretation = await interpret_reading(
        question=question,
        cards=cards,
        character_id=character_id,
        spread_type="daily" if is_daily else st,
        avoid_texts=avoid_texts,
    )
    await update_last_active(db, tg_id)
    saved = await save_reading(
        db=db,
        user_id=user.id,
        type="daily" if is_daily else f"spread_{st}",
        question=question,
        cards_data={"cards": cards, "spread_type": "daily" if is_daily else st},
        interpretation=interpretation,
        character_id=character_id,
    )
    return web.json_response({
        "reading_id": saved.id,
        "cards": cards,
        "interpretation": interpretation,
        "remaining": quota.get("remaining"),
        "limit": quota.get("limit"),
    })


async def handle_followup(request):
    """Answer a follow-up question about an existing reading (chat with the guide)."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    init_data = body.get('init_data', '')
    user_data = verify_telegram_init_data(init_data)
    if not user_data:
        return web.json_response({"error": "unauthorized"}, status=403)
    tg_id = user_data.get('id', 0)
    reading_id = body.get('reading_id')
    question = (body.get('question') or '').strip()[:500]
    if not tg_id or not reading_id or not question:
        return web.json_response({"error": "reading_id and question required"}, status=400)

    db = await get_db()
    user = await get_or_create_user(db, tg_id)
    try:
        reading = await get_reading_by_id(db, int(reading_id))
    except (TypeError, ValueError):
        reading = None
    if reading is None or reading.user_id != user.id:
        return web.json_response({"error": "reading not found"}, status=404)

    if await count_followups(db, reading.id) >= FOLLOWUP_LIMIT:
        return web.json_response(
            {"error": "ПРОВОДНИЦА ОТВЕТИЛА НА ВСЁ. ЗАДАЙ НОВЫЙ РАСКЛАД."},
            status=429,
        )

    history = await get_followups(db, reading.id)
    avoid_texts = await get_recent_guide_texts(
        db, user.id, reading.character_id, exclude_reading_id=reading.id
    )
    await update_last_active(db, tg_id)

    cards_data = reading.cards_data if isinstance(reading.cards_data, dict) else {}
    reading_payload = {
        "question": reading.question,
        "cards": cards_data.get("cards") or [],
        "interpretation": reading.interpretation if isinstance(reading.interpretation, dict) else {},
    }

    answer = await interpret_followup(
        character_id=reading.character_id or user.character_id,
        reading=reading_payload,
        history=history,
        question=question,
        avoid_texts=avoid_texts,
    )
    await save_followup(db, reading.id, user.id, question, answer)

    remaining = FOLLOWUP_LIMIT - await count_followups(db, reading.id)
    return web.json_response({"answer": answer, "remaining": max(0, remaining)})


@web.middleware
async def cache_control_middleware(request, handler):
    """Long-lived cache for hashed/static assets — big win on repeat opens."""
    resp = await handler(request)
    path = request.path
    if isinstance(resp, web.FileResponse) or getattr(resp, "headers", None) is not None:
        if path.startswith("/_next/") or path.startswith("/cards/") or path.startswith("/guides/"):
            resp.headers.setdefault("Cache-Control", "public, max-age=604800")
        elif path == "/" or path.endswith(".html"):
            resp.headers.setdefault("Cache-Control", "no-cache")
    return resp


def create_webapp() -> web.Application:
    app = web.Application(middlewares=[cache_control_middleware])
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_get('/api/disk', handle_disk_usage)
    app.router.add_get('/api/character', handle_character)
    app.router.add_post('/api/spread', handle_spread)
    app.router.add_post('/api/followup', handle_followup)
    webapp_dir = Path(__file__).parent / "static" / "webapp"
    if webapp_dir.is_dir():
        index = webapp_dir / "index.html"
        if index.exists():
            async def index_handler(_):
                return web.FileResponse(index)
            app.router.add_get("/", index_handler)
        app.router.add_static("/", webapp_dir)

    offer_file = Path(__file__).parent / "static" / "offer" / "index.html"
    if offer_file.exists():
        async def offer_handler(_):
            return web.FileResponse(offer_file)
        app.router.add_get("/offer", offer_handler)
        app.router.add_get("/offer/", offer_handler)

    async def _cleanup(app: web.Application) -> None:
        await close_client()
        try:
            db = await get_db()
            await db.close()
        except RuntimeError:
            pass

    app.on_cleanup.append(_cleanup)
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

    await bot.set_my_commands([
        BotCommand(command="start", description="Меню и расклады"),
        BotCommand(command="subscribe", description="Подписка — 100 раскладов"),
        BotCommand(command="my", description="Сколько раскладов осталось"),
        BotCommand(command="notify", description="Напоминания вкл/выкл"),
    ])

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
