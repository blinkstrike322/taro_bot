import json
from datetime import UTC, datetime

import aiosqlite

from .events import _CREATE_EVENTS_TABLE
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
    status TEXT NOT NULL DEFAULT 'reserved',
    completed_at TEXT,
    error TEXT,
    client_token TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
"""

_CREATE_PAYMENTS_TABLE = """
CREATE TABLE IF NOT EXISTS payments (
    charge_id TEXT PRIMARY KEY,
    tg_id INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


_db_connection: aiosqlite.Connection | None = None

# Маркер незавершённого резерва квоты: строка readings создана в момент
# начала расклада, толкование допишет complete_reading(). Пока маркер стоит,
# строка не попадает в историю и считается «оплаченным слотом» квоты.
_PENDING_MARKER = "{}"

# ── Жизненный цикл расклада (двухфазный spread) ─────────────────────
# reserved → processing → completed | failed. Строка readings — единственный
# источник правды: токен клиента (client_token) сохраняется в строке, поэтому
# поллинг и restart-recovery переживают перезапуск процесса. Статус 'failed'
# держит строку (для возврата ошибки в /poll), но НЕ тратит квоту: все
# подсчёты квоты исключают failed-строки (см. reserve_reading guard и
# get_*_count). Легаси-строки до миграции считаются 'completed', если у них
# есть настоящее толкование, иначе — 'reserved' (in-flight на рестарт).
STATUS_RESERVED = "reserved"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

# Ошибка проставляется sweep_stale_reservations для зависших раскладов.
EXPIRED_ERROR = "Расклад истёк после перезапуска — начни его заново."


async def reserve_reading(
    db: aiosqlite.Connection,
    user_id: int,
    type: str,
    question: str | None,
    cards_data: dict,
    character_id: str,
    *,
    unlimited: bool = False,
    limit: int = 1,
    client_token: str | None = None,
) -> int | None:
    """Атомарно занять слот квоты, создав чтение с маркером-заглушкой.

    Толкование готовится секундами, а лимит должен списываться в момент
    начала расклада — иначе два параллельных /begin одновременно пройдут
    проверку. Резерв = INSERT с guard-подзапросом: одна SQL-команда,
    SQLite сериализует запись, конкурентный запрос увидит уже занятый слот.

    Возвращает id чтения (резерв занят) или None, если слоты исчерпаны.
    Слот возвращается release_reading()/fail_reading(), толкование
    дописывается complete_reading().
    """
    cards_json = json.dumps(cards_data, ensure_ascii=False)

    if unlimited:  # админ/тестер — без лимита, но запись всё равно создаём
        cursor = await db.execute(
            "INSERT INTO readings (user_id, type, question, cards_data, interpretation, character_id, status, client_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, type, question, cards_json, _PENDING_MARKER, character_id, STATUS_RESERVED, client_token),
        )
        await db.commit()
        return cursor.lastrowid

    # Статус 'failed' — вернённый слот: не считается против лимита.
    if type == "daily":
        guard = (
            "SELECT COUNT(*) FROM readings WHERE user_id = ? AND date(created_at) = date('now') "
            "AND status != ? "
            "AND (type = 'daily' OR (type = 'spread_1' AND question IS NULL))"
        )
        guard_args = (user_id, STATUS_FAILED)
    else:
        guard = (
            "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' "
            "AND status != ? "
            "AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        )
        guard_args = (user_id, STATUS_FAILED)

    cursor = await db.execute(
        "INSERT INTO readings (user_id, type, question, cards_data, interpretation, character_id, status, client_token) "
        "SELECT ?, ?, ?, ?, ?, ?, ?, ? "
        f"WHERE ({guard}) < ?",
        (user_id, type, question, cards_json, _PENDING_MARKER, character_id, STATUS_RESERVED, client_token, *guard_args, limit),
    )
    await db.commit()
    if cursor.rowcount and cursor.rowcount > 0:
        return cursor.lastrowid
    return None


async def complete_reading(
    db: aiosqlite.Connection,
    reading_id: int,
    interpretation: dict,
) -> None:
    """Дописать толкование в зарезервированное чтение (шёпот вернулся)."""
    await db.execute(
        "UPDATE readings SET interpretation = ?, status = ?, completed_at = datetime('now'), error = NULL WHERE id = ?",
        (json.dumps(interpretation, ensure_ascii=False), STATUS_COMPLETED, reading_id),
    )
    await db.commit()


async def mark_reading_processing(db: aiosqlite.Connection, reading_id: int) -> None:
    """Перевести расклад в processing в момент старта фонового шёпота."""
    await db.execute(
        "UPDATE readings SET status = ? WHERE id = ? AND status = ?",
        (STATUS_PROCESSING, reading_id, STATUS_RESERVED),
    )
    await db.commit()


async def fail_reading(db: aiosqlite.Connection, reading_id: int, error: str) -> None:
    """Пометить расклад failed и вернуть слот квоты (failed-строки не считаются).

    Строка сохраняется, чтобы /poll по токену отдал причину, а не 404.
    """
    await db.execute(
        "UPDATE readings SET status = ?, error = ?, completed_at = datetime('now') WHERE id = ? AND status IN (?, ?)",
        (STATUS_FAILED, error, reading_id, STATUS_RESERVED, STATUS_PROCESSING),
    )
    await db.commit()


async def release_reading(db: aiosqlite.Connection, reading_id: int) -> bool:
    """Вернуть слот квоты: удалить резерв, если он так и не заполнился."""
    cursor = await db.execute(
        "DELETE FROM readings WHERE id = ? AND interpretation = ?",
        (reading_id, _PENDING_MARKER),
    )
    await db.commit()
    return bool(cursor.rowcount and cursor.rowcount > 0)


async def sweep_stale_reservations(db: aiosqlite.Connection, older_than_minutes: int = 15) -> int:
    """Пометить брошенные расклады (рестарт посреди шёпота) failed/expired.

    Вместо удаления строка помечается failed с EXPIRED_ERROR — поллинг по
    токену после рестарта отдаст «истёк», а не 404-unknown-token. Слот квоты
    освобождается автоматически, т.к. failed-строки исключены из подсчётов.
    """
    cursor = await db.execute(
        "UPDATE readings SET status = ?, error = ?, completed_at = datetime('now') "
        "WHERE status IN (?, ?) AND created_at < datetime('now', ?)",
        (STATUS_FAILED, EXPIRED_ERROR, STATUS_RESERVED, STATUS_PROCESSING, f"-{older_than_minutes} minutes"),
    )
    await db.commit()
    return cursor.rowcount or 0


async def get_active_reading(
    db: aiosqlite.Connection,
    user_id: int,
    within_minutes: int = 5,
) -> dict | None:
    """Свежайший незавершённый расклад юзера (reserved/processing) или None.

    Дедуп двойного /begin (двойной тап): второй запрос поллит уже бегущий
    шёпот вместо параллельного круга по провайдерам (прод 2026-09-17).
    """
    cursor = await db.execute(
        """SELECT id, type, question, cards_data, character_id, client_token
           FROM readings
           WHERE user_id = ? AND status IN (?, ?)
           AND created_at >= datetime('now', ?)
           ORDER BY id DESC LIMIT 1""",
        (user_id, STATUS_RESERVED, STATUS_PROCESSING, f"-{within_minutes} minutes"),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    try:
        cards_data = json.loads(row[3]) if row[3] else {}
    except (json.JSONDecodeError, TypeError):
        cards_data = {}
    if not isinstance(cards_data, dict):
        cards_data = {}
    return {
        "reading_id": row[0],
        "type": row[1],
        "question": row[2],
        "cards_data": cards_data,
        "character_id": row[4],
        "client_token": row[5],
    }


async def get_reading_by_token(
    db: aiosqlite.Connection,
    token: str,
) -> dict | None:
    """Resolve a spread token to its reading row + owner tg_id, or None.

    Токен → чтение идёт через БД (client_token), а не через process-словарь:
    mapping переживает перезапуск. Возвращает None, если токен неизвестен.
    """
    cursor = await db.execute(
        """SELECT r.id, r.user_id, r.status, r.interpretation, r.error, u.tg_id
           FROM readings r JOIN users u ON r.user_id = u.id
           WHERE r.client_token = ?""",
        (token,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    interpretation = row[3] if row[3] != _PENDING_MARKER else None
    if interpretation is not None:
        try:
            interpretation = json.loads(interpretation)
        except (json.JSONDecodeError, TypeError):
            interpretation = None
    return {
        "reading_id": row[0],
        "user_id": row[1],
        "status": row[2],
        "interpretation": interpretation,
        "error": row[4],
        "tg_id": row[5],
    }


async def _migrate_schema(db: aiosqlite.Connection) -> None:
    """Idiomatic SQLite migrations — try ALTER, ignore if exists."""
    migrations = [
        "ALTER TABLE users ADD COLUMN streak_days INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_daily_at TEXT",
        "ALTER TABLE users ADD COLUMN morning_streak INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_morning_at TEXT",
        "ALTER TABLE users ADD COLUMN subscription_end TEXT",
        "ALTER TABLE users ADD COLUMN first_month_done INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN notifications_enabled INTEGER DEFAULT 1",
        "ALTER TABLE readings ADD COLUMN status TEXT NOT NULL DEFAULT 'reserved'",
        "ALTER TABLE readings ADD COLUMN completed_at TEXT",
        "ALTER TABLE readings ADD COLUMN error TEXT",
        "ALTER TABLE readings ADD COLUMN client_token TEXT",
    ]
    for sql in migrations:
        try:
            await db.execute(sql)
            await db.commit()
        except aiosqlite.OperationalError:
            pass  # column already exists

    # Backfill: легаси-строки с реальным толкованием — completed, остальные
    # остаются 'reserved' (in-flight на момент рестарта) — их добьёт sweep.
    await db.execute(
        "UPDATE readings SET status = ? WHERE (status = ? OR status IS NULL) AND interpretation != ?",
        (STATUS_COMPLETED, STATUS_RESERVED, _PENDING_MARKER),
    )
    await db.commit()

    # Нормализация subscription_end: рекуррентные платежи писали isoformat с
    # 'T', одноразовые — SQLite-формат с пробелом. Строковые сравнения в
    # is_subscribed/reminder на смешанных форматах врут в день границы.
    await db.execute(
        "UPDATE users SET subscription_end = replace(subscription_end, 'T', ' ') "
        "WHERE subscription_end LIKE '____-__-__T%'",
    )
    await db.commit()


async def init_db(db_path: str = "taro_bot.db") -> aiosqlite.Connection:
    """Create persistent connection, enable WAL mode, create tables."""
    global _db_connection
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA wal_autocheckpoint=100")
    await conn.execute("PRAGMA foreign_keys=ON")
    await conn.execute(_CREATE_USERS_TABLE)
    await conn.execute(_CREATE_READINGS_TABLE)
    await conn.execute(_CREATE_EVENTS_TABLE)
    await conn.execute(_CREATE_PAYMENTS_TABLE)
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
        await db.execute(_CREATE_EVENTS_TABLE)
        await db.execute(_CREATE_PAYMENTS_TABLE)
        await _migrate_schema(db)
        await db.commit()


async def get_notifications_enabled(db: aiosqlite.Connection, tg_id: int) -> bool:
    """Whether the user wants to receive reminders. Defaults to True."""
    cursor = await db.execute(
        "SELECT notifications_enabled FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    return row is None or row[0] != 0


async def set_notifications_enabled(db: aiosqlite.Connection, tg_id: int, enabled: bool) -> None:
    """Set whether the user wants to receive reminders."""
    await db.execute(
        "UPDATE users SET notifications_enabled = ? WHERE tg_id = ?",
        (1 if enabled else 0, tg_id),
    )
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
    question: str | None,
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


async def get_recent_texts(
    db: aiosqlite.Connection,
    user_id: int,
    character_id: str,
    limit: int = 4,
) -> list[str]:
    """Вернуть intro+advice из последних завершённых чтений пользователя.

    Память о том, что проводник уже говорил: эти фрагменты уходят в avoid_texts,
    чтобы модель не повторялась дословно. До limit чтений (up to 2 фрагментов
    на чтение), новые первыми.
    """
    cursor = await db.execute(
        "SELECT interpretation FROM readings "
        "WHERE user_id = ? AND character_id = ? AND status = ? AND interpretation != ? "
        "ORDER BY created_at DESC LIMIT ?",
        (user_id, character_id, STATUS_COMPLETED, _PENDING_MARKER, limit),
    )
    rows = await cursor.fetchall()
    texts: list[str] = []
    for (interp,) in rows:
        if not interp:
            continue
        try:
            parsed = json.loads(interp)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(parsed, dict):
            continue
        for key in ("intro", "advice"):
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                texts.append(value.strip())
    return texts


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


def _reading_row_to_dict(row) -> dict:
    """Маппинг строки readings → dict журнала (единый для всех веток /api/readings).

    Единая точка правды для формы строк: месячная ветка, ?days=N и ?all=1
    обязаны отдавать клиенту идентичный объект (см. контракт SNAP3 api.ts).
    """
    try:
        interpretation = json.loads(row[4]) if row[4] else {}
    except (json.JSONDecodeError, TypeError):
        interpretation = {}
    try:
        cards_data = json.loads(row[3]) if row[3] else {}
    except (json.JSONDecodeError, TypeError):
        cards_data = {}
    return {
        "id": row[0],
        "type": row[1] or "",
        "question": row[2],
        "cards_data": cards_data,
        "interpretation": interpretation,
        "character_id": row[5] or "shadow_walker",
        "created_at": row[6] or "",
    }


_READINGS_SELECT = """SELECT r.id, r.type, r.question, r.cards_data, r.interpretation,
              r.character_id, r.created_at
           FROM readings r
           JOIN users u ON r.user_id = u.id"""


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
        _READINGS_SELECT + """
           WHERE u.tg_id = ?
             AND strftime('%Y', r.created_at) = ?
             AND strftime('%m', r.created_at) = ?
             AND r.interpretation != ?
           ORDER BY r.created_at""",
        (tg_id, year, month, _PENDING_MARKER),
    )
    rows = await cursor.fetchall()
    return [_reading_row_to_dict(row) for row in rows]


async def get_user_readings_days(
    db: aiosqlite.Connection,
    tg_id: int,
    days: int,
    take: int = 400,
) -> list[dict]:
    """Журнал за последние N дней (ретро-окно от текущего момента), свежие первыми.

    Тот же SELECT-список и маппинг, что у месячной ветки: формы строк совпадают.
    Резервы без толкования ('{}') в журнал не попадают — как и в месяцной ветке.
    """
    cursor = await db.execute(
        _READINGS_SELECT + """
           WHERE u.tg_id = ?
             AND r.created_at >= datetime('now', ?)
             AND r.interpretation != ?
           ORDER BY r.created_at DESC
           LIMIT ?""",
        (tg_id, f"-{int(days)} days", _PENDING_MARKER, take),
    )
    rows = await cursor.fetchall()
    return [_reading_row_to_dict(row) for row in rows]


async def get_user_readings_all(
    db: aiosqlite.Connection,
    tg_id: int,
    take: int = 500,
) -> list[dict]:
    """Весь журнал пользователя, свежие первыми (лимит take)."""
    cursor = await db.execute(
        _READINGS_SELECT + """
           WHERE u.tg_id = ?
             AND r.interpretation != ?
           ORDER BY r.created_at DESC
           LIMIT ?""",
        (tg_id, _PENDING_MARKER, take),
    )
    rows = await cursor.fetchall()
    return [_reading_row_to_dict(row) for row in rows]


async def count_user_readings(db: aiosqlite.Connection, tg_id: int) -> int:
    """Всего чтений пользователя — истина из строк журнала.

    Считаются те же строки, что видны в журнале: резервы/сбои ('{}') исключены,
    иначе статистика расходится с тем, что пользователь прокручивает.
    """
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings r "
        "JOIN users u ON r.user_id = u.id "
        "WHERE u.tg_id = ? AND r.interpretation != ?",
        (tg_id, _PENDING_MARKER),
    )
    row = await cursor.fetchone()
    return row[0] or 0


async def count_user_readings_grouped(
    db: aiosqlite.Connection,
    tg_id: int,
    group_col: str,
    allowed,
) -> dict:
    """Групповые счётчики чтений (по type или character_id) — истина из строк.

    allowed — фильтр по значению (None = без фильтра); нулевые группы
    невозможны по определению GROUP BY. Незнакомая колонка — ошибка программиста:
    колонку нельзя подставлять в SQL из внешних данных.
    """
    if group_col not in ("type", "character_id"):
        raise ValueError(f"unsupported group column: {group_col}")
    if allowed is not None and not allowed:
        return {}
    sql = (
        f"SELECT r.{group_col}, COUNT(*) FROM readings r "
        "JOIN users u ON r.user_id = u.id "
        "WHERE u.tg_id = ? AND r.interpretation != ?"
    )
    params: list = [tg_id, _PENDING_MARKER]
    if allowed is not None:
        placeholders = ", ".join("?" for _ in allowed)
        sql += f" AND r.{group_col} IN ({placeholders})"
        params.extend(allowed)
    sql += f" GROUP BY r.{group_col}"
    cursor = await db.execute(sql, params)
    rows = await cursor.fetchall()
    return {row[0]: row[1] for row in rows}


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


def _parse_db_dt(value: str) -> datetime | None:
    """Парсить таймштампы БД в обоих исторических форматах ('T' и пробел)."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace(" ", "T"))
    except ValueError:
        return None


async def is_subscribed(db: aiosqlite.Connection, tg_id: int) -> bool:
    """Check if user has active subscription (not expired)."""
    cursor = await db.execute(
        "SELECT subscription_end FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    if row is None or row[0] is None:
        return False
    end = _parse_db_dt(row[0])
    if end is None:
        return False
    return end > datetime.now(UTC).replace(tzinfo=None)


async def get_daily_non_daily_count(db: aiosqlite.Connection, user_id: int) -> int:
    """Count non-daily readings today for a user."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' AND status != ? AND date(created_at) = date('now')",
        (user_id, STATUS_FAILED),
    )
    row = await cursor.fetchone()
    return row[0]


async def get_monthly_non_daily_count(db: aiosqlite.Connection, user_id: int) -> int:
    """Count non-daily readings this month for a user."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' AND status != ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
        (user_id, STATUS_FAILED),
    )
    row = await cursor.fetchone()
    return row[0]


async def get_daily_card_count_today(db: aiosqlite.Connection, user_id: int) -> int:
    """Count daily-card readings today for a user.

    Matches both the new format (type='daily') and old format
    (type='spread_1' with no question).
    """
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND status != ? AND date(created_at) = date('now') AND (type = 'daily' OR (type = 'spread_1' AND question IS NULL))",
        (user_id, STATUS_FAILED),
    )
    row = await cursor.fetchone()
    return row[0]


async def get_user_by_tg_id(db: aiosqlite.Connection, tg_id: int) -> User | None:
    """Get full user row by tg_id."""
    cursor = await db.execute(
        "SELECT id, tg_id, character_id, created_at, last_active_at, last_reminder_sent_at, subscription_end, first_month_done, streak_days, last_daily_at, morning_streak, last_morning_at FROM users WHERE tg_id = ?",
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
        streak_days=row[8], last_daily_at=row[9],
        morning_streak=row[10], last_morning_at=row[11],
    )


async def activate_subscription(db: aiosqlite.Connection, tg_id: int, first_month: bool = False) -> None:
    """Set subscription_end to 30 days from now."""
    await db.execute(
        "UPDATE users SET subscription_end = max(COALESCE(subscription_end, ''), datetime('now', '+30 days')), "
        "first_month_done = ? WHERE tg_id = ?",
        (1 if first_month else 0, tg_id),
    )
    await db.commit()


async def payment_seen(db: aiosqlite.Connection, charge_id: str) -> bool:
    """True, если успешный платёж с этим charge_id уже обработан (идемпотентность)."""
    cursor = await db.execute(
        "SELECT 1 FROM payments WHERE charge_id = ?",
        (charge_id,),
    )
    return await cursor.fetchone() is not None


async def record_payment(
    db: aiosqlite.Connection,
    charge_id: str,
    tg_id: int,
    total_amount: int,
    currency: str,
) -> None:
    """Зафиксировать обработанный платёж (первая запись выигрывает)."""
    await db.execute(
        "INSERT OR IGNORE INTO payments (charge_id, tg_id, total_amount, currency) VALUES (?, ?, ?, ?)",
        (charge_id, tg_id, total_amount, currency),
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
        self._connection: aiosqlite.Connection | None = None

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
        question: str | None,
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
