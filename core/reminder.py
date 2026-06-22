import logging
from datetime import datetime, timedelta
import asyncio

import aiosqlite
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

from config import settings
from storage.db import get_inactive_users, get_db

logger = logging.getLogger(__name__)

REMINDER_INTERVAL_HOURS = 6
INACTIVE_DAYS = 3
MIN_REMINDER_GAP_DAYS = 7
SUB_EXPIRY_WINDOW_DAYS = 3
REGULAR_PRICE = 600

# Avoid re-sending same expiry reminder
_last_sub_reminder: dict[int, str] = {}


async def check_and_send_reminders(bot: Bot) -> None:
    """Use the shared DB connection (initialized by main()) instead of
    opening a fresh connection every loop iteration. Falls back to a
    short-lived connection if the shared pool isn't ready (e.g. tests).
    """
    try:
        db = await get_db()
        await _send_inactive_reminders(db, bot)
        await _send_expiry_reminders(db, bot)
    except RuntimeError:
        # DB not initialized in this context — open a temporary connection.
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await _send_inactive_reminders(db, bot)
            await _send_expiry_reminders(db, bot)


async def _send_inactive_reminders(db: aiosqlite.Connection, bot: Bot) -> None:
    inactive_users = await get_inactive_users(db, days=INACTIVE_DAYS)
    for user in inactive_users:
        last_reminder = user.last_reminder_sent_at
        if last_reminder:
            try:
                last_dt = datetime.fromisoformat(last_reminder)
                if datetime.utcnow() - last_dt < timedelta(days=MIN_REMINDER_GAP_DAYS):
                    continue
            except (ValueError, TypeError):
                pass

        try:
            await bot.send_message(
                chat_id=user.tg_id,
                text="Карты ждут тебя. Загляни — возможно, сегодня они раскроют что-то важное.",
            )
            await db.execute(
                "UPDATE users SET last_reminder_sent_at = datetime('now') WHERE tg_id = ?",
                (user.tg_id,),
            )
            await db.commit()
            logger.info(f"Reminder sent to user {user.tg_id}")
        except Exception as e:
            logger.warning(f"Failed to send reminder to {user.tg_id}: {e}")


async def _send_expiry_reminders(db: aiosqlite.Connection, bot: Bot) -> None:
    """Send renewal reminders for subscriptions expiring within SUB_EXPIRY_WINDOW_DAYS."""
    cursor = await db.execute(
        "SELECT tg_id, subscription_end FROM users "
        "WHERE subscription_end IS NOT NULL "
        "AND subscription_end > datetime('now') "
        "AND subscription_end <= datetime('now', ?)",
        (f"+{SUB_EXPIRY_WINDOW_DAYS} days",),
    )
    rows = await cursor.fetchall()

    now = datetime.utcnow()
    for tg_id, sub_end in rows:
        # Only remind once per subscription_end value
        prev = _last_sub_reminder.get(tg_id)
        if prev == sub_end:
            continue
        _last_sub_reminder[tg_id] = sub_end

        days_left = (datetime.fromisoformat(sub_end) - now).days

        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Продлить подписку", callback_data="renew_subscription")],
        ])

        try:
            await bot.send_message(
                chat_id=tg_id,
                text=(
                    f"Подписка заканчивается через {days_left} дн.\n"
                    f"Продли сейчас, чтобы не потерять доступ к 100 раскладам в месяц.\n"
                    f"Следующее списание: {REGULAR_PRICE} \u2605."
                ),
                reply_markup=keyboard,
            )
            logger.info(f"Subscription expiry reminder sent to {tg_id}")
        except Exception as e:
            logger.warning(f"Failed to send expiry reminder to {tg_id}: {e}")


async def reminder_loop(bot: Bot) -> None:
    while True:
        try:
            await check_and_send_reminders(bot)
        except Exception as e:
            logger.error(f"Reminder check failed: {e}")
        await asyncio.sleep(REMINDER_INTERVAL_HOURS * 3600)
