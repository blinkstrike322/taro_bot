"""Мягкие напоминания — юзер-ориентированные.

Правила:
- проверка раз в день в 14:00 по Москве (не ночью);
- только для тех, кто не заходил 5+ дней и не отключил напоминания;
- не чаще одного письма в 10 дней одному человеку;
- каждый раз новый текст — голосом проводницы пользователя;
- в письме: кнопка «Расклад дня» и «Отключить напоминания».
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

from storage.db import (
    get_db,
    get_inactive_users,
    set_last_sub_reminder_end,
)

logger = logging.getLogger(__name__)

MSK = timezone(timedelta(hours=3))
SEND_AT_HOUR = 14          # 14:00 МСК — рабочее окно, не ночь
INACTIVE_DAYS = 5          # писать только если человек давно не заходил
MIN_REMINDER_GAP_DAYS = 10 # и не чаще, чем раз в 10 дней
SUB_EXPIRY_WINDOW_DAYS = 3
REGULAR_PRICE = 600

# Голоса проводниц — по четыре вариации, чтобы письма не повторялись
REMINDER_TEXTS: dict[str, list[str]] = {
    "shadow_walker": [
        "Луна сегодня другая — и карты будут другими. Загляни, если хочется тишины и ответа.",
        "Твои карты лежат нетронутыми уже несколько дней. Они не в обиде — но скучают.",
        "Иногда один расклад дня меняет весь день. Селена держит для тебя свечу зажжённой.",
        "Тише... у тебя ведь есть вопрос, который ждёт. Карты готовы слушать.",
    ],
    "ruin_keeper": [
        "Очаг горит, хлеб на столе. Заходи — карты остыть не успели.",
        "Пять дней без расклада. Пора задать вопрос, который давно просится наружу.",
        "Веста держит для тебя место за столом. Один расклад — и день встанет на место.",
        "Дела подождут десять минут. Карты — нет.",
    ],
    "spark_of_chaos": [
        "Ну и сколько ещё ты будешь это откладывать? Карты ждут, я жду, интрига портится.",
        "Скучно без тебя. Приходи — расскажу, что карты про тебя нашептали.",
        "Ставлю свою искру: у тебя накопился вопрос. Пора его наконец задать.",
        "Ты знаешь, что делать. Кнопка ниже. Не заставляй меня ждать.",
    ],
}


def _pick_reminder_text(character_id: str, tg_id: int) -> str:
    """Детерминированный выбор фразы на сегодня — без повторов день в день."""
    variants = REMINDER_TEXTS.get(character_id) or REMINDER_TEXTS["shadow_walker"]
    day = datetime.now(MSK).toordinal()
    return variants[(tg_id + day) % len(variants)]


def _reminder_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="✦ Расклад дня",
            web_app=WebAppInfo(url=f"{webapp_url}?type=daily"),
        )],
        [InlineKeyboardButton(text="Отключить напоминания", callback_data="notify:off")],
    ])


async def _send_inactive_reminders(bot: Bot) -> None:
    db = await get_db()
    inactive_users = await get_inactive_users(db, days=INACTIVE_DAYS)
    sent = 0
    for user in inactive_users:
        last_reminder = user.last_reminder_sent_at
        if last_reminder:
            try:
                last_dt = datetime.fromisoformat(str(last_reminder).replace("T", " "))
                if datetime.utcnow() - last_dt < timedelta(days=MIN_REMINDER_GAP_DAYS):
                    continue
            except (ValueError, TypeError):
                pass

        text = _pick_reminder_text(user.character_id, user.tg_id)
        try:
            await bot.send_message(
                chat_id=user.tg_id,
                text=text,
                reply_markup=_reminder_keyboard(settings_webapp_url()),
            )
            await db.execute(
                "UPDATE users SET last_reminder_sent_at = datetime('now') WHERE tg_id = ?",
                (user.tg_id,),
            )
            await db.commit()
            sent += 1
        except Exception as e:
            logger.warning("Failed to send reminder to %s: %s", user.tg_id, e)

    if sent:
        logger.info("Sent %d gentle reminders", sent)


def settings_webapp_url() -> str:
    from config import settings
    return settings.WEBAPP_URL


async def _send_expiry_reminders(bot: Bot) -> None:
    """Подписка истекает через N дней — напомнить один раз (без дублей после рестарта)."""
    db = await get_db()
    cursor = await db.execute(
        "SELECT tg_id, subscription_end, last_sub_reminder_end FROM users "
        "WHERE subscription_end IS NOT NULL "
        "AND subscription_end > datetime('now') "
        "AND subscription_end <= datetime('now', ?)",
        (f"+{SUB_EXPIRY_WINDOW_DAYS} days",),
    )
    rows = await cursor.fetchall()

    for tg_id, sub_end, last_reminded in rows:
        if last_reminded == sub_end:
            continue  # уже писали про этот конец подписки

        try:
            end_dt = datetime.fromisoformat(str(sub_end).replace("T", " "))
            days_left = max(0, (end_dt - datetime.utcnow()).days)
            day_word = "сегодня-завтра" if days_left <= 1 else f"через {days_left} дн."
        except (ValueError, TypeError):
            day_word = "скоро"

        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Продлить подписку", callback_data="renew_subscription")],
        ])
        try:
            await bot.send_message(
                chat_id=tg_id,
                text=(
                    f"Подписка заканчивается {day_word}.\n"
                    f"Чтобы все 100 раскладов в месяц остались с тобой — продли заранее.\n"
                    f"Следующее списание: {REGULAR_PRICE} ★."
                ),
                reply_markup=keyboard,
            )
            await set_last_sub_reminder_end(db, tg_id, sub_end)
        except Exception as e:
            logger.warning("Failed to send expiry reminder to %s: %s", tg_id, e)


async def check_and_send_reminders(bot: Bot) -> None:
    await _send_inactive_reminders(bot)
    await _send_expiry_reminders(bot)


def _seconds_until_next_run() -> float:
    """Сколько секунд до ближайших 14:00 МСК."""
    now_msk = datetime.now(MSK)
    next_run = now_msk.replace(hour=SEND_AT_HOUR, minute=0, second=0, microsecond=0)
    if now_msk >= next_run:
        next_run += timedelta(days=1)
    return (next_run - now_msk).total_seconds()


async def reminder_loop(bot: Bot) -> None:
    """Раз в день в 14:00 МСК — мягкая проверка. Ночами никого не будим."""
    logger.info("Reminder loop scheduled daily at %02d:00 MSK", SEND_AT_HOUR)
    while True:
        try:
            await asyncio.sleep(_seconds_until_next_run())
            await check_and_send_reminders(bot)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Reminder check failed: %s", e)
            await asyncio.sleep(timedelta(hours=1).total_seconds())
