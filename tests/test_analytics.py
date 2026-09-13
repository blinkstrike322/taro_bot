# tests/test_analytics.py
# Provider-agnostic product analytics: the `events` table + `log_event` helper.
# Verify the boundary contract (typed event name, JSON-serializable props) and
# that `safe_log_event` never propagates — analytics is observe-only.
import asyncio
import hashlib
import hmac
import json
import time
from urllib.parse import quote, urlencode

import pytest
import pytest_asyncio

import app as app_module
import storage.db as sdb
from storage.db import STATUS_COMPLETED, get_reading_by_token
from storage.events import (
    _EVENT_NAMES,
    log_event,
    safe_log_event,
)


def _make_init_data(tg_id: int) -> str:
    """Valid Telegram initData signed with the same algorithm the backend uses."""
    user = json.dumps({"id": tg_id, "first_name": "Test"}, separators=(",", ":"))
    pairs = {"auth_date": str(int(time.time())), "user": user}
    check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", app_module.settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({"auth_date": pairs["auth_date"], "user": user, "hash": sig}, quote_via=quote)


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "test.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


async def _all_events(conn) -> list[dict]:
    cursor = await conn.execute(
        "SELECT user_id, tg_id, event, props FROM events ORDER BY id"
    )
    rows = await cursor.fetchall()
    return [
        {
            "user_id": r[0],
            "tg_id": r[1],
            "event": r[2],
            "props": json.loads(r[3]),
        }
        for r in rows
    ]


@pytest.mark.asyncio
async def test_log_event_inserts_row(db):
    """A valid event lands in the events table with parsed JSON props."""
    await sdb.get_or_create_user(db, tg_id=12345)  # id=1

    await log_event(db, tg_id=12345, event="spread_begin", props={"guide": "shadow_walker", "spread_type": 3}, user_id=1)

    events = await _all_events(db)
    assert len(events) == 1
    assert events[0]["tg_id"] == 12345
    assert events[0]["user_id"] == 1
    assert events[0]["event"] == "spread_begin"
    assert events[0]["props"] == {"guide": "shadow_walker", "spread_type": 3}


@pytest.mark.asyncio
async def test_log_event_accepts_nullable_user_id(db):
    """user_id is nullable: anonymous/history events may omit it."""
    await log_event(db, tg_id=7, event="history_open", props={})
    events = await _all_events(db)
    assert events[0]["user_id"] is None
    assert events[0]["tg_id"] == 7


@pytest.mark.asyncio
async def test_log_event_rejects_unknown_event(db):
    """A free-form string outside the closed catalog is a programmer error."""
    with pytest.raises(ValueError):
        await log_event(db, tg_id=1, event="not-a-real-event", props={})  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_log_event_rejects_unserializable_props(db):
    """Non-JSON-serializable props raise TypeError (boundary contract)."""
    with pytest.raises(TypeError):
        await log_event(db, tg_id=1, event="spread_complete", props={"bad": object()})


@pytest.mark.asyncio
async def test_safe_log_event_swallows_failures(db):
    """safe_log_event never propagates: analytics is observe-only."""
    # unserializable props + unknown event — both must be swallowed
    await safe_log_event(db, tg_id=1, event="spread_complete", props={"bad": object()})  # type: ignore[arg-type]
    await safe_log_event(db, tg_id=1, event="bogus", props={})  # type: ignore[arg-type]
    # nothing was persisted for the failing attempts
    assert await _all_events(db) == []


@pytest.mark.asyncio
async def test_safe_log_event_persists_when_valid(db):
    """A well-formed event passes through safe_log_event untouched."""
    await safe_log_event(db, tg_id=99, event="subscription_activated", props={"first_month": True})
    events = await _all_events(db)
    assert events[0]["event"] == "subscription_activated"
    assert events[0]["props"] == {"first_month": True}


