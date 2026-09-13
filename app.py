import asyncio
import hashlib
import hmac
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand
from aiohttp import web

from bot.router import register_handlers
from config import logger, settings
from core.llm import interpret_reading
from core.prompts import _positions_for_question
from core.quota import reserve_quota
from core.reminder import reminder_loop
from core.tarot import draw_cards
from storage.db import (
    STATUS_COMPLETED,
    STATUS_FAILED,
    complete_reading,
    fail_reading,
    get_db,
    get_or_create_user,
    get_reading_by_token,
    get_user_by_tg_id,
    get_user_readings_by_month,
    init_db,
    mark_reading_processing,
    sweep_stale_reservations,
)

# initData старше этого срока не принимается: подпись остаётся валидной
# навсегда, а значит без проверки возраста старые данные можно переиспользовать.
INIT_DATA_MAX_AGE = 24 * 3600


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

        # свежесть initData: валидная подпись бессрочна, доверяем только недавним
        auth_date = parsed.get('auth_date', [None])[0]
        if not auth_date:
            return None
        if abs(time.time() - int(auth_date)) > INIT_DATA_MAX_AGE:
            logger.warning("initData rejected: auth_date too old")
            return None

        user_data = parsed.get('user', [None])[0]
        if user_data:
            return json.loads(user_data)
        return None
    except Exception:
        return None


def _admin_tg_ids() -> set[int]:
    raw = settings.ADMIN_IDS or ""
    return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}


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
    # Операционная информация (размер диска/БД/WAL) наружу не отдаётся —
    # только администраторам из ADMIN_IDS через валидный initData.
    init_data = request.query.get('init_data', '')
    user = verify_telegram_init_data(init_data)
    if not user or user.get('id') not in _admin_tg_ids():
        return web.json_response({"error": "forbidden"}, status=403)

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

    # Принудительный checkpoint(TRUNCATE) — сервисная операция: подрезает WAL.
    # Возможна потому, что endpoint доступен только админам (см. выше).
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


# ── Two-phase spread: cards first, interpretation while the user flips ──
# Источник правды — БД (readings.client_token → статус). Процессного словаря
# _pending_spreads нет: поллинг и restart-recovery идут через DB-функции.
#
# _user_locks убран: квота резервируется атомарным INSERT...SELECT guard
# (см. storage.db.reserve_reading) на единственном разделяемом aiosqlite-
# соединении, поэтому межпроцессная (точнее, внутрипроцессная asyncio)
# гонка между check_quota и INSERT невозможна — SQLite сериализует запись,
# и проигравший конкурент получает отказ из guard'а (reserve_quota уже
# делает повторную проверку и отдаёт корректный отказ). Проверено тестом
# test_concurrent_begin_last_slot_single_winner.


async def _whisper_task(token: str, ctx: dict, cards: list[dict]) -> None:
    """Background LLM interpretation + DB save for a two-phase spread.

    Слот квоты уже зарезервирован в момент /begin (reserve_quota): здесь
    мы только дописываем толкование. Если шёпот сорвался — помечаем статус
    failed (слот квоты освобождается, т.к. failed-строки не считаются в
    лимите), а поллинг по токену отдаст причину вместо 404.
    """
    try:
        await mark_reading_processing(await get_db(), ctx["reading_id"])
        interpretation = await interpret_reading(
            question=ctx["question"],
            cards=cards,
            character_id=ctx["character_id"],
            spread_type=ctx["spread_type"],
        )
        await complete_reading(
            db=await get_db(),
            reading_id=ctx["reading_id"],
            interpretation=interpretation,
        )
    except Exception as e:
        try:
            await fail_reading(
                await get_db(),
                ctx["reading_id"],
                str(e) or "interpretation failed",
            )
        except Exception:
            logger.exception(
                "Не удалось пометить сбой расклада reading_id=%s", ctx["reading_id"]
            )


async def handle_spread_begin(request):
    """Phase 1: reserve quota, draw cards, spawn the LLM whisper, return at once."""
    token = uuid.uuid4().hex[:20]
    parsed = await _spread_request_context(request, client_token=token)
    if isinstance(parsed, web.Response):
        return parsed
    ctx = parsed
    cards = ctx["cards"]

    # Токен сохраняется в строке readings (client_token) при резерве:
    # маппинг переживает перезапуск. Фоновый шёпот пишет статус в ту же строку.
    asyncio.create_task(_whisper_task(token, ctx, cards))

    response = {
        "cards": cards,
        "token": token,
        "remaining": ctx["quota"].get("remaining"),
        "limit": ctx["quota"].get("limit"),
    }
    # Динамические позиции трёхкарточного расклада — фронтенд показывает их
    # сразу после раздачи (вместо легаси «прошлое·настоящее·будущее»).
    if ctx.get("positions"):
        response["positions"] = ctx["positions"]
    return web.json_response(response)


