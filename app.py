import asyncio
import hashlib
import hmac
import json
import mimetypes
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, urlunsplit

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand
from aiohttp import web

from bot.router import register_handlers
from config import logger, settings
from core.fallbacks import (
    _clean_questions,
    _validate_counts,
    clean_llm_answer,
    local_day_forecast,
    local_followup_fallback,
    local_month_reflection,
    local_pair_fallback,
    local_week_reflection,
    parse_forecast,
)
from core.llm import call_llm_with_fallback, get_last_llm_hop, interpret_reading
from core.prompts import (
    _positions_for_question,
    build_day_forecast_prompt,
    build_follow_up_prompt,
    build_month_prompt,
    build_pair_prompt,
    build_week_prompt,
    get_system_prompt,
)
from core.quota import check_quota, reserve_quota
from core.reminder import reminder_loop
from core.ritual import touch_daily_streak
from core.spreads import resolve_spread
from core.tarot import draw_cards, load_cards_index
from core.tg_share import (
    TelegramAPIError,
    build_share_message,
    load_deck_filenames,
    resolve_reading,
    send_share,
)
from storage.db import (
    STATUS_COMPLETED,
    STATUS_FAILED,
    complete_reading,
    count_user_readings,
    count_user_readings_grouped,
    fail_reading,
    get_active_reading,
    get_db,
    get_or_create_user,
    get_reading_by_token,
    get_recent_texts,
    get_user_by_tg_id,
    get_user_readings_all,
    get_user_readings_by_month,
    get_user_readings_days,
    init_db,
    mark_reading_processing,
    sweep_stale_reservations,
)
from storage.events import _EVENT_NAMES, log_event, safe_log_event

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

        if not hmac.compare_digest(signature, hash_value):
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


# ── Beacon rate limiting (per user) ──────────────────────────────
# Аналитика observe-only: избыточные события (больше лимита в минуту)
# молча отбрасываются — они не должны ни нагружать запись, ни ломать UI.
EVENT_RATE_LIMIT = 120
EVENT_RATE_WINDOW_S = 60
EVENT_HITS_MAX_ENTRIES = 10_000
_event_hits: dict[int, list[float]] = {}


def _prune_event_hits(now: float) -> None:
    """Evict stale per-user buckets and cap the map size (observe-only safety valve).

    Keeps `_event_hits` bounded regardless of how many users ever appear: buckets
    older than the window are dropped and, beyond EVENT_HITS_MAX_ENTRIES users,
    the least-recently-active buckets are evicted.
    """
    cutoff = now - EVENT_RATE_WINDOW_S
    for uid in list(_event_hits):
        kept = [t for t in _event_hits[uid] if t > cutoff]
        if kept:
            _event_hits[uid] = kept
        else:
            _event_hits.pop(uid, None)
    if len(_event_hits) > EVENT_HITS_MAX_ENTRIES:
        for uid in sorted(
            _event_hits,
            key=lambda u: _event_hits[u][-1] if _event_hits[u] else 0.0,
        ):
            if len(_event_hits) <= EVENT_HITS_MAX_ENTRIES:
                break
            _event_hits.pop(uid, None)


def _event_over_limit(tg_id: int) -> bool:
    """Trimming sliding window: >N events/min per user is dropped silently."""
    now = time.time()
    _prune_event_hits(now)
    hits = [t for t in _event_hits.get(tg_id, []) if now - t < EVENT_RATE_WINDOW_S]
    if len(hits) >= EVENT_RATE_LIMIT:
        _event_hits[tg_id] = hits
        return True
    hits.append(now)
    _event_hits[tg_id] = hits
    return False


async def start_polling(bot: Bot, dp: Dispatcher) -> None:
    await dp.start_polling(bot)


