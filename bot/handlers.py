import logging
from datetime import datetime
from pathlib import Path
import json

from aiogram import Router, types, F
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, LabeledPrice, PreCheckoutQuery, SuccessfulPayment

from config import settings
from core.payments import get_subscription_price, FIRST_MONTH_PRICE, REGULAR_PRICE, SUBSCRIPTION_TITLE, SUBSCRIPTION_DESCRIPTION_FIRST, SUBSCRIPTION_DESCRIPTION_REGULAR
from core.prompts import pick_greeting
from storage.db import (
    get_db, get_or_create_user, update_character, update_last_active,
    get_user_by_tg_id, activate_subscription,
    get_monthly_non_daily_count, is_subscribed,
    set_reminders_enabled, get_reminders_enabled,
)

logger = logging.getLogger(__name__)

_CHARACTERS_PATH = Path(__file__).resolve().parent.parent / "data" / "characters.json"

_DEFAULT_CHARACTER_ID = "shadow_walker"
_CHARACTER_IDS = ("shadow_walker", "spark_of_chaos", "ruin_keeper")


def _load_characters() -> dict[str, dict]:
    with open(_CHARACTERS_PATH, encoding="utf-8") as f:
        chars = json.load(f)
    return {c["id"]: c for c in chars}


_CHARACTERS = _load_characters()


# ── Меню ──────────────────────────────────────────────────────────

def _spread_button(text: str, spread_type: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=text,
        web_app=WebAppInfo(url=f"{settings.WEBAPP_URL}?type={spread_type}"),
    )


def _main_menu_keyboard(reminders_enabled: bool = True) -> InlineKeyboardMarkup:
    notify_label = "Напоминания: включены" if reminders_enabled else "Напоминания: выключены"
    return InlineKeyboardMarkup(inline_keyboard=[
        [ _spread_button("✦ Расклад дня", "daily") ],
        [ _spread_button("Спросить карты — один вопрос", "1") ],
        [ _spread_button("Три карты — история ситуации", "3") ],
        [
            InlineKeyboardButton(text="Моя проводница", callback_data="char:select"),
            InlineKeyboardButton(text=notify_label, callback_data="notify:menu"),
        ],
    ])


def _character_selection_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(
            text=f"{_CHARACTERS[cid]['name']} — {_CHARACTERS[cid].get('title', '')}",
            callback_data=f"char:{cid}",
        )]
        for cid in _CHARACTER_IDS
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# ── Команды ───────────────────────────────────────────────────────

start_router = Router()
character_router = Router()


@start_router.callback_query(F.data == "char:select")
async def select_character(callback: types.CallbackQuery) -> None:
    await callback.message.edit_text(
        "Кто будет читать тебе карты?",
        reply_markup=_character_selection_keyboard(),
    )
    await callback.answer()


@start_router.callback_query(F.data.startswith("char:"))
async def set_character(callback: types.CallbackQuery) -> None:
    character_id = callback.data.split(":", 1)[1]

    if character_id not in _CHARACTERS:
        await callback.answer("Неизвестная проводница.", show_alert=True)
        return

    db = await get_db()
    await update_character(db, tg_id=callback.from_user.id, character_id=character_id)
    await update_last_active(db, callback.from_user.id)

    await callback.message.edit_text(
        pick_greeting(character_id),
        reply_markup=_main_menu_keyboard(
            await get_reminders_enabled(db, callback.from_user.id)
        ),
    )
    await callback.answer()


# ── Напоминания ───────────────────────────────────────────────────

@start_router.callback_query(F.data == "notify:menu")
async def notify_menu(callback: types.CallbackQuery) -> None:
    db = await get_db()
    enabled = await get_reminders_enabled(db, callback.from_user.id)

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="Выключить напоминания" if enabled else "Включить напоминания",
            callback_data="notify:off" if enabled else "notify:on",
        )],
    ])
    await callback.message.answer(
        "Если тебя отвлекают мои письма — я пойму.\n"
        "Напоминание приходит раз в 10 дней, днём, и только если ты давно не заходил.",
        reply_markup=keyboard,
    )
    await callback.answer()


@start_router.callback_query(F.data == "notify:off")
async def notify_off(callback: types.CallbackQuery) -> None:
    db = await get_db()
    await set_reminders_enabled(db, callback.from_user.id, False)
    await callback.answer("Хорошо — больше не побеспокою.", show_alert=False)
    # обновляем подпись в меню, если оно на экране
    try:
        await callback.message.edit_reply_markup(
            reply_markup=_main_menu_keyboard(False)
        )
    except Exception:
        pass


@start_router.callback_query(F.data == "notify:on")
async def notify_on(callback: types.CallbackQuery) -> None:
    db = await get_db()
    await set_reminders_enabled(db, callback.from_user.id, True)
    await callback.answer("Напоминания снова включены.")
    try:
        await callback.message.edit_reply_markup(
            reply_markup=_main_menu_keyboard(True)
        )
    except Exception:
        pass


@start_router.message(Command("notify"))
async def cmd_notify(message: types.Message) -> None:
    db = await get_db()
    user = await get_or_create_user(db, message.from_user.id)
    await update_last_active(db, message.from_user.id)
    enabled = await get_reminders_enabled(db, message.from_user.id)

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="Выключить напоминания" if enabled else "Включить напоминания",
            callback_data="notify:off" if enabled else "notify:on",
        )],
    ])
    await message.answer(
        (
            "Напоминания сейчас включены.\n"
            "Я пишу не чаще раза в 10 дней и только днём — если ты давно не заходил."
            if enabled
            else "Напоминания выключены — я не буду писать, пока не позовёшь."
        ),
        reply_markup=keyboard,
    )


# ── Старт ─────────────────────────────────────────────────────────

