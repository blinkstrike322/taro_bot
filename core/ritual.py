# core/ritual.py — серии карты дня («рассветы»).
# Порт SNAP3 src/server/user.ts::touchDailyStreak 1:1 по семантике:
#   · streakDays — все карты дня подряд;
#   · morningStreak растёт только при тяге до полудня (локальный час < 12)
#     и только если вчера рассвет тоже был пойман (gap == 1);
#   · после полудня серия рассветов ЗАМОРАЖИВАЕТСЯ (не рвётся, не растёт);
#     рвётся пропуском утреннего ритуала на следующий день;
#   · час присылает КЛИЕНТ — ритуал в таймзоне оператора.
# Метки времени — UTC-строки "YYYY-MM-DD HH:MM:SS" (как datetime('now') в SQLite):
# gap-математика всегда по UTC, локальность учитывается только часом клиента.
from __future__ import annotations

from datetime import datetime, timezone

_FMT = "%Y-%m-%d %H:%M:%S"


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts.replace("T", " "), _FMT).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _start_of_day(d: datetime) -> datetime:
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _fmt(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime(_FMT)


async def touch_daily_streak(db, user, local_hour: int | None, now: datetime | None = None) -> dict:
    """Обновить серии после карты дня; вернуть итог ритуала для клиента."""
    now = now or datetime.now(timezone.utc)
    morning = isinstance(local_hour, int) and 0 <= local_hour < 12

    last = _parse(user.last_daily_at)
    if last is None:  # первый ритуал вообще
        morning_streak = 1 if morning else 0
        await db.execute(
            "UPDATE users SET streak_days = 1, last_daily_at = ?, morning_streak = ?, "
            "last_morning_at = CASE WHEN ? THEN ? ELSE last_morning_at END WHERE id = ?",
            (_fmt(now), morning_streak, morning, _fmt(now), user.id),
        )
        await db.commit()
        return {"counted": True, "morning": morning, "streakDays": 1, "morningStreak": morning_streak}

    gap_days = (_start_of_day(now) - _start_of_day(last)).days
    if gap_days == 0:  # уже отмечен сегодня — серии стоят на месте
        return {"counted": False, "morning": morning,
                "streakDays": user.streak_days, "morningStreak": user.morning_streak}

    streak = user.streak_days + 1 if gap_days == 1 else 1

    morning_streak = user.morning_streak
    if morning:
        last_m = _parse(user.last_morning_at)
        m_gap = (_start_of_day(now) - _start_of_day(last_m)).days if last_m else None
        morning_streak = user.morning_streak + 1 if m_gap == 1 else 1

    await db.execute(
        "UPDATE users SET streak_days = ?, last_daily_at = ?, morning_streak = ?, "
        "last_morning_at = CASE WHEN ? THEN ? ELSE last_morning_at END WHERE id = ?",
        (streak, _fmt(now), morning_streak, morning, _fmt(now), user.id),
    )
    await db.commit()
    return {"counted": True, "morning": morning, "streakDays": streak, "morningStreak": morning_streak}