def test_event_catalog_is_closed_and_complete():
    """The shared union covers both server and client event families."""
    assert "spread_begin" in _EVENT_NAMES
    assert "spread_complete" in _EVENT_NAMES
    assert "spread_fail" in _EVENT_NAMES
    assert "quota_refused" in _EVENT_NAMES
    assert "subscription_activated" in _EVENT_NAMES
    assert "subscription_expired" in _EVENT_NAMES
    assert "history_open" in _EVENT_NAMES
    # client beacon family
    assert "guide_selected" in _EVENT_NAMES
    assert "daily_started" in _EVENT_NAMES
    assert "spread_started" in _EVENT_NAMES
    assert "card_revealed" in _EVENT_NAMES
    assert "interpretation_ready" in _EVENT_NAMES
    assert "interpretation_failed" in _EVENT_NAMES
    assert "history_opened" in _EVENT_NAMES
    assert "paywall_shown" in _EVENT_NAMES


@pytest.mark.asyncio
async def test_full_spread_lifecycle_writes_begin_then_complete_with_latency(db):
    """End-to-end spread: /begin → background whisper → events table has
    spread_begin followed by spread_complete carrying latency_ms."""
    from aiohttp.test_utils import TestClient, TestServer

    async def fake_interpret(*a, **kw):
        await asyncio.sleep(0.005)  # measurable latency
        return {"intro": "шёпот", "short_answer": "ответ", "card_meaning": ["знак"], "advice": "совет"}

    app_module.interpret_reading = fake_interpret

    init_data = _make_init_data(42)

    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/spread/begin",
            json={"init_data": init_data, "spread_type": 3, "question": "вопрос"},
        )
        assert resp.status == 200
        token = (await resp.json())["token"]

        # wait for the background whisper to complete
        for _ in range(300):
            row = await get_reading_by_token(db, token)
            if row and row["status"] == STATUS_COMPLETED:
                break
            await asyncio.sleep(0.01)

    events = await _all_events(db)
    events = [e for e in events if e["event"] in ("spread_begin", "spread_complete")]
    names = [e["event"] for e in events]
    assert names == ["spread_begin", "spread_complete"]

    begin, complete = events
    assert begin["props"]["spread_type"] == 3
    assert "latency_ms" in complete["props"]
    assert isinstance(complete["props"]["latency_ms"], int)
    assert complete["props"]["latency_ms"] >= 0


@pytest.mark.asyncio
async def test_beacon_event_logged(db):
    """POST /api/events with valid initData logs a row and returns 204."""
    from aiohttp.test_utils import TestClient, TestServer

    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/events",
            json={
                "init_data": _make_init_data(555),
                "event": "guide_selected",
                "props": {"guide": "shadow_walker"},
            },
        )
        assert resp.status == 204

    events = await _all_events(db)
    assert len(events) == 1
    assert events[0]["event"] == "guide_selected"
    assert events[0]["props"] == {"guide": "shadow_walker"}


@pytest.mark.asyncio
async def test_beacon_unknown_event_dropped_silently(db):
    """Unknown event names are rejected: still 204 (never errors UI), no row."""
    from aiohttp.test_utils import TestClient, TestServer

    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/events",
            json={"init_data": _make_init_data(555), "event": "totally_bogus", "props": {}},
        )
        assert resp.status == 204
    assert await _all_events(db) == []


@pytest.mark.asyncio
async def test_beacon_invalid_init_data_dropped_silently(db):
    """Unverifiable initData → 204, no row (fire-and-forget)."""
    from aiohttp.test_utils import TestClient, TestServer

    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/events",
            json={"init_data": "garbage", "event": "guide_selected", "props": {}},
        )
        assert resp.status == 204
    assert await _all_events(db) == []


@pytest.mark.asyncio
async def test_beacon_rate_limits_per_user(db):
    """Exceeding the per-user per-minute cap drops excess events silently."""
    from aiohttp.test_utils import TestClient, TestServer

    original = app_module.EVENT_RATE_LIMIT
    app_module.EVENT_RATE_LIMIT = 2
    app_module._event_hits.clear()
    try:
        async with TestClient(TestServer(app_module.create_webapp())) as client:
            for _ in range(4):
                resp = await client.post(
                    "/api/events",
                    json={"init_data": _make_init_data(555), "event": "card_revealed", "props": {}},
                )
                assert resp.status == 204
    finally:
        app_module.EVENT_RATE_LIMIT = original
        app_module._event_hits.clear()

    events = await _all_events(db)
    assert len(events) == 2  # only the first two within the cap were stored
