import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiosqlite

from .models import Reading, User

_CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER UNIQUE NOT NULL,
    character_id TEXT NOT NULL DEFAULT 'shadow_walker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_reminder_sent_at TEXT
)
"""

_CREATE_READINGS_TABLE = """
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    question TEXT,
    cards_data TEXT NOT NULL,
    interpretation TEXT NOT NULL,
    character_id TEXT NOT NULL DEFAULT 'shadow_walker',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
)
"""


_db_connection: Optional[aiosqlite.Connection] = None


async def _migrate_schema(db: aiosqlite.Connection) -> None:
    """Idiomatic SQLite migrations — try ALTER, ignore if exists."""
    migrations = [
        "ALTER TABLE users ADD COLUMN subscription_end TEXT",
        "ALTER TABLE users ADD COLUMN first_month_done INTEGER DEFAULT 0",
    ]
    for sql in migrations:
        try:
            await db.execute(sql)
            await db.commit()
        except aiosqlite.OperationalError:
            pass  # column already exists


async def init_db(db_path: str = "taro_bot.db") -> aiosqlite.Connection:
    """Create persistent connection, enable WAL mode, create tables."""
    global _db_connection
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    await conn.execute(_CREATE_USERS_TABLE)
    await conn.execute(_CREATE_READINGS_TABLE)
    await _migrate_schema(conn)
    await conn.commit()
    _db_connection = conn
    return conn


async def get_db() -> aiosqlite.Connection:
    """Return the persistent connection. Raises if not initialized."""
    if _db_connection is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db_connection


async def create_tables(db_path: str = "taro_bot.db") -> None:
    """Create database tables if they do not exist."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute(_CREATE_USERS_TABLE)
        await db.execute(_CREATE_READINGS_TABLE)
        await db.commit()


async def get_or_create_user(db: aiosqlite.Connection, tg_id: int) -> User:
    """Return existing user or create a new one for the given Telegram ID."""
    await db.execute(
        "INSERT OR IGNORE INTO users (tg_id) VALUES (?)",
        (tg_id,),
    )
    await db.commit()

    cursor = await db.execute(
        "SELECT id, tg_id, character_id, created_at, last_active_at, last_reminder_sent_at FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    return User(
        id=row[0],
        tg_id=row[1],
        character_id=row[2],
        created_at=row[3],
        last_active_at=row[4],
        last_reminder_sent_at=row[5],
    )


async def save_reading(
    db: aiosqlite.Connection,
    user_id: int,
    type: str,
    question: Optional[str],
    cards_data: dict,
    interpretation: dict,
    character_id: str = "shadow_walker",
) -> Reading:
    """Save a tarot reading to the database."""
    cards_json = json.dumps(cards_data, ensure_ascii=False)
    interpretation_json = json.dumps(interpretation, ensure_ascii=False)

    cursor = await db.execute(
        "INSERT INTO readings (user_id, type, question, cards_data, interpretation, character_id) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, type, question, cards_json, interpretation_json, character_id),
    )
    await db.commit()

    reading_id = cursor.lastrowid
    cursor = await db.execute(
        "SELECT id, user_id, type, question, cards_data, interpretation, character_id, created_at FROM readings WHERE id = ?",
        (reading_id,),
    )
    row = await cursor.fetchone()
    return Reading(
        id=row[0],
        user_id=row[1],
        type=row[2],
        question=row[3],
        cards_data=json.loads(row[4]),
        interpretation=json.loads(row[5]),
        character_id=row[6],
        created_at=row[7],
    )