async def handle_readings(request):
    init_data = request.query.get('init_data', '')
    user = verify_telegram_init_data(init_data)
    if not user:
        # Явный 401: фронт отличает «нет авторизации» от «нет данных за месяц»
        return web.json_response({"error": "unauthorized"}, status=401)
    tg_id = user.get('id', 0)
    if not tg_id:
        return web.json_response({"readings": []})
    db = await get_db()

    # Ретро-окно (?days=N, 1–62) и весь журнал (?all=1) — приоритет над
    # year/month: фронт запрашивает их для дайджеста недели и полной истории.
    all_raw = request.query.get("all", "")
    days_raw = request.query.get("days", "")
    if all_raw == "1":
        return web.json_response({"readings": await get_user_readings_all(db, tg_id)})
    if days_raw:
        try:
            days = min(62, max(1, int(float(days_raw))))
        except (ValueError, OverflowError):
            days = 0
        if days:
            return web.json_response({"readings": await get_user_readings_days(db, tg_id, days)})

    year = request.query.get('year', '')
    month = request.query.get('month', '')
    if not year or not month:
        return web.json_response({"readings": []})
    rows = await get_user_readings_by_month(db, tg_id, year, month)
    # Server-side "history open" — shape-only, no question/card content.
    await safe_log_event(db, tg_id, "history_open", {}, user_id=None)
    return web.json_response({"readings": rows})