@start_router.message(CommandStart())
async def cmd_start(message: types.Message) -> None:
    db = await get_db()
    user = await get_or_create_user(db, message.from_user.id)
    await update_last_active(db, message.from_user.id)

    first_start = (
        user.character_id == _DEFAULT_CHARACTER_ID
        and user.created_at == user.last_active_at
    )
    if first_start:
        await message.answer(
            "Привет. Здесь можно гадать на картах — мягко и без мистификаций.\n"
            "Для начала выбери, кто будет читать тебе карты:",
            reply_markup=_character_selection_keyboard(),
        )
    else:
        greeting = pick_greeting(user.character_id)
        await message.answer(
            greeting,
            reply_markup=_main_menu_keyboard(
                await get_reminders_enabled(db, message.from_user.id)
            ),
        )


# ── Подписка / платежи ────────────────────────────────────────────

@start_router.message(Command("subscribe"))
async def cmd_subscribe(message: types.Message) -> None:
    db = await get_db()
    user = await get_user_by_tg_id(db, message.from_user.id)
    subscribed = user and user.subscription_end and user.subscription_end.replace("T", " ") > datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    if subscribed:
        end = str(user.subscription_end).replace("T", " ")
        days_left = max(0, (datetime.fromisoformat(end) - datetime.utcnow()).days)
        await message.answer(
            f"Подписка активна ещё {days_left} дн. Следующее списание — {REGULAR_PRICE} ★."
        )
        return

    is_first = user is not None and user.first_month_done == 0
    prices = get_subscription_price(first_month=is_first)
    desc = SUBSCRIPTION_DESCRIPTION_FIRST if is_first else SUBSCRIPTION_DESCRIPTION_REGULAR

    kwargs = dict(
        title=SUBSCRIPTION_TITLE,
        description=desc,
        payload=f"sub:{message.from_user.id}",
        currency="XTR",
        prices=prices,
        start_parameter="subscribe",
    )
    # Автопродление для повторных покупок
    if not is_first:
        kwargs["subscription_period"] = 2_592_000  # 30 days

    await message.answer_invoice(**kwargs)


@start_router.message(Command("my"))
async def cmd_my_status(message: types.Message) -> None:
    db = await get_db()
    user = await get_user_by_tg_id(db, message.from_user.id)
    if user is None:
        await message.answer("Ты ещё не начал. Напиши /start")
        return

    subscribed = await is_subscribed(db, message.from_user.id)

    if subscribed:
        monthly = await get_monthly_non_daily_count(db, user.id)
        remaining = max(0, 100 - monthly)
        end = str(user.subscription_end).replace("T", " ")
        days_left = max(0, (datetime.fromisoformat(end) - datetime.utcnow()).days)
        await message.answer(
            f"Подписка активна до {end[:10]} (ещё {days_left} дн.)\n"
            f"Раскладов осталось в этом месяце: {remaining} из 100\n"
            f"Следующее списание: {REGULAR_PRICE} ★ — авто"
        )
    else:
        monthly = await get_monthly_non_daily_count(db, user.id)
        remaining = max(0, 10 - monthly)
        is_first = user.first_month_done == 0
        price = FIRST_MONTH_PRICE if is_first else REGULAR_PRICE
        if remaining > 0:
            msg = (
                f"Бесплатных раскладов в этом месяце: {remaining} из 10.\n"
                f"Расклад дня всегда бесплатный — раз в день."
            )
        else:
            msg = (
                "Бесплатные расклады на этот месяц закончились.\n"
                "Расклад дня остаётся бесплатным."
            )
        msg += f"\n\nПодписка — 100 раскладов в месяц. /subscribe — {price} ★."
        await message.answer(msg)


@start_router.callback_query(F.data == "renew_subscription")
async def renew_subscription(callback: types.CallbackQuery) -> None:
    """Продление из письма об истечении — инвойс с автопродлением."""
    prices = get_subscription_price(first_month=False)

    await callback.message.answer_invoice(
        title=SUBSCRIPTION_TITLE,
        description=SUBSCRIPTION_DESCRIPTION_REGULAR,
        payload=f"sub:{callback.from_user.id}",
        currency="XTR",
        prices=prices,
        start_parameter="subscribe",
        subscription_period=2_592_000,
    )
    await callback.answer()


@start_router.pre_checkout_query()
async def on_pre_checkout(pre_checkout: PreCheckoutQuery) -> None:
    await pre_checkout.answer(ok=True)


@start_router.message(F.successful_payment)
async def on_successful_payment(message: types.Message) -> None:
    sp = message.successful_payment
    if not sp.invoice_payload.startswith("sub:"):
        return

    tg_id = int(sp.invoice_payload.split(":")[1])
    if tg_id != message.from_user.id:
        return

    db = await get_db()
    user = await get_user_by_tg_id(db, tg_id)
    if sp.subscription_expiration_date:
        # Telegram-подписка (с автопродлением) — единый формат даты
        end_str = datetime.fromtimestamp(sp.subscription_expiration_date).strftime("%Y-%m-%d %H:%M:%S")
        await db.execute(
            "UPDATE users SET subscription_end = ? WHERE tg_id = ?",
            (end_str, tg_id),
        )
        # Первая рекуррентная платёжка закрывает льготный первый месяц
        if sp.is_first_recurring and user and not user.first_month_done:
            await db.execute(
                "UPDATE users SET first_month_done = 1 WHERE tg_id = ?",
                (tg_id,),
            )
        await db.commit()
    else:
        # Разовая оплата (первый месяц)
        await activate_subscription(db, tg_id, first_month=True)

    await message.answer(
        "Подписка активна. 100 раскладов в месяц — карты ждут.",
        reply_markup=_main_menu_keyboard(
            await get_reminders_enabled(db, message.from_user.id)
        ),
    )