async def get_user_readings(
    db: aiosqlite.Connection,
    user_id: int,
    limit: int = 30,
) -> list[Reading]:
    """Return recent readings for a user, newest first."""
    cursor = await db.execute(
        "SELECT id, user_id, type, question, cards_data, interpretation, character_id, created_at FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    )
    rows = await cursor.fetchall()
    return [
        Reading(
            id=row[0],
            user_id=row[1],
            type=row[2],
            question=row[3],
            cards_data=json.loads(row[4]),
            interpretation=json.loads(row[5]),
            character_id=row[6],
            created_at=row[7],
        )
        for row in rows
    ]


async def get_user_readings_by_month(
    db: aiosqlite.Connection,
    tg_id: int,
    year: str,
    month: str,
) -> list[dict]:
    """Return full readings for a tg_id in given month/year, ordered by day.

    Returns full data: id, type, question, cards_data, interpretation,
    character_id, created_at — so the frontend can render cards + reading.
    """
    cursor = await db.execute(
        """SELECT r.id, r.type, r.question, r.cards_data, r.interpretation,
                  r.character_id, r.created_at
           FROM readings r
           JOIN users u ON r.user_id = u.id
           WHERE u.tg_id = ?
             AND strftime('%Y', r.created_at) = ?
             AND strftime('%m', r.created_at) = ?
           ORDER BY r.created_at""",
        (tg_id, year, month),
    )
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        try:
            interpretation = json.loads(row[4]) if row[4] else {}
        except (json.JSONDecodeError, TypeError):
            interpretation = {}
        try:
            cards_data = json.loads(row[3]) if row[3] else {}
        except (json.JSONDecodeError, TypeError):
            cards_data = {}
        result.append({
            "id": row[0],
            "type": row[1] or "",
            "question": row[2],
            "cards_data": cards_data,
            "interpretation": interpretation,
            "character_id": row[5] or "shadow_walker",
            "created_at": row[6] or "",
        })
    return result


async def update_character(db: aiosqlite.Connection, tg_id: int, character_id: str) -> None:
    """Update the selected character for a user."""
    await db.execute(
        "UPDATE users SET character_id = ? WHERE tg_id = ?",
        (character_id, tg_id),
    )
    await db.commit()


async def update_last_active(db: aiosqlite.Connection, tg_id: int) -> None:
    """Update the last_active_at timestamp for a user."""
    await db.execute(
        "UPDATE users SET last_active_at = datetime('now') WHERE tg_id = ?",
        (tg_id,),
    )
    await db.commit()


async def get_inactive_users(
    db: aiosqlite.Connection,
    days: int = 3,
) -> list[User]:
    """Return users who have been inactive for at least the given number of days."""
    cursor = await db.execute(
        "SELECT id, tg_id, character_id, created_at, last_active_at, last_reminder_sent_at FROM users WHERE last_active_at < datetime('now', ?)",
        (f"-{days} days",),
    )
    rows = await cursor.fetchall()
    return [
        User(
            id=row[0],
            tg_id=row[1],
            character_id=row[2],
            created_at=row[3],
            last_active_at=row[4],
            last_reminder_sent_at=row[5],
        )
        for row in rows
    ]


async def update_reminder_sent(db: aiosqlite.Connection, tg_id: int) -> None:
    """Update the last_reminder_sent_at timestamp for a user."""
    await db.execute(
        "UPDATE users SET last_reminder_sent_at = datetime('now') WHERE tg_id = ?",
        (tg_id,),
    )
    await db.commit()


async def is_subscribed(db: aiosqlite.Connection, tg_id: int) -> bool:
    """Check if user has active subscription (not expired)."""
    cursor = await db.execute(
        "SELECT subscription_end FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    if row is None or row[0] is None:
        return False
    return row[0] > datetime.utcnow().isoformat()[:19]


async def get_daily_non_daily_count(db: aiosqlite.Connection, user_id: int) -> int:
    """Count non-daily readings today for a user."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' AND date(created_at) = date('now')",
        (user_id,),
    )
    row = await cursor.fetchone()
    return row[0]


async def get_monthly_non_daily_count(db: aiosqlite.Connection, user_id: int) -> int:
    """Count non-daily readings this month for a user."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
        (user_id,),
    )
    row = await cursor.fetchone()
    return row[0]


async def get_user_by_tg_id(db: aiosqlite.Connection, tg_id: int) -> Optional[User]:
    """Get full user row by tg_id."""
    cursor = await db.execute(
        "SELECT id, tg_id, character_id, created_at, last_active_at, last_reminder_sent_at, subscription_end, first_month_done FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return User(
        id=row[0], tg_id=row[1], character_id=row[2],
        created_at=row[3], last_active_at=row[4],
        last_reminder_sent_at=row[5],
        subscription_end=row[6], first_month_done=row[7],
    )


async def activate_subscription(db: aiosqlite.Connection, tg_id: int, first_month: bool = False) -> None:
    """Set subscription_end to 30 days from now."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days'), first_month_done = ? WHERE tg_id = ?",
        (1 if first_month else 0, tg_id),
    )
    await db.commit()


async def update_first_month_done(db: aiosqlite.Connection, tg_id: int) -> None:
    """Mark that user has used their first-month discount."""
    await db.execute(
        "UPDATE users SET first_month_done = 1 WHERE tg_id = ?",
        (tg_id,),
    )
    await db.commit()


class Database:
    """Async database wrapper that manages connection lifecycle."""

    def __init__(self, db_path: str = "taro_bot.db") -> None:
        self.db_path = db_path
        self._connection: Optional[aiosqlite.Connection] = None

    async def connect(self) -> None:
        """Open a database connection and ensure tables exist."""
        self._connection = await aiosqlite.connect(self.db_path)
        self._connection.row_factory = aiosqlite.Row
        await create_tables(self.db_path)

    async def close(self) -> None:
        """Close the database connection."""
        if self._connection:
            await self._connection.close()
            self._connection = None

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._connection is None:
            raise RuntimeError("Database is not connected. Call connect() first.")
        return self._connection

    async def get_or_create_user(self, tg_id: int) -> User:
        return await get_or_create_user(self.conn, tg_id)

    async def save_reading(
        self,
        user_id: int,
        type: str,
        question: Optional[str],
        cards_data: dict,
        interpretation: dict,
        character_id: str = "shadow_walker",
    ) -> Reading:
        return await save_reading(self.conn, user_id, type, question, cards_data, interpretation, character_id)

    async def get_user_readings(self, user_id: int, limit: int = 30) -> list[Reading]:
        return await get_user_readings(self.conn, user_id, limit)

    async def update_character(self, tg_id: int, character_id: str) -> None:
        return await update_character(self.conn, tg_id, character_id)

    async def update_last_active(self, tg_id: int) -> None:
        return await update_last_active(self.conn, tg_id)

    async def get_inactive_users(self, days: int = 3) -> list[User]:
        return await get_inactive_users(self.conn, days)

    async def update_reminder_sent(self, tg_id: int) -> None:
        return await update_reminder_sent(self.conn, tg_id)
