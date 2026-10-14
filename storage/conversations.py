"""Durable discussion operations, independent of an HTTP connection."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS reading_followups (
 id INTEGER PRIMARY KEY, reading_id INTEGER NOT NULL REFERENCES readings(id),
 operation_key TEXT NOT NULL, question TEXT NOT NULL, card_index INTEGER,
 character_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'processing',
 answer TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(reading_id, operation_key)
);
CREATE TABLE IF NOT EXISTS reading_attempts (
 id INTEGER PRIMARY KEY, reading_id INTEGER NOT NULL REFERENCES readings(id),
 operation_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(reading_id, operation_key)
);
DROP TRIGGER IF EXISTS claim_reading_retry;
CREATE TRIGGER IF NOT EXISTS claim_reading_retry_v2 AFTER INSERT ON reading_attempts
BEGIN
 UPDATE readings SET status='processing', error=NULL, quota_at=NEW.created_at WHERE id=NEW.reading_id;
END;
"""


async def followups(db, reading_id):
    cursor = await db.execute(
        "SELECT operation_key,question,card_index,character_id,status,answer,error,created_at FROM reading_followups WHERE reading_id=? ORDER BY id",
        (reading_id,),
    )
    return [dict(r) for r in await cursor.fetchall()]


async def claim_followup(db, reading_id, key, question, card_index, guide):
    cursor = await db.execute(
        "INSERT OR IGNORE INTO reading_followups(reading_id,operation_key,question,card_index,character_id) VALUES (?,?,?,?,?)",
        (reading_id, key, question, card_index, guide),
    )
    await db.commit()
    return cursor.rowcount == 1


async def finish_followup(db, reading_id, key, answer=None, error=None):
    await db.execute(
        "UPDATE reading_followups SET status=?,answer=?,error=? WHERE reading_id=? AND operation_key=?",
        ("failed" if error else "completed", answer, error, reading_id, key),
    )
    await db.commit()


async def claim_retry(db, row, key, quota):
    cursor = await db.execute(
        "SELECT id FROM reading_attempts WHERE reading_id=? AND operation_key=?", (row["reading_id"], key)
    )
    if await cursor.fetchone():
        return "replay"
    if row["status"] != "failed":
        return "busy"
    daily = row["type"] == "daily"
    # Reserve this attempt in the current quota window; retain the original
    # creation date, question and draw for journal history.
    window = (
        "date(COALESCE(quota_at,created_at))=date('now') AND (type='daily' OR (type='spread_1' AND question IS NULL))"
        if daily
        else "strftime('%Y-%m',COALESCE(quota_at,created_at))=strftime('%Y-%m','now') AND type!='daily'"
    )
    guard = (
        ""
        if quota.get("admin") or quota.get("tester")
        else f" AND (SELECT COUNT(*) FROM readings WHERE user_id=? AND status!='failed' AND {window}) < ?"
    )
    args = (row["reading_id"], key, row["reading_id"])
    if guard:
        args += (row["user_id"], quota.get("limit") or 1)
    cursor = await db.execute(
        "INSERT OR IGNORE INTO reading_attempts(reading_id,operation_key) SELECT ?,? WHERE EXISTS (SELECT 1 FROM readings WHERE id=? AND status='failed')"
        + guard,
        args,
    )
    await db.commit()
    if cursor.rowcount == 1:
        return "claimed"
    cursor = await db.execute(
        "SELECT id FROM reading_attempts WHERE reading_id=? AND operation_key=?", (row["reading_id"], key)
    )
    return "replay" if await cursor.fetchone() else "busy"
