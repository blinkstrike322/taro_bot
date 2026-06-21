# tests/test_quota.py
import pytest
import pytest_asyncio
import aiosqlite
from core.quota import check_quota, MONTHLY_LIMIT_FREE, MONTHLY_LIMIT_PAID


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
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    await conn.execute("INSERT INTO users (tg_id) VALUES (1)")
    await conn.commit()
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_daily_card_always_free(db):
    """Daily card не проверяет квоту."""
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="daily")
    assert result["ok"] is True
    assert result["remaining"] is None


@pytest.mark.asyncio
async def test_free_user_under_limit(db):
    """Free пользователь с 0 раскладами в месяце — может делать расклад."""
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result["ok"] is True
    assert result["remaining"] == MONTHLY_LIMIT_FREE


@pytest.mark.asyncio
async def test_free_user_over_limit(db):
    """Free пользователь превысил месячный лимит — отказано."""
    for _ in range(MONTHLY_LIMIT_FREE):
        await db.execute(
            "INSERT INTO readings (user_id, type, created_at) VALUES (?, 'spread_1', datetime('now'))",
            (1,),
        )
    await db.commit()
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result["ok"] is False
    assert result["needs_subscription"] is True
    assert result["remaining"] == 0


@pytest.mark.asyncio
async def test_paid_user_under_limit(db):
    """Paid пользователь с подпиской и 0 раскладами в месяце — может делать расклад."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days') WHERE tg_id = 1"
    )
    await db.commit()
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result["ok"] is True
    assert result["remaining"] == MONTHLY_LIMIT_PAID


@pytest.mark.asyncio
async def test_paid_user_over_limit(db):
    """Paid пользователь превысил месячный лимит — отказано."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days') WHERE tg_id = 1"
    )
    await db.commit()
    for _ in range(MONTHLY_LIMIT_PAID):
        await db.execute(
            "INSERT INTO readings (user_id, type, created_at) VALUES (?, 'spread_1', datetime('now'))",
            (1,),
        )
    await db.commit()
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result["ok"] is False
    assert result["needs_subscription"] is True
    assert result["remaining"] == 0
