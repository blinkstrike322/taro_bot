import asyncio
import hashlib
import hmac
import json
import logging
import time
from pathlib import Path
from urllib.parse import parse_qs

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand

from config import settings, logger
from core.reminder import reminder_loop
from core.llm import close_shared_client
from bot.router import register_handlers
from bot.webapp_handler import router as webapp_router

from storage.db import init_db, get_db, get_user_readings_by_month, save_reading, get_or_create_user
from core.tarot import draw_cards
from core.llm import interpret_reading
from core.quota import check_quota


# LRU cache for Telegram initData verification results.
# initData strings are large (often >1KB) but their HMAC result is stable for
# the lifetime of a WebApp session (~minutes). Caching avoids re-running HMAC
# + JSON parsing on every /api/spread and /api/readings call from the same
# user within the same session. Entries expire after 5 min so a revoked
# WebApp session won't be trusted indefinitely.
_INIT_DATA_CACHE_TTL = 300  # seconds
_INIT_DATA_CACHE_MAX = 1024
_init_data_cache: dict[str, tuple[float, dict | None]] = {}


class _Sentinel:
    """Marker for cache miss — distinguishable from cached None (invalid sig)."""
    pass


_CACHE_MISS = _Sentinel()


def _cache_get(key: str):
    """Return cached value, or _CACHE_MISS if absent/expired."""
    entry = _init_data_cache.get(key)
    if entry is None:
        return _CACHE_MISS
    ts, value = entry
    if time.monotonic() - ts > _INIT_DATA_CACHE_TTL:
        _init_data_cache.pop(key, None)
        return _CACHE_MISS
    return value


def _cache_set(key: str, value: dict | None) -> None:
    # Bounded LRU: drop oldest if at capacity.
    if len(_init_data_cache) >= _INIT_DATA_CACHE_MAX:
        oldest = next(iter(_init_data_cache))
        _init_data_cache.pop(oldest, None)
    _init_data_cache[key] = (time.monotonic(), value)


def verify_telegram_init_data(init_data: str) -> dict | None:
    """Verify Telegram WebApp initData and return parsed user data.

    Results are cached for ~5 minutes per initData string to avoid
    re-computing HMAC-SHA256 on every API call from the same WebApp session.
    """
    if not init_data:
        return None

    cached = _cache_get(init_data)
    if cached is not _CACHE_MISS:
        return cached

    result = _verify_telegram_init_data_uncached(init_data)
    _cache_set(init_data, result)
    return result


def _verify_telegram_init_data_uncached(init_data: str) -> dict | None:
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
    spread_type_str = "daily" if (spread_type == "daily" or (spread_type in (1, "1") and not question)) else "non_daily"
    db = await get_db()
    user = await get_or_create_user(db, tg_id)
    quota = await check_quota(db, user.id, tg_id, spread_type_str)
    if not quota["ok"]:
        return web.json_response({"error": quota["reason"]}, status=429)

    is_daily = spread_type_str == "daily"
    count = 3 if not is_daily and spread_type == 3 else 1
    cards = draw_cards(count)
    interpretation = await interpret_reading(
        question=question,
        cards=cards,
        character_id=character_id,
        spread_type=spread_type,
    )
    await save_reading(
        db=db,
        user_id=user.id,
        type="daily" if is_daily else f"spread_{spread_type}",
        question=question,
        cards_data={"cards": cards, "spread_type": spread_type},
        interpretation=interpretation,
        character_id=character_id,
    )
    return web.json_response({
        "cards": cards,
        "interpretation": interpretation,
        "remaining": quota.get("remaining"),
        "limit": quota.get("limit"),
    })


@web.middleware
async def cache_control_middleware(request, handler):
    """Add Cache-Control headers to static responses.

    - Hashed assets under /_next/static/* → 1-year immutable cache.
    - Card / guide PNG images → 7-day cache.
    - Everything else (HTML, API) → no-cache.
    """
    response = await handler(request)
    if not isinstance(response, web.FileResponse):
        return response

    path = request.path
    if path.startswith('/_next/static/'):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    elif path.startswith('/cards/') or path.startswith('/guides/'):
        response.headers['Cache-Control'] = 'public, max-age=604800'
    else:
        response.headers['Cache-Control'] = 'no-cache, max-age=0, must-revalidate'
    return response


def create_webapp() -> web.Application:
    app = web.Application(middlewares=[cache_control_middleware])
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_post('/api/spread', handle_spread)
    webapp_dir = Path(__file__).parent / "static" / "webapp"
    if webapp_dir.is_dir():
        index = webapp_dir / "index.html"
        if index.exists():
            async def index_handler(_):
                # index.html should always revalidate so users get new builds
                # without long cache stalls.
                return web.FileResponse(index, headers={
                    'Cache-Control': 'no-cache, max-age=0, must-revalidate',
                })
            app.router.add_get("/", index_handler)
        # Static assets — Cache-Control headers are injected by the middleware
        # above based on path prefix.
        app.router.add_static("/", webapp_dir)

    offer_file = Path(__file__).parent / "static" / "offer" / "index.html"
    if offer_file.exists():
        async def offer_handler(_):
            return web.FileResponse(offer_file, headers={
                'Cache-Control': 'no-cache, max-age=0, must-revalidate',
            })
        app.router.add_get("/offer", offer_handler)
        app.router.add_get("/offer/", offer_handler)

    # Cleanup shared resources on shutdown.
    async def _on_cleanup(_app):
        await close_shared_client()
        logger.info("Shared resources cleaned up")
    app.on_cleanup.append(_on_cleanup)

    return app


async def run_webapp(app: web.Application) -> None:
    runner = web.AppRunner(app, access_log=None, keepalive_timeout=65.0)
    await runner.setup()
    # Larger backlog so connection spikes (e.g. morning push notification wave)
    # don't cause connection refused errors.
    site = web.TCPSite(
        runner,
        "0.0.0.0",
        8080,
        backlog=2048,
    )
    await site.start()
    logger.info("aiohttp server started on port 8080")


async def main() -> None:
    await init_db(settings.DB_PATH)

    bot = Bot(token=settings.BOT_TOKEN)

    await bot.set_my_commands([
        BotCommand(command="start", description="Запустить бота"),
        BotCommand(command="subscribe", description="Купить подписку"),
        BotCommand(command="my", description="Статус подписки"),
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
