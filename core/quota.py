# core/quota.py
import logging
from typing import Optional

import aiosqlite
from storage.db import is_subscribed, get_daily_non_daily_count, get_monthly_non_daily_count

logger = logging.getLogger(__name__)

DAILY_LIMIT_FREE = 3
MONTHLY_LIMIT_PAID = 100


async def check_quota(
    db: aiosqlite.Connection,
    user_id: int,
    tg_id: int,
    spread_type: str,
) -> dict:
    """
    Check if user can do a spread.
    Returns {"ok": True} or {"ok": False, "reason": str, "needs_subscription": bool}

    - daily card: always ok
    - non-daily: free users limited to DAILY_LIMIT_FREE/day
    - paid users: limited to MONTHLY_LIMIT_PAID/month
    """
    if spread_type == "daily":
        return {"ok": True}

    subscribed = await is_subscribed(db, tg_id)

    if not subscribed:
        daily_count = await get_daily_non_daily_count(db, user_id)
        if daily_count >= DAILY_LIMIT_FREE:
            return {
                "ok": False,
                "reason": f"Лимит {DAILY_LIMIT_FREE} расклада в день. Оформи подписку — 100 раскладов в месяц.",
                "needs_subscription": True,
            }
        return {"ok": True}

    # Paid user
    monthly_count = await get_monthly_non_daily_count(db, user_id)
    if monthly_count >= MONTHLY_LIMIT_PAID:
        return {
            "ok": False,
            "reason": f"Лимит {MONTHLY_LIMIT_PAID} раскладов в месяц. Жди следующего месяца или продли подписку.",
            "needs_subscription": True,
        }
    return {"ok": True}
