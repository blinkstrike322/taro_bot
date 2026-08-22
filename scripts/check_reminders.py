"""Быстрые функциональные проверки новой логики напоминаний и БД."""
import asyncio
import tempfile


async def main():
    tmp = tempfile.mktemp(suffix=".db")
    from storage.db import (init_db, get_or_create_user, set_reminders_enabled,
                            get_reminders_enabled, get_inactive_users,
                            get_recent_guide_texts, save_reading, is_subscribed)
    db = await init_db(tmp)
    u = await get_or_create_user(db, 42)

    # opt-out: неактивный, но выключил напоминания -> не получает
    await db.execute("UPDATE users SET last_active_at = datetime('now','-7 days') WHERE tg_id = 42")
    await db.commit()
    await set_reminders_enabled(db, 42, False)
    assert (await get_reminders_enabled(db, 42)) is False
    assert all(x.tg_id != 42 for x in await get_inactive_users(db, days=5)), "opt-out got reminder!"

    # включил -> получает (неактивен 7 дней)
    await set_reminders_enabled(db, 42, True)
    assert any(x.tg_id == 42 for x in await get_inactive_users(db, days=5))

    # активен сегодня -> не получает
    await db.execute("UPDATE users SET last_active_at = datetime('now') WHERE tg_id = 42")
    await db.commit()
    assert all(x.tg_id != 42 for x in await get_inactive_users(db, days=5)), "active user got reminder!"

    # анти-повторение исключает текущий reading
    r = await save_reading(db, u.id, "spread_1", "q", {"cards": []},
                           {"intro": "X", "advice": "Y"}, "shadow_walker")
    assert await get_recent_guide_texts(db, u.id, "shadow_walker", exclude_reading_id=r.id) == []
    assert len(await get_recent_guide_texts(db, u.id, "shadow_walker")) == 2

    # подписка: единый формат дат (пробел)
    await db.execute("UPDATE users SET subscription_end='2026-09-30 00:00:00' WHERE tg_id=42")
    await db.commit()
    assert await is_subscribed(db, 42) is True
    await db.execute("UPDATE users SET subscription_end='2026-01-01 00:00:00' WHERE tg_id=42")
    await db.commit()
    assert await is_subscribed(db, 42) is False

    # расписание и вариативность напоминаний
    from core.reminder import _seconds_until_next_run, _pick_reminder_text
    s = _seconds_until_next_run()
    assert 0 < s <= 86400
    assert _pick_reminder_text("spark_of_chaos", 42) == _pick_reminder_text("spark_of_chaos", 42)
    texts = {_pick_reminder_text("shadow_walker", i) for i in range(4)}
    assert len(texts) == 4, texts
    print("ALL DB/REMINDER CHECKS OK — next run in", round(s / 3600, 1), "h (14:00 MSK)")


asyncio.run(main())