async def handle_stats(request):
    """Статистика оператора для меню: серии ритуала, лорометр, счётчики раскладов.

    Контракт клиента (SNAP3 api.ts) — camelCase. totalReadings/spreadCounts —
    истина из строк журнала, а не из денормализованных счётчиков.
    """
    user = verify_telegram_init_data(request.query.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    tg_id = user.get("id", 0)
    db = await get_db()
    row = await get_user_by_tg_id(db, tg_id)
    return web.json_response({
        "streakDays": row.streak_days if row else 0,
        "totalReadings": await count_user_readings(db, tg_id),
        "lastDailyAt": row.last_daily_at if row else None,
        "morningStreak": row.morning_streak if row else 0,
        "lastMorningAt": row.last_morning_at if row else None,
        "guideReadings": await count_user_readings_grouped(db, tg_id, "character_id", CHARACTER_IDS),
        "spreadCounts": await count_user_readings_grouped(db, tg_id, "type", None),
    })


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


CHARACTER_IDS = ("shadow_walker", "ruin_keeper", "spark_of_chaos")


async def handle_character_set(request):
    """Sync the UI-selected guide into the DB (single source of truth).

    The webapp guide switch used to live only in localStorage, while
    /api/spread/begin reads user.character_id from the DB — readings came
    out in the old guide's voice. The frontend must POST here on switch.
    """
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    character_id = body.get("character_id", "")
    if character_id not in CHARACTER_IDS:
        return web.json_response({"error": "unknown character"}, status=400)
    user_data = verify_telegram_init_data(body.get("init_data", ""))
    if not user_data or not user_data.get("id"):
        return web.json_response({"error": "unauthorized"}, status=403)
    db = await get_db()
    from storage.db import update_character
    await update_character(db, user_data["id"], character_id)
    return web.json_response({"character_id": character_id})


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

# Сильные ссылки на фоновые шёпоты: create_task без сохранения может быть
# собран GC до завершения.
_whisper_tasks: set[asyncio.Task] = set()


async def _whisper_task(token: str, ctx: dict, cards: list[dict]) -> None:
    """Background LLM interpretation + DB save for a two-phase spread.

    Слот квоты уже зарезервирован в момент /begin (reserve_quota): здесь
    мы только дописываем толкование. Если шёпот сорвался — помечаем статус
    failed (слот квоты освобождается, т.к. failed-строки не считаются в
    лимите), а поллинг по токену отдаст причину вместо 404.
    """
    started = time.monotonic()
    try:
        await mark_reading_processing(await get_db(), ctx["reading_id"])
        avoid_texts = await get_recent_texts(
            await get_db(), ctx["user_id"], ctx["character_id"],
        )
        interpretation = await interpret_reading(
            question=ctx["question"],
            cards=cards,
            character_id=ctx["character_id"],
            spread=ctx["spread"],
            positions=ctx["positions"],
            avoid_texts=avoid_texts,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        hop = get_last_llm_hop()
        await safe_log_event(
            await get_db(),
            ctx["tg_id"],
            "spread_complete",
            {
                "guide": ctx["character_id"],
                "spread_type": ctx["spread_type"],
                "provider": hop["provider"],
                "model": hop["model"],
                "latency_ms": latency_ms,
                "fallback_used": hop["fallback_used"],
            },
            user_id=ctx["user_id"],
        )
        await complete_reading(
            db=await get_db(),
            reading_id=ctx["reading_id"],
            interpretation=interpretation,
        )
    except Exception as e:
        hop = get_last_llm_hop()
        await safe_log_event(
            await get_db(),
            ctx["tg_id"],
            "spread_fail",
            {
                "guide": ctx["character_id"],
                "spread_type": ctx["spread_type"],
                "provider": hop["provider"],
                "model": hop["model"],
                "latency_ms": int((time.monotonic() - started) * 1000),
                "fallback_used": hop["fallback_used"],
                "error_type": type(e).__name__,
            },
            user_id=ctx["user_id"],
        )
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
    if ctx.get("deduped"):
        response = {
            "cards": ctx["cards"],
            "token": ctx["token"],
            "remaining": ctx["quota"].get("remaining"),
            "limit": ctx["quota"].get("limit"),
            "spread_id": ctx["spread_id"],
            "spread_name": ctx["spread_name"],
            "position_keys": ctx["position_keys"],
        }
        if ctx.get("positions"):
            response["positions"] = ctx["positions"]
        if ctx.get("daily_ritual"):
            response["daily_ritual"] = ctx["daily_ritual"]
        return web.json_response(response)
    cards = ctx["cards"]

    # Токен сохраняется в строке readings (client_token) при резерве:
    # маппинг переживает перезапуск. Фоновый шёпот пишет статус в ту же строку.
    whisper = asyncio.create_task(_whisper_task(token, ctx, cards))
    _whisper_tasks.add(whisper)
    whisper.add_done_callback(_whisper_tasks.discard)

    response = {
        "cards": cards,
        "token": token,
        "remaining": ctx["quota"].get("remaining"),
        "limit": ctx["quota"].get("limit"),
        "spread_id": ctx["spread_id"],
        "spread_name": ctx["spread_name"],
        "position_keys": ctx["position_keys"],
    }
    # Имена позиций — фронтенд показывает их сразу после раздачи (для всех
    # раскладов каталога, по одной на карту).
    if ctx.get("positions"):
        response["positions"] = ctx["positions"]
    if ctx.get("daily_ritual"):
        response["daily_ritual"] = ctx["daily_ritual"]
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
    spread = resolve_spread(spread_type, question)
    spread_id = spread["id"]
    # легаси-типы сохраняют прежние reading_type (дедуп/журнал не ломаются):
    # 1 → spread_1, 3 → spread_3; новые id — spread_<id>
    if spread_id == "daily":
        spread_type_str = "daily"
        reading_type = "daily"
    elif str(spread_type) in ("1", "3"):
        spread_type_str = "non_daily"
        reading_type = f"spread_{spread_type}"
    else:
        spread_type_str = "non_daily"
        reading_type = f"spread_{spread_id}"

    # Ритуал карты дня: считаем в момент начала расклада (семантика SNAP3:
    # raw-проверка после resolve; легаси-числа считаются daily, если резолвятся
    # в daily). Час присылает клиент — без валидного local_hour ритуал не трогаем.
    # Пользователь перечитывается свежим запросом: get_or_create_user выше не
    # выбирает streak-колонки.
    local_hour_raw = body.get("local_hour")
    try:
        local_hour = int(local_hour_raw) if local_hour_raw is not None else None
    except (TypeError, ValueError):
        local_hour = None
    if local_hour is not None and not (0 <= local_hour <= 23):
        local_hour = None
    daily_ritual = None
    if spread_id == "daily" and local_hour is not None:
        user_row = await get_user_by_tg_id(db, tg_id)
        if user_row is not None:
            daily_ritual = await touch_daily_streak(db, user_row, local_hour)

    count = min(int(spread["count"]), 10)
    needs_q = spread["needs_question"]
    if needs_q and not (question and str(question).strip()):
        return web.json_response({"error": "для этого расклада нужен вопрос"}, status=400)
    if spread_id == "three":
        positions = _positions_for_question(question)
    else:
        positions = [p["name"] for p in spread["positions"]]
    position_keys = [p["key"] for p in spread["positions"]]
    cards = draw_cards(count)

    # Проводника определяет сервер: Telegram identity → пользователь БД.
    # Поле character_id из тела запроса — только UI-подсказка и не используется.
    character_id = user.character_id

    # Двойной /begin (двойной тап, повторный маунт): шёпот уже бежит —
    # отдаём его токен и карты, не жжём слот квоты и круг по провайдерам.
    # Дедуп только при совпадении типа: активный 3-карточный расклад не
    # должен «отвечать» на запрос карты дня (и наоборот).
    active = await get_active_reading(db, user.id)
    if active and active["client_token"] and active["type"] == reading_type:
        active_cards = (active["cards_data"] or {}).get("cards") or []
        if active_cards:
            quota_view = await check_quota(db, user.id, tg_id, spread_type_str)
            # Позиции активного расклада — тем же способом, что для нового:
            # three — динамические по вопросу, остальные — имена из каталога.
            active_positions: list[str] | None = (
                _positions_for_question(active["question"])
                if spread_id == "three"
                else positions
            )
            if active_positions is not None and len(active_positions) != len(active_cards):
                active_positions = None
            return {
                "deduped": True,
                "token": active["client_token"],
                "cards": active_cards,
                "positions": active_positions,
                "spread_id": spread_id,
                "spread_name": spread["name"],
                "position_keys": position_keys,
                "daily_ritual": daily_ritual,
                "quota": {"remaining": quota_view.get("remaining"), "limit": quota_view.get("limit")},
            }

    # Резервируем слот квоты атомарно — до запуска LLM (см. reserve_quota).
    # Без _user_lock: резерв атомарен на уровне SQL (см. комментарий выше).
    cards_data = {"cards": cards, "spread_type": spread_id}
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
        await safe_log_event(
            db,
            tg_id,
            "quota_refused",
            {
                "guide": character_id,
                "spread_type": spread_type,
                "needs_subscription": bool(quota.get("needs_subscription")),
            },
            user_id=user.id,
        )
        return web.json_response(
            {
                "error": quota.get("reason", "Лимит исчерпан."),
                "needs_subscription": bool(quota.get("needs_subscription")),
            },
            status=429,
        )

    await safe_log_event(
        db,
        tg_id,
        "spread_begin",
        {"guide": character_id, "spread_type": spread_type},
        user_id=user.id,
    )

    return {
        "db": db,
        "user_id": user.id,
        "tg_id": tg_id,
        "cards": cards,
        "question": question,
        "character_id": character_id,
        "spread_type": spread_type,
        "reading_type": reading_type,
        "spread": spread,
        "spread_id": spread_id,
        "spread_name": spread["name"],
        "positions": positions,
        "position_keys": position_keys,
        "daily_ritual": daily_ritual,
        "reading_id": quota["reading_id"],
        "quota": quota,
    }


_BOT_TOKEN_RE = re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{30,}\b")
_API_KEY_RE = re.compile(r"\bsk-(?:or-)?[A-Za-z0-9_-]{20,}\b")


def _redact_secrets(text: str) -> str:
    text = _BOT_TOKEN_RE.sub("<redacted-token>", text)
    return _API_KEY_RE.sub("<redacted-key>", text)


def _safe_url(url: str) -> str:
    # query вебаппа несёт tgWebAppData (включая hash initData) — в лог идёт только путь
    return urlunsplit(urlsplit(url)[:2])


async def handle_client_log(request):
    """Пишем клиентские ошибки вебаппа в лог — ловим «Application error» с устройств,
    где консоль недоступна (Telegram WebView). Содержимое обрезаем, секретов нет."""
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=204)
    message = _redact_secrets(str(body.get("message", "") or ""))[:1000]
    stack = _redact_secrets(str(body.get("stack", "") or ""))[:3000]
    source = str(body.get("source", "") or "")[:200]
    url = _safe_url(str(body.get("url", "") or ""))[:300]
    ua = str(body.get("ua", "") or "")[:300]
    logger.warning(
        "CLIENT ERROR: %s (src=%s url=%s ua=%s)\n%s",
        message or "(empty)",
        source, url, ua, stack,
    )
    return web.Response(status=204)


async def handle_events(request):
    """Beacon endpoint: validate, rate-limit per user, log, always 204.

    Fire-and-forget: a malformed body, unknown event, invalid initData or a
    rate-limit hit all silently return 204 — the beacon must NEVER surface an
    error to the UI. Props carry only shapes (the frontend builds them from a
    typed catalog); log_event additionally rejects non-JSON-serializable props.
    """
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=204)
    event = body.get("event")
    props = body.get("props") or {}
    if not isinstance(event, str) or event not in _EVENT_NAMES:
        return web.Response(status=204)
    if not isinstance(props, dict):
        return web.Response(status=204)
    init_data = str(body.get("init_data", "") or "")
    user = verify_telegram_init_data(init_data)
    if not user:
        return web.Response(status=204)
    tg_id = user.get("id") or 0
    if not tg_id or _event_over_limit(tg_id):
        return web.Response(status=204)
    db = await get_db()
    try:
        await log_event(db, tg_id, event, props)
    except Exception:
        logger.warning("analytics beacon dropped: event=%s", event)
    return web.Response(status=204)


