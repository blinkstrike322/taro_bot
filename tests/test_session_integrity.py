"""Durable operation keys, recovery authorization and atomic Stars access."""

import asyncio
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import aiosqlite
import pytest
import pytest_asyncio
from aiohttp.test_utils import TestClient, TestServer

import app as app_module
import storage.db as sdb
from core.quota import MONTHLY_LIMIT_FREE, reserve_quota
from storage.db import (
    STATUS_COMPLETED,
    apply_payment,
    complete_reading,
    fail_reading,
    get_or_create_user,
    get_reading_by_token,
    get_user_by_tg_id,
    init_db,
    payment_seen,
    reserve_reading,
    update_character,
)

INTERPRETATION = {"intro": "Вдохни.", "short_answer": "Сначала проясни ситуацию."}


def auth(tg_id: int) -> str:
    pairs = {"auth_date": str(int(time.time())), "user": json.dumps({"id": tg_id})}
    secret = hmac.new(b"WebAppData", app_module.settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    signature = hmac.new(secret, "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs)).encode(), hashlib.sha256)
    return urlencode({**pairs, "hash": signature.hexdigest()})


@pytest_asyncio.fixture
async def db(tmp_path):
    path = tmp_path / "integrity.db"
    conn = await init_db(str(path))
    yield conn, path
    # Slow mock interpretations must not survive teardown and write to a closed DB.
    tasks = list(app_module._whisper_tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await conn.close()
    sdb._db_connection = None


@pytest.mark.asyncio
async def test_concurrent_key_replays_pending_and_completed_without_redraw(db, monkeypatch):
    conn, _ = db
    release = asyncio.Event()
    llm_calls = 0
    draw_calls = 0
    original_draw = app_module.draw_cards

    def draw(count):
        nonlocal draw_calls
        draw_calls += 1
        return original_draw(count)

    async def interpret(**kwargs):
        nonlocal llm_calls
        llm_calls += 1
        await release.wait()
        return INTERPRETATION

    monkeypatch.setattr(app_module, "draw_cards", draw)
    monkeypatch.setattr(app_module, "interpret_reading", interpret)
    payload = {"spread_type": "three", "question": "Как найти новый путь?", "idempotency_key": "same-operation"}
    headers = {"X-Telegram-Init-Data": auth(701)}
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        responses = await asyncio.gather(*[
            client.post("/api/spread/begin", json=payload, headers=headers) for _ in range(8)
        ])
        bodies = [await response.json() for response in responses]
        assert all(response.status == 200 for response in responses)
        assert len({body["token"] for body in bodies}) == 1
        assert all(body["cards"] == bodies[0]["cards"] for body in bodies)
        assert draw_calls == 1
        release.set()
        await asyncio.gather(*list(app_module._whisper_tasks))
        response = await client.post("/api/spread/begin", json=payload, headers=headers)
        completed = await response.json()
        assert completed["status"] == STATUS_COMPLETED
        assert completed["token"] == bodies[0]["token"]
        assert completed["cards"] == bodies[0]["cards"]
        assert llm_calls == draw_calls == 1
        cursor = await conn.execute("SELECT COUNT(*) FROM readings")
        assert (await cursor.fetchone())[0] == 1


@pytest.mark.asyncio
async def test_legacy_distinct_question_and_guide_do_not_deduplicate(db, monkeypatch):
    conn, _ = db

    async def interpret(**kwargs):
        await asyncio.Event().wait()

    monkeypatch.setattr(app_module, "interpret_reading", interpret)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        headers = {"X-Telegram-Init-Data": auth(702)}
        async def begin(question):
            response = await client.post("/api/spread/begin", headers=headers,
                                         json={"spread_type": "three", "question": question})
            assert response.status == 200
            return await response.json()

        first = await begin("Первый вопрос?")
        second = await begin("Второй вопрос?")
        assert second["token"] != first["token"]
        await update_character(conn, 702, "ruin_keeper")
        third = await begin("Второй вопрос?")
        assert third["token"] != second["token"]


@pytest.mark.asyncio
async def test_key_conflicts_on_changed_input_and_is_scoped_to_user(db, monkeypatch):
    conn, _ = db

    async def interpret(**kwargs):
        return INTERPRETATION

    monkeypatch.setattr(app_module, "interpret_reading", interpret)
    payload = {"spread_type": "three", "question": "Мой вопрос?", "idempotency_key": "user-scoped-key"}
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        headers = {"X-Telegram-Init-Data": auth(703)}
        first = await client.post("/api/spread/begin", headers=headers, json=payload)
        assert first.status == 200
        for changed in ({"question": "Другой вопрос?"}, {"spread_type": "horseshoe"}):
            response = await client.post("/api/spread/begin", headers=headers, json={**payload, **changed})
            assert response.status == 409
        await update_character(conn, 703, "spark_of_chaos")
        response = await client.post("/api/spread/begin", headers=headers, json=payload)
        assert response.status == 200
        assert (await response.json())["character_id"] == "shadow_walker"
        other = await client.post("/api/spread/begin", headers={"X-Telegram-Init-Data": auth(704)}, json=payload)
        assert other.status == 200
        assert (await other.json())["token"] != (await first.json())["token"]


@pytest.mark.asyncio
async def test_key_replay_survives_reopen_and_exhausted_quota(db):
    conn, path = db
    user = await get_or_create_user(conn, 705)
    cards = {"cards": [{"id": "the-moon"}], "spread_type": "three"}
    for index in range(MONTHLY_LIMIT_FREE):
        reserved = await reserve_quota(
            conn, user.id, 705, "non_daily", question="Вопрос?", cards_data=cards,
            reading_type="spread_3", client_token=f"token-{index}",
            idempotency_key=f"operation-{index}", request_fingerprint="same-payload",
        )
        assert reserved["ok"]
        await complete_reading(conn, reserved["reading_id"], INTERPRETATION)
    # Independent connection models a process restart; the last quota slot is gone.
    async with aiosqlite.connect(path) as reopened:
        replay = await reserve_quota(
            reopened, user.id, 705, "non_daily", question="Вопрос?", cards_data=cards,
            reading_type="spread_3", client_token="never-used-token",
            idempotency_key="operation-9", request_fingerprint="same-payload",
        )
        assert replay["ok"]
        assert replay["remaining"] == 0
        assert replay["replayed"]["client_token"] == "token-9"
        assert replay["replayed"]["status"] == STATUS_COMPLETED


@pytest.mark.asyncio
async def test_database_key_uniqueness_across_connections(db):
    conn, path = db
    user = await get_or_create_user(conn, 706)
    async with aiosqlite.connect(path) as other:
        async def reserve(connection, token):
            return await reserve_quota(
                connection, user.id, 706, "non_daily", cards_data={"cards": [{"id": "the-moon"}]},
                reading_type="spread_3", client_token=token,
                idempotency_key="cross-process-key", request_fingerprint="payload",
            )
        winners = await asyncio.gather(reserve(conn, "first-token"), reserve(other, "other-token"))
        assert all(result["ok"] for result in winners)
        assert len({result["reading_id"] for result in winners}) == 1
        assert sum("replayed" in result for result in winners) == 1


@pytest.mark.asyncio
async def test_claim_without_cards_retries_without_redraw_and_reports_terminal_failure(db, monkeypatch):
    conn, _ = db
    user = await get_or_create_user(conn, 710)
    fingerprint = hashlib.sha256(json.dumps({
        "spread_id": "three", "question": "Вопрос?", "character_id": "shadow_walker",
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    reading = await reserve_reading(
        conn, user.id, "spread_three", "Вопрос?", {"spread_type": "three"}, "shadow_walker",
        unlimited=True, client_token="claimed-token", idempotency_key="claimed-operation",
        request_fingerprint=fingerprint,
    )

    def unexpected_draw(count):
        raise AssertionError("Retry must not draw again")

    monkeypatch.setattr(app_module, "draw_cards", unexpected_draw)
    headers = {"X-Telegram-Init-Data": auth(710)}
    payload = {"spread_type": "three", "question": "Вопрос?", "idempotency_key": "claimed-operation"}
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        response = await client.post("/api/spread/begin", headers=headers, json=payload)
        assert response.status == 503
        cursor = await conn.execute("SELECT COUNT(*) FROM readings WHERE user_id = ?", (user.id,))
        assert (await cursor.fetchone())[0] == 1
        await fail_reading(conn, reading, "Карты не готовы")
        response = await client.post("/api/spread/begin", headers=headers, json=payload)
        assert response.status == 422
        assert (await response.json())["error"] == "Карты не готовы"


@pytest.mark.asyncio
async def test_session_recovery_and_header_authorization(db, monkeypatch):
    conn, _ = db

    async def interpret(**kwargs):
        return INTERPRETATION

    monkeypatch.setattr(app_module, "interpret_reading", interpret)
    headers = {"X-Telegram-Init-Data": auth(707)}
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        begin = await client.post("/api/spread/begin", headers=headers, json={
            "spread_type": "mfd", "question": "Что происходит между нами?", "idempotency_key": "session-recovery",
        })
        cards = await begin.json()
        await asyncio.gather(*list(app_module._whisper_tasks))
        url = f"/api/spread/session?token={cards['token']}"
        session = await client.get(url, headers=headers)
        assert session.status == 200
        saved = await session.json()
        assert saved["cards"] == cards["cards"]
        assert saved["positions"] == cards["positions"]
        assert saved["question"] == "Что происходит между нами?"
        assert saved["status"] == STATUS_COMPLETED
        assert saved["interpretation"] == INTERPRETATION
        assert (await client.get(url)).status == 403
        assert (await client.get(url, headers={"X-Telegram-Init-Data": auth(708)})).status == 403
        assert (await client.get("/api/spread/session?token=unknown", headers=headers)).status == 404
        poll = await client.get(f"/api/spread/poll?token={cards['token']}", headers=headers)
        assert (await poll.json())["interpretation"] == INTERPRETATION
        for endpoint in ("/api/readings?all=1", "/api/stats", "/api/character"):
            assert (await client.get(endpoint, headers=headers)).status == 200
        await fail_reading(conn, saved["reading_id"], "late failure")
        assert (await get_reading_by_token(conn, cards["token"]))["status"] == STATUS_COMPLETED


@pytest.mark.asyncio
async def test_payment_receipt_and_access_apply_once_and_preserve_discount(db):
    conn, _ = db
    await get_or_create_user(conn, 801)
    assert await apply_payment(conn, "charge-a", 801, 100, "XTR", access_until="2090-01-01 00:00:00", first_month=True)
    assert not await apply_payment(conn, "charge-a", 801, 100, "XTR", access_until="2091-01-01 00:00:00")
    user = await get_user_by_tg_id(conn, 801)
    assert user.subscription_end == "2090-01-01 00:00:00"
    assert user.first_month_done == 1
    assert await apply_payment(conn, "charge-b", 801, 600, "XTR", access_until="2090-02-01 00:00:00")
    user = await get_user_by_tg_id(conn, 801)
    assert user.subscription_end == "2090-02-01 00:00:00"
    assert user.first_month_done == 1


@pytest.mark.asyncio
async def test_payment_access_failure_rolls_back_receipt_and_retry_succeeds(db):
    conn, _ = db
    await get_or_create_user(conn, 802)
    await conn.execute("""
        CREATE TRIGGER simulate_access_failure BEFORE UPDATE OF subscription_end ON users
        BEGIN SELECT RAISE(ABORT, 'simulated access failure'); END
    """)
    await conn.commit()
    with pytest.raises(aiosqlite.IntegrityError, match="simulated access failure"):
        await apply_payment(conn, "recoverable-charge", 802, 100, "XTR", first_month=True)
    assert not await payment_seen(conn, "recoverable-charge")
    assert (await get_user_by_tg_id(conn, 802)).subscription_end is None
    await conn.execute("DROP TRIGGER simulate_access_failure")
    await conn.commit()
    assert await apply_payment(conn, "recoverable-charge", 802, 100, "XTR", first_month=True)
    assert await payment_seen(conn, "recoverable-charge")
    assert (await get_user_by_tg_id(conn, 802)).subscription_end is not None


@pytest.mark.asyncio
async def test_concurrent_payment_delivery_and_missing_user(db):
    conn, path = db
    await get_or_create_user(conn, 803)
    async with aiosqlite.connect(path) as other:
        results = await asyncio.gather(
            apply_payment(conn, "duplicate-charge", 803, 100, "XTR", first_month=True),
            apply_payment(other, "duplicate-charge", 803, 100, "XTR", first_month=True),
        )
        assert sorted(results) == [False, True]
    with pytest.raises(aiosqlite.IntegrityError, match="payment user missing"):
        await apply_payment(conn, "missing-user-charge", 999, 100, "XTR")
    assert not await payment_seen(conn, "missing-user-charge")


@pytest.mark.asyncio
async def test_expired_generation_cannot_overwrite_failed_session(db):
    conn, _ = db
    user = await get_or_create_user(conn, 709)
    reading = await reserve_reading(conn, user.id, "spread_3", "Вопрос?", {}, "shadow_walker", unlimited=True)
    await fail_reading(conn, reading, "expired")
    await complete_reading(conn, reading, INTERPRETATION)
    cursor = await conn.execute("SELECT status, interpretation FROM readings WHERE id = ?", (reading,))
    row = await cursor.fetchone()
    assert row[0] == "failed"
    assert json.loads(row[1]) == {}
