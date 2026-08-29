# tests/test_notifications.py
import pytest
import pytest_asyncio
import aiosqlite
from unittest.mock import AsyncMock

from storage.db import get_notifications_enabled, set_notifications_enabled
from core.reminder import _send_inactive_reminders


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
            notifications_enabled INTEGER DEFAULT 1
        )
    """)
    # А — уведомления включены, неактивен давно; Б — уведомления выключены, неактивен давно
    await conn.execute(
        "INSERT INTO users (tg_id, last_active_at) VALUES (1, datetime('now', '-10 days'))"
    )
    await conn.execute(
        "INSERT INTO users (tg_id, notifications_enabled, last_active_at) "
        "VALUES (2, 0, datetime('now', '-10 days'))"
    )
    await conn.commit()
    yield conn
    await conn.close()


@pytest.mark.asyncio
async def test_notifications_default_enabled(db):
    assert await get_notifications_enabled(db, 1) is True
    assert await get_notifications_enabled(db, 2) is False


@pytest.mark.asyncio
async def test_notifications_toggle(db):
    await set_notifications_enabled(db, 1, False)
    assert await get_notifications_enabled(db, 1) is False
    await set_notifications_enabled(db, 1, True)
    assert await get_notifications_enabled(db, 1) is True


@pytest.mark.asyncio
async def test_inactive_reminder_skips_disabled_users(db):
    """Напоминания не отправляются пользователям с выключенными уведомлениями."""
    bot = AsyncMock()
    await _send_inactive_reminders(db, bot)
    # А (enabled) получает напоминание, Б (disabled) — нет
    sent_tg_ids = {call.kwargs["chat_id"] for call in bot.send_message.call_args_list}
    assert 1 in sent_tg_ids
    assert 2 not in sent_tg_ids