# ── Уточняющий вопрос (/api/ask) и прогноз дня (/api/forecast) ────
# Порт SNAP3 api/ask + api/forecast: резолв карты по cards.json, до 2 попыток
# LLM, санитизация/строгий JSON-парс, дальше детерминированный локальный
# фолбэк из значений карты голосом проводника (fallback: true).
def _clean_str(value: object, max_len: int) -> str:
    """str → trimmed и обрезанный; всё остальное → пустая строка."""
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def _resolve_card_entry(raw: object, deck: dict) -> dict | None:
    """Клиент даёт имя — сервер достаёт значения (порт SNAP3 resolveCard).

    raw: {name, position?, is_reversed?/orientation?}. Возвращает dict с
    данными cards.json + position/is_reversed/orientation, либо None.
    """
    if not isinstance(raw, dict):
        return None
    entry = deck.get(_clean_str(raw.get("name"), 100))
    if not entry:
        return None
    is_reversed = bool(raw.get("is_reversed")) or _clean_str(raw.get("orientation"), 20) == "reversed"
    return {
        **entry,
        "position": _clean_str(raw.get("position"), 100) or None,
        "is_reversed": is_reversed,
        "orientation": "reversed" if is_reversed else "upright",
    }


async def _ask_llm(messages, **kw):  # тонкая обёртка для тестируемости
    return await call_llm_with_fallback(messages, **kw)


