# tests/test_spread_lifecycle.py
# Персистентный жизненный цикл расклада: токен → чтение идёт через БД
# (client_token/status), поллинг аутентифицирован и проверяет владельца,
# restart-recovery помечает зависшие расклады failed/expired.
import asyncio
import hashlib
import hmac
import json
import time
from urllib.parse import quote, urlencode

import pytest
import pytest_asyncio
from aiohttp.test_utils import TestClient, TestServer

import app as app_module
import storage.db as sdb
from core.quota import MONTHLY_LIMIT_FREE, reserve_quota
from storage.db import (
    EXPIRED_ERROR,
    STATUS_COMPLETED,
    STATUS_FAILED,
    get_reading_by_token,
    init_db,
    sweep_stale_reservations,
)

CARDS = [
    {"id": "the-moon", "name": "Луна", "is_reversed": False, "orientation": "upright"},
]


def _make_init_data(tg_id: int) -> str:
    """Собрать валидный Telegram initData (подпись тем же алгоритмом, что бэкенд)."""
    user = json.dumps({"id": tg_id, "first_name": "Test"}, separators=(",", ":"))
    pairs = {"auth_date": str(int(time.time())), "user": user}
    check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", app_module.settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({"auth_date": pairs["auth_date"], "user": user, "hash": sig}, quote_via=quote)


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await init_db(str(tmp_path / "test.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


def _canned_interpretation() -> dict:
    return {"intro": "шёпот", "short_answer": "ответ", "card_meaning": ["знак"], "advice": "совет"}


async def _wait_completed(db, token: str) -> dict:
    for _ in range(300):
        row = await get_reading_by_token(db, token)
        if row and row["status"] == STATUS_COMPLETED:
            return row
        await asyncio.sleep(0.01)
    raise AssertionError(f"reading {token} did not reach completed")


@pytest.mark.asyncio
async def test_reserve_complete_poll_happy_path(db, monkeypatch):
    """reserve→complete→poll: поллинг возвращает готовое толкование через БД."""
    async def fake_interpret(*a, **kw):
        return _canned_interpretation()
    monkeypatch.setattr(app_module, "interpret_reading", fake_interpret)

    init_data = _make_init_data(111)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/spread/begin",
            json={"init_data": init_data, "spread_type": 1, "question": None},
        )
        assert resp.status == 200
        body = await resp.json()
        token = body["token"]
        assert body["cards"]

        row = await _wait_completed(db, token)
        assert row["status"] == STATUS_COMPLETED

        q = urlencode({"token": token, "init_data": init_data})
        resp2 = await client.get(f"/api/spread/poll?{q}")
        assert resp2.status == 200
        poll = await resp2.json()
        assert poll["ready"] is True
        assert poll["interpretation"]["short_answer"] == "ответ"


@pytest.mark.asyncio
async def test_poll_rejects_foreign_token(db, monkeypatch):
    """Чужой токен чужому пользователю: 403, а не чужое толкование."""
    async def fake_interpret(*a, **kw):
        return _canned_interpretation()
    monkeypatch.setattr(app_module, "interpret_reading", fake_interpret)

    init_a = _make_init_data(222)
    init_b = _make_init_data(333)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/spread/begin",
            json={"init_data": init_a, "spread_type": 1, "question": None},
        )
        token = (await resp.json())["token"]

        q = urlencode({"token": token, "init_data": init_b})
        resp2 = await client.get(f"/api/spread/poll?{q}")
        assert resp2.status == 403
        assert (await resp2.json())["error"] == "forbidden"


@pytest.mark.asyncio
async def test_poll_requires_init_data(db):
    """Поллинг без валидного initData: 403, даже если токен известен."""
    init_data = _make_init_data(444)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        # без init_data
        resp = await client.get("/api/spread/poll?token=whatever")
        assert resp.status == 403
        # мусорный init_data
        resp = await client.get("/api/spread/poll?token=whatever&init_data=garbage")
        assert resp.status == 403
        # валидный init_data, неизвестный токен — 404, но не 403
        q = urlencode({"token": "missing", "init_data": init_data})
        resp = await client.get(f"/api/spread/poll?{q}")
        assert resp.status == 404


