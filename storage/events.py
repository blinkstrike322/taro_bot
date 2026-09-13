"""Provider-agnostic product-analytics event log (observe-only).

The `events` table is the single, vendor-neutral sink for product analytics.
No external analytics SDK exists; a vendor can be attached later by either
reading this table or by replacing `log_event`'s body — without touching a
single call site. Call sites use `safe_log_event`, which never raises.

PRIVACY (non-negotiable): only *shapes* are recorded — spread_type, count,
guide, provider/model, latency, outcomes, error_type. Never log question text,
card names, or interpretation content. This rule is enforced by the types in
the frontend beacon and by the fixed event catalog here: an event name is a
closed literal, and call sites only ever pass shape keys.
"""

from __future__ import annotations

import json
import logging
from typing import Final, Literal, get_args

import aiosqlite

logger = logging.getLogger(__name__)

# ── Shared, closed event catalog ─────────────────────────────────────
# A single literal union covers BOTH the server-side (rich lifecycle
# parameters) and the client-side beacon (UX timing). It is closed on
# purpose: unknown event names are rejected, never silently stored.
EventName = Literal[
    # server-side (authoritative lifecycle, rich params)
    "spread_begin",
    "spread_complete",
    "spread_fail",
    "quota_refused",
    "subscription_activated",
    "subscription_expired",
    "history_open",
    # client-side beacon (UX timing, shape-only props)
    "guide_selected",
    "daily_started",
    "spread_started",
    "card_revealed",
    "interpretation_ready",
    "interpretation_failed",
    "history_opened",
    "paywall_shown",
]

_EVENT_NAMES: Final[frozenset[str]] = frozenset(get_args(EventName))

_CREATE_EVENTS_TABLE = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tg_id INTEGER,
    event TEXT NOT NULL,
    props TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


async def log_event(
    db: aiosqlite.Connection,
    tg_id: int,
    event: EventName,
    props: dict[str, object],
    *,
    user_id: int | None = None,
) -> None:
    """Append a single analytics event — one INSERT + commit, no joins.

    Raises on programmer error only: ValueError for an unknown event name,
    TypeError for non-JSON-serializable props. It is genuinely synchronous
    DB write on the shared connection; callers must wrap with
    `safe_log_event` so it can never break a spread/payment/render.
    """
    if event not in _EVENT_NAMES:
        raise ValueError(f"unknown analytics event: {event!r}")
    # JSON-serializability is the boundary contract: JSON-incompatible values
    # (objects, sets, bytes) raise TypeError here, caught by safe_log_event.
    props_json = json.dumps(props, ensure_ascii=False)
    await db.execute(
        "INSERT INTO events (user_id, tg_id, event, props) VALUES (?, ?, ?, ?)",
        (user_id, tg_id, event, props_json),
    )
    await db.commit()


async def safe_log_event(
    db: aiosqlite.Connection,
    tg_id: int,
    event: EventName,
    props: dict[str, object],
    *,
    user_id: int | None = None,
) -> None:
    """Fire-and-forget log_event wrapper: swallows every failure, logs it.

    Analytics is observe-only. A failing log_event must NEVER propagate to a
    spread, payment, or render — this wrapper guarantees that. Errors are
    logged server-side only.
    """
    try:
        await log_event(db, tg_id, event, props, user_id=user_id)
    except Exception:
        logger.exception("analytics log_event failed (ignored): event=%s", event)