async def _forecast_llm(messages, **kw):
    return await call_llm_with_fallback(messages, **kw)


async def handle_ask(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    question = _clean_str(body.get("question"), 500)
    spread_name = _clean_str(body.get("spread_name"), 100)
    spread_question = (
        _clean_str(body.get("spread_question"), 500) if body.get("spread_question") else None
    )
    summary = _clean_str(body.get("reading_summary"), 1000)
    character_id = (
        body.get("character_id") if body.get("character_id") in CHARACTER_IDS else "shadow_walker"
    )
    deck = load_cards_index()
    pair = card_entry = None
    if isinstance(body.get("cards"), list):
        if len(body["cards"]) != 2:
            return web.json_response({"error": "нужны ровно две карты"}, status=400)
        pair = []
        for c in body["cards"]:
            entry = _resolve_card_entry(c, deck)
            if not entry:
                return web.json_response({"error": "карты не опознаны"}, status=400)
            pair.append(entry)
    elif isinstance(body.get("card"), dict):
        card_entry = _resolve_card_entry(body["card"], deck)
        if not card_entry:
            return web.json_response({"error": "карты не опознаны"}, status=400)
    else:
        return web.json_response({"error": "карта не указана"}, status=400)

    ctx = {"question": question, "spread_name": spread_name,
           "spread_question": spread_question, "reading_summary": summary,
           "character_id": character_id}
    system = get_system_prompt(character_id)
    user_prompt = build_pair_prompt(pair, ctx) if pair else build_follow_up_prompt(card_entry, ctx)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}]

    answer = ""
    for _ in range(2):
        try:
            raw = clean_llm_answer(
                await _ask_llm(messages, max_tokens=900, temperature=0.85)
            )
        except Exception:
            logger.warning("ask: LLM attempt failed", exc_info=True)
            raw = ""
        if len(raw) >= 20:
            answer = raw
            break
    fallback = not answer
    if fallback:
        answer = (
            local_pair_fallback(pair[0], pair[1], ctx)
            if pair
            else local_followup_fallback(card_entry, ctx)
        )
    return web.json_response({"answer": answer, "fallback": fallback})


