# core/quota.py
import logging

import aiosqlite
from config import settings
from storage.db import is_subscribed, get_monthly_non_daily_count, get_daily_card_count_today

logger = logging.getLogger(__name__)

_admin_ids: set[int] = set()


def _load_admin_ids() -> set[int]:
    raw = settings.ADMIN_IDS
    if not raw:
        return set()
    return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}


def _is_admin(tg_id: int) -> bool:
    global _admin_ids
    if not _admin_ids:
        _admin_ids = _load_admin_ids()
    return tg_id in _admin_ids

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
    if spread_type == "daily":
        daily_count = await get_daily_card_count_today(db, user_id)
        if daily_count >= 1:
            return {
                "ok": False,
                "reason": "Карту дня можно получить только один раз в день. Возвращайся завтра.",
                "needs_subscription": False,
                "remaining": 0,
                "limit": 1,
            }
        return {"ok": True, "remaining": 1, "limit": 1}

    if _is_admin(tg_id):
        return {"ok": True, "remaining": None, "limit": None, "admin": True}

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
