# core/quota.py
import logging

import aiosqlite

from config import settings
from storage.db import (
    get_daily_card_count_today,
    get_monthly_non_daily_count,
    is_subscribed,
    reserve_reading,
)

logger = logging.getLogger(__name__)

_admin_ids: set[int] = set()
_tester_ids: set[int] = set()


def _load_ids(raw: str) -> set[int]:
    if not raw:
        return set()
    return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}


def _load_admin_ids() -> set[int]:
    return _load_ids(settings.ADMIN_IDS)


def _load_tester_ids() -> set[int]:
    return _load_ids(settings.TESTER_IDS)


def _is_admin(tg_id: int) -> bool:
    global _admin_ids
    if not _admin_ids:
        _admin_ids = _load_admin_ids()
    return tg_id in _admin_ids


def _is_tester(tg_id: int) -> bool:
    global _tester_ids
    if not _tester_ids:
        _tester_ids = _load_tester_ids()
    return tg_id in _tester_ids

MONTHLY_LIMIT_FREE = 10
MONTHLY_LIMIT_PAID = 100


async def check_quota(
    db: aiosqlite.Connection,
    user_id: int,
    tg_id: int,
    spread_type: str,
) -> dict:
    """
    Check if user can do a spread.
    Returns {"ok": True, "remaining": N, "limit": N}
    or {"ok": False, "reason": str, "needs_subscription": bool, "remaining": 0}

    - daily card: 1 per day
    - non-daily: both free and paid use monthly limits
    """
    if _is_admin(tg_id):
        return {"ok": True, "remaining": None, "limit": None, "admin": True}

    if _is_tester(tg_id):
        return {"ok": True, "remaining": None, "limit": None, "tester": True}

    if spread_type == "daily":
        daily_count = await get_daily_card_count_today(db, user_id)
        if daily_count >= 1:
            return {
                "ok": False,
                "reason": "ТЕНЬ УЖЕ ПОГЛОТИЛА СЕГОДНЯШНИЙ ДЕНЬ. ВОЗВРАЩАЙСЯ С РАССВЕТОМ.",
                "needs_subscription": False,
                "remaining": 0,
                "limit": 1,
            }
        return {"ok": True, "remaining": 1, "limit": 1}

    subscribed = await is_subscribed(db, tg_id)
    monthly_count = await get_monthly_non_daily_count(db, user_id)

    if not subscribed:
        remaining = max(0, MONTHLY_LIMIT_FREE - monthly_count)
        if monthly_count >= MONTHLY_LIMIT_FREE:
            return {
                "ok": False,
                "reason": f"Лимит {MONTHLY_LIMIT_FREE} призывов в месяц. Оформи подписку — 100 раскладов.",
                "needs_subscription": True,
                "remaining": 0,
                "limit": MONTHLY_LIMIT_FREE,
            }
        return {"ok": True, "remaining": remaining, "limit": MONTHLY_LIMIT_FREE}

    remaining = max(0, MONTHLY_LIMIT_PAID - monthly_count)
    if monthly_count >= MONTHLY_LIMIT_PAID:
        return {
            "ok": False,
            "reason": f"Лимит {MONTHLY_LIMIT_PAID} раскладов в месяц. Жди следующего месяца.",
            "needs_subscription": True,
            "remaining": 0,
            "limit": MONTHLY_LIMIT_PAID,
        }
    return {"ok": True, "remaining": remaining, "limit": MONTHLY_LIMIT_PAID}


async def reserve_quota(
    db: aiosqlite.Connection,
    user_id: int,
    tg_id: int,
    spread_type: str,
    *,
    question: str | None = None,
    cards_data: dict | None = None,
    character_id: str = "shadow_walker",
    reading_type: str = "spread_1",
    client_token: str | None = None,
) -> dict:
    """Проверить квоту И атомарно занять слот (строка reading с маркером '{}').

    Заменяет связку «check_quota → ...секунды LLM... → save_reading», в которой
    два параллельных запроса успевали пройти одну и ту же проверку. На успехе
    слот уже занят: толкование допишет complete_reading(), при провале шёпота
    слот возвращается release_reading()/fail_reading().

    client_token — токен клиента, сохраняется в строке чтения: поллинг
    идёт через БД и переживает рестарт.

    Возвращает:
      {"ok": True, "reading_id": int, "remaining": N|None, "limit": N|None}
      {"ok": False, "reason": str, "needs_subscription": bool, ...}
    """
    check = await check_quota(db, user_id, tg_id, spread_type)
    if not check["ok"]:
        return check  # reason / needs_subscription уже внутри

    unlimited = bool(check.get("admin") or check.get("tester"))
    limit = check.get("limit") or 1

    reading_id = await reserve_reading(
        db,
        user_id=user_id,
        type=reading_type,
        question=question,
        cards_data=cards_data or {},
        character_id=character_id,
        unlimited=unlimited,
        limit=limit,
        client_token=client_token,
    )

    if reading_id is None:
        # Параллельный запрос успел занять последний слот между проверкой
        # и резервом — отдаём актуальный отказ.
        logger.warning("Quota race: user_id=%s lost the last slot", user_id)
        recheck = await check_quota(db, user_id, tg_id, spread_type)
        recheck["ok"] = False
        if not recheck.get("reason"):
            recheck["reason"] = "Канал перегружен. Попробуй ещё раз."
        return recheck

    remaining = check.get("remaining")
    if remaining is not None:
        remaining = max(0, remaining - 1)
    return {
        "ok": True,
        "reading_id": reading_id,
        "remaining": remaining,
        "limit": check.get("limit"),
    }