async def handle_forecast(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    character_id = (
        body.get("character_id") if body.get("character_id") in CHARACTER_IDS else "shadow_walker"
    )
    card_entry = _resolve_card_entry(body.get("card"), load_cards_index())
    if not card_entry:
        return web.json_response({"error": "карты не опознаны"}, status=400)

    fallback = local_day_forecast(card_entry)
    system = get_system_prompt(character_id)
    user_prompt = build_day_forecast_prompt(card_entry)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}]

    for _ in range(2):
        try:
            raw = await _forecast_llm(messages, max_tokens=900, temperature=0.85)
        except Exception:
            logger.warning("forecast: LLM attempt failed", exc_info=True)
            continue
        parsed = parse_forecast(raw)
        if parsed:
            return web.json_response({"forecast": parsed, "fallback": False})
    return web.json_response({"forecast": fallback, "fallback": True})


# ── Дайджесты недели и месяца (/api/week, /api/month) ────────────
# Порт SNAP3 api/week + api/month: дайджест строит клиент, сервер валидирует
# числа (clamp/truncate/top-N), связывает их промптом из Task 7 голосом
# проводника; 2 попытки LLM → детерминированный фолбэк из топ-карты.
def _digest_int(value: object, default: int = 0) -> int:
    """Число из поля дайджеста; мусор → default (total=0 превращается в 400)."""
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _clean_month_days(raw: object) -> list[dict]:
    """days ≤62 записей {day, count}: мусорные записи долой, числа clamp."""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for entry in raw[:62]:
        if not isinstance(entry, dict):
            continue
        day = _digest_int(entry.get("day"))
        if not 1 <= day <= 62:
            continue
        out.append({"day": day, "count": max(0, min(999, _digest_int(entry.get("count"))))})
    return out


def _digest_character(body: dict) -> str:
    raw = body.get("character_id")
    return str(raw) if raw in CHARACTER_IDS else "shadow_walker"