@pytest.mark.asyncio
async def test_sweep_stale_marks_failed_and_refunds(db):
    """Restart recovery: старый reserved помечается failed/expired, слот свободен."""
    await db.execute("INSERT INTO users (tg_id) VALUES (1)")
    await db.commit()
    res = await reserve_quota(db, user_id=1, tg_id=1, spread_type="non_daily", question="q",
        cards_data={"cards": CARDS}, reading_type="spread_3", client_token="expired-token",
    )
    assert res["ok"] is True
    assert await sweep_stale_reservations(db, older_than_minutes=15) == 0

    await db.execute(
        "UPDATE readings SET created_at = datetime('now', '-1 hour') WHERE id = ?",
        (res["reading_id"],),
    )
    await db.commit()
    assert await sweep_stale_reservations(db, older_than_minutes=15) == 1

    row = await get_reading_by_token(db, "expired-token")
    assert row["status"] == STATUS_FAILED
    assert row["error"] == EXPIRED_ERROR

    # слот возвращён: повторный резерв проходит
    res2 = await reserve_quota(db, user_id=1, tg_id=1, spread_type="non_daily", question="q",
        cards_data={"cards": CARDS}, reading_type="spread_3", client_token="new-token",
    )
    assert res2["ok"] is True


@pytest.mark.asyncio
async def test_poll_after_sweep_returns_expired(db, monkeypatch):
    """kill -9 посреди шёпота → поллинг после рестарта отдаёт expired, не 404."""
    init_data = _make_init_data(1)
    async def fake_interpret(*a, **kw):
        await asyncio.sleep(30)  # никогда не успевает — «убит» до завершения
        return _canned_interpretation()
    monkeypatch.setattr(app_module, "interpret_reading", fake_interpret)

    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/spread/begin",
            json={"init_data": init_data, "spread_type": 1, "question": None},
        )
        token = (await resp.json())["token"]

        # симулируем рестарт: старим строку и подчищаем
        row = await get_reading_by_token(db, token)
        await db.execute(
            "UPDATE readings SET created_at = datetime('now', '-1 hour') WHERE id = ?",
            (row["reading_id"],),
        )
        await db.commit()
        assert await sweep_stale_reservations(db, older_than_minutes=15) == 1

        q = urlencode({"token": token, "init_data": init_data})
        resp2 = await client.get(f"/api/spread/poll?{q}")
        assert resp2.status == 200
        poll = await resp2.json()
        assert poll["ready"] is True
        assert poll["error"] == EXPIRED_ERROR


@pytest.mark.asyncio
async def test_concurrent_begin_last_slot_single_winner(db):
    """_user_lock удалён: атомарный INSERT...SELECT guard сам решает гонку."""
    await db.execute("INSERT INTO users (tg_id) VALUES (1)")
    await db.commit()
    for _ in range(MONTHLY_LIMIT_FREE - 1):
        r = await reserve_quota(db, user_id=1, tg_id=1, spread_type="non_daily", question="q",
            cards_data={"cards": CARDS}, reading_type="spread_3",
        )
        assert r["ok"] is True

    r1, r2 = await asyncio.gather(
        reserve_quota(db, user_id=1, tg_id=1, spread_type="non_daily", question="q",
                      cards_data={"cards": CARDS}, reading_type="spread_3"),
        reserve_quota(db, user_id=1, tg_id=1, spread_type="non_daily", question="q",
                      cards_data={"cards": CARDS}, reading_type="spread_3"),
    )
    assert sum(1 for r in (r1, r2) if r["ok"]) == 1


@pytest.mark.asyncio
async def test_double_begin_returns_running_whisper(db, monkeypatch):
    """Двойной /begin (прод 2026-09-17): второй запрос получает токен бегущего
    шёпота — второй круг по провайдерам не стартует, квота не жжётся."""
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def slow_interpret(*a, **kw):
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return _canned_interpretation()
    monkeypatch.setattr(app_module, "interpret_reading", slow_interpret)

    init_data = _make_init_data(555)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        r1 = await client.post(
            "/api/spread/begin",
            json={"init_data": init_data, "spread_type": 1, "question": "вопрос?"},
        )
        assert r1.status == 200
        token1 = (await r1.json())["token"]
        await asyncio.wait_for(started.wait(), timeout=5)

        r2 = await client.post(
            "/api/spread/begin",
            json={"init_data": init_data, "spread_type": 1, "question": "вопрос?"},
        )
        assert r2.status == 200
        body2 = await r2.json()
        assert body2["token"] == token1
        assert body2["cards"]

        release.set()
        row = await _wait_completed(db, token1)
        assert row["status"] == STATUS_COMPLETED
        assert calls == 1
