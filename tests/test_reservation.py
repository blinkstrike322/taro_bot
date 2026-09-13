# tests/test_reservation.py
# Атомарное резервирование квоты: слот занимает INSERT с guard-подзапросом,
# поэтому конкурентные /begin не проходят одну проверку дважды.
import json

import aiosqlite
import pytest
import pytest_asyncio

from core.quota import MONTHLY_LIMIT_FREE, MONTHLY_LIMIT_PAID, reserve_quota
from storage.db import complete_reading, release_reading, reserve_reading, sweep_stale_reservations

CARDS = [
    {"id": "the-moon", "name": "Луна", "is_reversed": False, "orientation": "upright"},
    {"id": "death", "name": "Смерть", "is_reversed": True, "orientation": "reversed"},
    {"id": "the-star", "name": "Звезда", "is_reversed": False, "orientation": "upright"},
]


@pytest_asyncio.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE NOT NULL,
            character_id TEXT DEFAULT 'shadow_walker',
            created_at TEXT DEFAULT (datetime('now')),
            last_active_at TEXT DEFAULT (datetime('now')),
            last_reminder_sent_at TEXT,
            subscription_end TEXT,
            first_month_done INTEGER DEFAULT 0
        )
    """)
    await conn.execute("""
        CREATE TABLE readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            question TEXT,
            cards_data TEXT,
            interpretation TEXT,
            character_id TEXT DEFAULT 'shadow_walker',
            created_at TEXT DEFAULT (datetime('now')),
            status TEXT NOT NULL DEFAULT 'reserved',
            completed_at TEXT,
            error TEXT,
            client_token TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    await conn.execute("INSERT INTO users (tg_id) VALUES (1)")
    await conn.commit()
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_reserve_until_limit(db):
    """Free-пользователь: резервы занимают ровно MONTHLY_LIMIT_FREE слотов."""
    for i in range(MONTHLY_LIMIT_FREE):
        res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                                  cards_data={"cards": CARDS}, reading_type="spread_3")
        assert res["ok"] is True
        assert res["reading_id"] == i + 1
        assert res["remaining"] == MONTHLY_LIMIT_FREE - (i + 1)

    res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                              cards_data={"cards": CARDS}, reading_type="spread_3")
    assert res["ok"] is False
    assert res["needs_subscription"] is True


@pytest.mark.asyncio
async def test_reserve_atomic_no_double_spend(db):
    """Guard-подзапрос: последний слот нельзя занять дважды подряд."""
    # занимаем все слоты кроме последнего
    for _ in range(MONTHLY_LIMIT_FREE - 1):
        rid = await reserve_reading(
            db, user_id=1, type="spread_3", question="q", cards_data={"cards": CARDS},
            character_id="shadow_walker", unlimited=False, limit=MONTHLY_LIMIT_FREE,
        )
        assert rid is not None

    # последний слот — первая вставка проходит
    rid = await reserve_reading(
        db, user_id=1, type="spread_3", question="q", cards_data={"cards": CARDS},
        character_id="shadow_walker", unlimited=False, limit=MONTHLY_LIMIT_FREE,
    )
    assert rid is not None

    # конкурентная вставка с тем же guard — слот уже занят
    rid2 = await reserve_reading(
        db, user_id=1, type="spread_3", question="q", cards_data={"cards": CARDS},
        character_id="shadow_walker", unlimited=False, limit=MONTHLY_LIMIT_FREE,
    )
    assert rid2 is None


@pytest.mark.asyncio
async def test_release_refunds_slot(db):
    """Провал шёпота возвращает слот: пользователь не платит за пустой расклад."""
    res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                              cards_data={"cards": CARDS}, reading_type="spread_3")
    assert res["ok"] is True

    released = await release_reading(db, res["reading_id"])
    assert released is True

    # слот снова доступен
    res2 = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                               cards_data={"cards": CARDS}, reading_type="spread_3")
    assert res2["ok"] is True


@pytest.mark.asyncio
async def test_release_keeps_completed(db):
    """Нельзя «вернуть» уже дописанное чтение — release трогает только резервы."""
    res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                              cards_data={"cards": CARDS}, reading_type="spread_3")
    await complete_reading(db, res["reading_id"], {"intro": "x", "short_answer": "y"})

    released = await release_reading(db, res["reading_id"])
    assert released is False


@pytest.mark.asyncio
async def test_daily_one_per_day(db):
    """Карта дня: второй резерв в тот же день невозможен, подписка не влияет."""
    res = await reserve_quota(db, 1, 1, "daily", cards_data={"cards": CARDS[:1]},
                              reading_type="daily")
    assert res["ok"] is True
    assert res["reading_id"] is not None

    res2 = await reserve_quota(db, 1, 1, "daily", cards_data={"cards": CARDS[:1]},
                               reading_type="daily")
    assert res2["ok"] is False


@pytest.mark.asyncio
async def test_paid_limit_higher(db):
    """Подписчик: лимит MONTHLY_LIMIT_PAID, а не MONTHLY_LIMIT_FREE."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days') WHERE tg_id = 1"
    )
    await db.commit()
    for _ in range(MONTHLY_LIMIT_FREE + 3):
        res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                                  cards_data={"cards": CARDS}, reading_type="spread_3")
        assert res["ok"] is True
    assert res["limit"] == MONTHLY_LIMIT_PAID


@pytest.mark.asyncio
async def test_sweep_stale_reservations(db):
    """Брошенные резервы (рестарт процесса) подчищаются, свежие — живут."""
    res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                              cards_data={"cards": CARDS}, reading_type="spread_3")
    # свежий резерв — не трогаем
    assert await sweep_stale_reservations(db, older_than_minutes=15) == 0

    # «состариваем» его
    await db.execute(
        "UPDATE readings SET created_at = datetime('now', '-1 hour') WHERE id = ?",
        (res["reading_id"],),
    )
    await db.commit()
    assert await sweep_stale_reservations(db, older_than_minutes=15) == 1

    # и слот снова свободен
    res2 = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                               cards_data={"cards": CARDS}, reading_type="spread_3")
    assert res2["ok"] is True


@pytest.mark.asyncio
async def test_complete_reading_fills_marker(db):
    """Резерв создаётся с маркером '{}', complete дописывает толкование."""
    res = await reserve_quota(db, 1, 1, "non_daily", question="вопрос?",
                              cards_data={"cards": CARDS}, reading_type="spread_3")
    interp = {"intro": "шёпот", "short_answer": "ответ", "позиции": [], "advice": "совет"}
    await complete_reading(db, res["reading_id"], interp)

    cursor = await db.execute("SELECT interpretation FROM readings WHERE id = ?", (res["reading_id"],))
    row = await cursor.fetchone()
    assert json.loads(row[0]) == interp
