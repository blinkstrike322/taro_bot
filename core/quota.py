# core/quota.py
import logging

import aiosqlite
from storage.db import is_subscribed, get_monthly_non_daily_count

logger = logging.getLogger(__name__)

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

    - daily card: always ok
    - non-daily: both free and paid use monthly limits
    """
    if spread_type == "daily":
        return {"ok": True, "remaining": None, "limit": None}

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