async def handle_week(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    digest = body.get("digest")
    if not isinstance(digest, dict):
        return web.json_response({"error": "invalid digest"}, status=400)
    total = _digest_int(digest.get("total"))
    if total <= 0:
        return web.json_response({"error": "за неделю не было чтений"}, status=400)
    clean = {
        "total": total,
        "days_active": max(0, min(7, _digest_int(digest.get("days_active")))),
        "spread_counts": _validate_counts(digest.get("spread_counts")),
        "card_counts": _validate_counts(digest.get("card_counts")),
        "guide_counts": _validate_counts(digest.get("guide_counts")),
        "questions": _clean_questions(digest.get("questions")),
        "date_from": _clean_str(digest.get("date_from"), 40),
        "date_to": _clean_str(digest.get("date_to"), 40),
    }
    character_id = _digest_character(body)
    messages = [
        {"role": "system", "content": get_system_prompt(character_id)},
        {"role": "user", "content": build_week_prompt(clean, character_id)},
    ]

    answer = ""
    for _ in range(2):
        try:
            raw = clean_llm_answer(
                await _ask_llm(messages, max_tokens=900, temperature=0.85)
            )
        except Exception:
            logger.warning("week: LLM attempt failed", exc_info=True)
            raw = ""
        if len(raw) >= 20:
            answer = raw
            break
    fallback = not answer
    if fallback:
        answer = local_week_reflection(clean)
    return web.json_response({"answer": answer, "fallback": fallback})


async def handle_month(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    digest = body.get("digest")
    if not isinstance(digest, dict):
        return web.json_response({"error": "invalid digest"}, status=400)
    total = _digest_int(digest.get("total"))
    if total <= 0:
        return web.json_response({"error": "за месяц не было чтений"}, status=400)
    clean = {
        "total": total,
        "days_active": max(0, min(62, _digest_int(digest.get("days_active")))),
        "days_in_month": max(1, min(62, _digest_int(digest.get("days_in_month"), default=31))),
        "month_name": _clean_str(digest.get("month_name"), 40),
        "year": max(0, min(9999, _digest_int(digest.get("year")))),
        "spread_counts": _validate_counts(digest.get("spread_counts")),
        "card_counts": _validate_counts(digest.get("card_counts")),
        "guide_counts": _validate_counts(digest.get("guide_counts")),
        "majors": max(0, min(999, _digest_int(digest.get("majors")))),
        "suit_counts": _validate_counts(digest.get("suit_counts")),
        "days": _clean_month_days(digest.get("days")),
        "questions": _clean_questions(digest.get("questions")),
    }
    character_id = _digest_character(body)
    messages = [
        {"role": "system", "content": get_system_prompt(character_id)},
        {"role": "user", "content": build_month_prompt(clean, character_id)},
    ]

    answer = ""
    for _ in range(2):
        try:
            raw = clean_llm_answer(
                await _ask_llm(messages, max_tokens=900, temperature=0.85)
            )
        except Exception:
            logger.warning("month: LLM attempt failed", exc_info=True)
            raw = ""
        if len(raw) >= 20:
            answer = raw
            break
    fallback = not answer
    if fallback:
        answer = local_month_reflection(clean)
    return web.json_response({"answer": answer, "fallback": fallback})


# ── Шеринг расклада в личку через нашего бота (/api/share) ────────
# Порт SNAP3 share: resolve по токену/reading_id строго своего completed-
# чтения, медиа — PNG карт из static/webapp/cards/, текст — HTML-частями.
def _clean_reading_id(raw: object) -> int | None:
    """reading_id из тела: int (не bool) или строка из цифр, иначе None."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw.strip())
    return None


async def handle_share(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    tg_id = user.get("id") or 0
    token = _clean_str(body.get("token"), 64) or None
    reading_id = _clean_reading_id(body.get("reading_id"))
    if not token and reading_id is None:
        return web.json_response({"error": "нечем поделиться"}, status=400)
    db = await get_db()
    row = await resolve_reading(db, tg_id, token=token, reading_id=reading_id)
    if row is None:
        return web.json_response({"error": "чтение не найдено"}, status=404)
    media, text_parts = build_share_message(row, load_deck_filenames())
    try:
        await send_share(request.app["bot"], tg_id, media, text_parts)
    except TelegramAPIError:
        logger.warning(
            "share: telegram rejected reading tg_id=%s", tg_id, exc_info=True
        )
        return web.json_response({"error": "телеграм не принял сообщение"}, status=502)
    return web.json_response({"ok": True})


# ── Gzip + cache-заголовки для статики и API ─────────────────────
# aiohttp не жмёт и не кэширует сам: JS/CSS/JSON уходили сырыми (~0.5 МБ по
# мобильной сети), а index.html кэшировался WebView эвристически — после
# деплоя stale index ссылался на удалённые чанки → пустой экран (iOS).
COMPRESSIBLE_TYPES = (
    "application/javascript", "application/json", "text/css",
    "text/html", "text/plain", "image/svg+xml",
    # Python ≥3.12 mimetypes отдаёт .js как text/javascript — без этой записи
    # gzip молча не включался на главных чанках вебаппа (нашёл smoke Task 16).
    "text/javascript",
)


def _resp_mime_type(resp: web.Response | web.FileResponse) -> str:
    """MIME ответа на момент middleware, до начала отдачи.

    FileResponse угадывает content_type только внутри prepare() — до того у
    него дефолтный application/octet-stream, из-за чего gzip-ветка ниже не
    срабатывала ни для одного статического файла (нашёл smoke Task 16).
    Для файлов добываем тип из пути тем же способом, каким это делает сам
    aiohttp (mimetypes); getattr — приватное поле aiohttp, при его отсутствии
    просто откатываемся к текущему content_type (без сжатия, как раньше).
    """
    path = getattr(resp, "_path", None)
    if isinstance(path, Path):
        return mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return resp.content_type


@web.middleware
async def gzip_cache_middleware(request, handler):
    resp = await handler(request)
    if not isinstance(resp, (web.Response, web.FileResponse)):
        return resp
    if request.path.startswith("/_next/static/"):
        # хэшированные ассеты Next.js — вечный кэш
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        resp.headers["Cache-Control"] = "no-cache"
    if (
        request.method == "GET"
        and resp.status == 200
        and "gzip" in request.headers.get("Accept-Encoding", "").lower()
        and _resp_mime_type(resp) in COMPRESSIBLE_TYPES
    ):
        resp.headers["Vary"] = "Accept-Encoding"
        resp.enable_compression(web.ContentCoding.gzip)
    return resp


def create_webapp(bot: Bot | None = None) -> web.Application:
    app = web.Application()
    # Бот для /api/share (отправка расклада в личку); None в тестах вебаппа.
    app["bot"] = bot
    app.middlewares.append(gzip_cache_middleware)
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_get('/api/stats', handle_stats)
    app.router.add_get('/api/disk', handle_disk_usage)
    app.router.add_get('/api/character', handle_character)
    app.router.add_post('/api/character', handle_character_set)
    app.router.add_post('/api/spread/begin', handle_spread_begin)
    app.router.add_get('/api/spread/poll', handle_spread_poll)
    app.router.add_post('/api/log', handle_client_log)
    app.router.add_post('/api/events', handle_events)
    app.router.add_post('/api/ask', handle_ask)
    app.router.add_post('/api/forecast', handle_forecast)
    app.router.add_post('/api/week', handle_week)
    app.router.add_post('/api/month', handle_month)
    app.router.add_post('/api/share', handle_share)
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

    webapp = create_webapp(bot)

    await asyncio.gather(
        run_webapp(webapp),
        start_polling(bot, dp),
        reminder_loop(bot),
    )


if __name__ == "__main__":
    asyncio.run(main())
