import logging
from datetime import datetime, timedelta
import asyncio

import aiosqlite
from aiogram import Bot

from config import settings
from storage.db import get_inactive_users

logger = logging.getLogger(__name__)

REMINDER_INTERVAL_HOURS = 6
INACTIVE_DAYS = 3
MIN_REMINDER_GAP_DAYS = 7

async def check_and_send_reminders(bot: Bot) -> None:
    async with aiosqlite.connect(settings.DB_PATH) as db:
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
                    text="Карты ждут тебя. Загляни -- возможно, сегодня они раскроют что-то важное.",
                )
                await db.execute(
                    "UPDATE users SET last_reminder_sent_at = datetime('now') WHERE tg_id = ?",
                    (user.tg_id,),
                )
                await db.commit()
                logger.info(f"Reminder sent to user {user.tg_id}")
            except Exception as e:
                logger.warning(f"Failed to send reminder to {user.tg_id}: {e}")


async def reminder_loop(bot: Bot) -> None:
    while True:
        try:
            await check_and_send_reminders(bot)
        except Exception as e:
            logger.error(f"Reminder check failed: {e}")
        await asyncio.sleep(REMINDER_INTERVAL_HOURS * 3600)