async def handle_spread_poll(request):
    """Phase 2: is the whisper ready? Requires valid initData + ownership."""
    token = request.query.get("token", "")
    init_data = request.query.get("init_data", "")
    user = verify_telegram_init_data(init_data)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=403)
    tg_id = user.get("id") or 0
    if not tg_id:
        return web.json_response({"error": "unauthorized"}, status=403)

    db = await get_db()
    row = await get_reading_by_token(db, token)
    if row is None:
        return web.json_response({"error": "unknown token"}, status=404)
    if row["tg_id"] != tg_id:
        return web.json_response({"error": "forbidden"}, status=403)

    # Статусы — закрытый набор, но незнакомый/промежуточный статус безопасно
    # трактовать как «ещё не готово»: поллинг просто продолжит ждать.
    status = row["status"]
    if status == STATUS_COMPLETED:
        return web.json_response({"ready": True, "interpretation": row["interpretation"]})
    if status == STATUS_FAILED:
        return web.json_response(
            {"ready": True, "error": row["error"] or "Толкование не удалось"}
        )
    return web.json_response({"ready": False})


async def _spread_request_context(request, client_token: str):
    """Shared prelude for spread handlers: auth → reserve quota → draw.

    Returns a context dict or a ready-to-send error Response.
    """
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    init_data = body.get("init_data", "")
    user_data = verify_telegram_init_data(init_data)
    if not user_data:
        return web.json_response({"error": "unauthorized"}, status=403)
    tg_id = user_data.get("id", 0)
    spread_type = body.get("spread_type", 1)
    question = body.get("question")
    if not tg_id:
        return web.json_response({"error": "tg_id required"}, status=400)

    db = await get_db()
    user = await get_or_create_user(db, tg_id)

    # Quota — frontend sends spread_type=1 with no question for daily card
    spread_type_str = "daily" if (spread_type == "daily" or (spread_type in (1, "1") and not question)) else "non_daily"
    is_daily = spread_type_str == "daily"
    count = 3 if (not is_daily and str(spread_type) == "3") else 1
    cards = draw_cards(count)
    reading_type = "daily" if is_daily else f"spread_{spread_type}"
    positions = _positions_for_question(question) if count == 3 else None

    # Проводника определяет сервер: Telegram identity → пользователь БД.
    # Поле character_id из тела запроса — только UI-подсказка и не используется.
    character_id = user.character_id

    # Резервируем слот квоты атомарно — до запуска LLM (см. reserve_quota).
    # Без _user_lock: резерв атомарен на уровне SQL (см. комментарий выше).
    cards_data = {"cards": cards, "spread_type": spread_type}
    quota = await reserve_quota(
        db,
        user_id=user.id,
        tg_id=tg_id,
        spread_type=spread_type_str,
        question=question,
        cards_data=cards_data,
        character_id=character_id,
        reading_type=reading_type,
        client_token=client_token,
    )
    if not quota["ok"]:
        return web.json_response(
            {
                "error": quota.get("reason", "Лимит исчерпан."),
                "needs_subscription": bool(quota.get("needs_subscription")),
            },
            status=429,
        )

    return {
        "db": db,
        "user_id": user.id,
        "cards": cards,
        "question": question,
        "character_id": character_id,
        "spread_type": spread_type,
        "reading_type": reading_type,
        "positions": positions,
        "reading_id": quota["reading_id"],
        "quota": quota,
    }


async def handle_client_log(request):
    """Пишем клиентские ошибки вебаппа в лог — ловим «Application error» с устройств,
    где консоль недоступна (Telegram WebView). Содержимое обрезаем, секретов нет."""
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=204)
    message = str(body.get("message", "") or "")[:1000]
    stack = str(body.get("stack", "") or "")[:3000]
    source = str(body.get("source", "") or "")[:200]
    url = str(body.get("url", "") or "")[:300]
    ua = str(body.get("ua", "") or "")[:300]
    logger.warning(
        "CLIENT ERROR: %s (src=%s url=%s ua=%s)\n%s",
        message or "(empty)",
        source, url, ua, stack,
    )
    return web.Response(status=204)


def create_webapp() -> web.Application:
    app = web.Application()
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_get('/api/disk', handle_disk_usage)
    app.router.add_get('/api/character', handle_character)
    app.router.add_post('/api/spread/begin', handle_spread_begin)
    app.router.add_get('/api/spread/poll', handle_spread_poll)
    app.router.add_post('/api/log', handle_client_log)
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
    return app


async def run_webapp(app: web.Application) -> None:
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)
    await site.start()
    logger.info("aiohttp server started on port 8080")


async def main() -> None:
    await init_db(settings.DB_PATH)

    # брошенные резервы квоты (перезапуск посреди шёпота) — возвращаем слоты
    db = await get_db()
    swept = await sweep_stale_reservations(db)
    if swept:
        logger.info("Swept %d stale quota reservations", swept)

    bot = Bot(token=settings.BOT_TOKEN)

    await bot.set_my_commands([
        BotCommand(command="start", description="Запустить бота"),
        BotCommand(command="subscribe", description="Купить подписку"),
        BotCommand(command="my", description="Статус подписки"),
    ])

    dp = Dispatcher(storage=MemoryStorage())

    register_handlers(dp)

    webapp = create_webapp()

    await asyncio.gather(
        run_webapp(webapp),
        start_polling(bot, dp),
        reminder_loop(bot),
    )


if __name__ == "__main__":
    asyncio.run(main())
