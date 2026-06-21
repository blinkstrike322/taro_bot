import json
from datetime import datetime
from pathlib import Path

import aiosqlite
from aiogram import Router, types, F
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, LabeledPrice, PreCheckoutQuery, SuccessfulPayment

from config import settings
from core.payments import get_subscription_price, FIRST_MONTH_PRICE, REGULAR_PRICE, SUBSCRIPTION_TITLE, SUBSCRIPTION_DESCRIPTION_FIRST, SUBSCRIPTION_DESCRIPTION_REGULAR
from storage.db import create_tables, get_or_create_user, update_character, update_last_active
from storage.db import (
    get_user_by_tg_id, activate_subscription,
    get_daily_non_daily_count, get_monthly_non_daily_count,
    is_subscribed,
)

_CHARACTERS_PATH = Path(__file__).resolve().parent.parent / "data" / "characters.json"

_DEFAULT_CHARACTER_ID = "shadow_walker"
_CHARACTER_IDS = ("shadow_walker", "ruin_keeper", "spark_of_chaos")

# ── zalgo / cursed helpers ──────────────────────────────────────
_ABOVE = '\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u030A\u030B\u030C\u030D\u030E\u030F\u0310\u0311\u0312\u0313\u0314\u033D\u033E\u033F\u0340\u0341\u0342\u0343\u0344\u0346\u034A\u034B\u034C\u0350\u0351\u0352\u0353\u0354\u0355\u0356\u0357\u035B\u035C\u035D\u035E\u035F\u0360\u0361\u0362\u0363\u0364\u0365\u0366\u0367\u0368\u0369\u036A\u036B\u036C\u036D\u036E\u036F'
_BELOW = '\u0316\u0317\u0318\u0319\u031C\u031D\u031E\u031F\u0320\u0321\u0322\u0323\u0324\u0325\u0326\u0327\u0328\u0329\u032A\u032B\u032C\u032D\u032E\u032F\u0330\u0331\u0332\u0333\u0339\u033A\u033B\u033C'
_CURSED_SYMS = ('†', '‡', '♰', '♱', '⚹', '☠', '○', '◇', '◎', '※', '⁂', 'Ξ', 'Ψ', 'Ж', 'ᛉ')

import random

def _zalgo(text: str, intensity: int = 2) -> str:
    result = []
    for ch in text:
        result.append(ch)
        for _ in range(random.randint(0, intensity)):
            result.append(random.choice(_ABOVE))
        for _ in range(random.randint(0, max(0, intensity - 1))):
            result.append(random.choice(_BELOW))
    return ''.join(result)

def _cursed_text(prefix: str = '') -> str:
    sym = random.choice(_CURSED_SYMS)
    return f'{prefix}{sym}' if prefix else sym


def _load_characters() -> dict[str, dict]:
    with open(_CHARACTERS_PATH, encoding="utf-8") as f:
        chars = json.load(f)
    return {c["id"]: c for c in chars}


_CHARACTERS = _load_characters()


def _character_selection_keyboard() -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(
            text=_CHARACTERS[cid]["name"],
            callback_data=f"char:{cid}",
        )]
        for cid in _CHARACTER_IDS
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _main_menu_keyboard() -> InlineKeyboardMarkup:
    url = settings.WEBAPP_URL
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="РАСКЛАД 1 КАРТА",
            web_app=WebAppInfo(url=f"{url}?type=1"),
        )],
        [InlineKeyboardButton(
            text="РАСКЛАД 3 КАРТЫ",
            web_app=WebAppInfo(url=f"{url}?type=3"),
        )],
        [InlineKeyboardButton(
            text="КАРТА ДНЯ",
            web_app=WebAppInfo(url=f"{url}?type=daily"),
        )],
        [InlineKeyboardButton(
            text="МОЯ ПОДПИСКА",
            callback_data="subscribe",
        )],
        [InlineKeyboardButton(
            text="СМЕНИТЬ ПРОВОДНИКА",
            callback_data="char:select",
        )],
    ])


start_router = Router()
character_router = Router()


@start_router.message(CommandStart())
async def cmd_start(message: types.Message) -> None:
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        await create_tables(settings.DB_PATH)
        user = await get_or_create_user(db, tg_id=message.from_user.id)
        await update_last_active(db, tg_id=message.from_user.id)

        first_start = (
            user.character_id == _DEFAULT_CHARACTER_ID
            and user.created_at == user.last_active_at
        )
        if first_start:
            await message.answer(
                "Выбери своего проводника:",
                reply_markup=_character_selection_keyboard(),
            )
        else:
            greeting = _CHARACTERS.get(user.character_id, {}).get(
                "greeting", "Добро пожаловать.",
            )
            await message.answer(
                greeting,
                reply_markup=_main_menu_keyboard(),
            )
    finally:
        await db.close()


@character_router.callback_query(F.data == "char:select")
async def select_character(callback: types.CallbackQuery) -> None:
    await callback.message.edit_text(
        "Выбери своего проводника:",
        reply_markup=_character_selection_keyboard(),
    )
    await callback.answer()


@character_router.callback_query(F.data.startswith("char:"))
async def set_character(callback: types.CallbackQuery) -> None:
    character_id = callback.data.split(":", 1)[1]

    if character_id not in _CHARACTERS:
        await callback.answer("Неизвестный проводник.", show_alert=True)
        return

    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        await update_character(db, tg_id=callback.from_user.id, character_id=character_id)
    finally:
        await db.close()

    char = _CHARACTERS[character_id]
    await callback.message.edit_text(
        char["greeting"],
        reply_markup=_main_menu_keyboard(),
    )
    await callback.answer()


# ── Subscription / payments ──────────────────────────────────────


@start_router.callback_query(F.data == "subscribe")
async def subscribe_menu(callback: types.CallbackQuery) -> None:
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, callback.from_user.id)
    finally:
        await db.close()

    if user and user.subscription_end and user.subscription_end > datetime.utcnow().isoformat()[:19]:
        days_left = (datetime.fromisoformat(user.subscription_end) - datetime.utcnow()).days
        await callback.message.edit_text(
            f"Подписка активна ещё {days_left} дн.\n\nПродлить?",
            reply_markup=_subscription_keyboard(first_month=False),
        )
    else:
        await callback.message.edit_text(
            "Нет активной подписки.\n\n"
            "• Бесплатно — 3 не-дневных расклада в день\n"
            "• По подписке — 100 раскладов в месяц\n\n"
            "Выбери тариф:",
            reply_markup=_subscription_keyboard(first_month=True),
        )
    await callback.answer()


def _subscription_keyboard(first_month: bool = False) -> InlineKeyboardMarkup:
    buttons = []
    if first_month:
        buttons.append([InlineKeyboardButton(
            text=f"Первый месяц — {FIRST_MONTH_PRICE} \u2605",
            callback_data="buy_subscription:first",
        )])
    buttons.append([InlineKeyboardButton(
        text=f"Обычный месяц — {REGULAR_PRICE} \u2605",
        callback_data="buy_subscription:regular",
    )])
    buttons.append([InlineKeyboardButton(
        text="\u00ab Назад",
        callback_data="back_to_menu",
    )])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@start_router.callback_query(F.data == "back_to_menu")
async def back_to_menu(callback: types.CallbackQuery) -> None:
    await callback.message.edit_text(
        _CHARACTERS.get(_DEFAULT_CHARACTER_ID, {}).get("greeting", "Главное меню."),
        reply_markup=_main_menu_keyboard(),
    )
    await callback.answer()


@start_router.callback_query(F.data.startswith("buy_subscription:"))
async def buy_subscription(callback: types.CallbackQuery) -> None:
    is_first = callback.data.split(":", 1)[1] == "first"
    prices = get_subscription_price(first_month=is_first)

    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, callback.from_user.id)
    finally:
        await db.close()

    if is_first and user and user.first_month_done:
        await callback.answer("Первомесячная скидка уже использована.", show_alert=True)
        return

    title = f"{SUBSCRIPTION_TITLE} {'(со скидкой)' if is_first else ''}"
    desc = SUBSCRIPTION_DESCRIPTION_FIRST if is_first else SUBSCRIPTION_DESCRIPTION_REGULAR
    payload = f"sub:{callback.from_user.id}:{'first' if is_first else 'regular'}"

    await callback.message.answer_invoice(
        title=title,
        description=desc,
        payload=payload,
        currency="XTR",
        prices=prices,
    )
    await callback.answer()


@start_router.message(Command("subscribe"))
async def cmd_subscribe(message: types.Message) -> None:
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, message.from_user.id)
        first_month = user is not None and user.first_month_done == 0
        prices = get_subscription_price(first_month=first_month)

        await message.answer_invoice(
            title=SUBSCRIPTION_TITLE,
            description=SUBSCRIPTION_DESCRIPTION_FIRST if first_month else SUBSCRIPTION_DESCRIPTION_REGULAR,
            payload=f"sub:{message.from_user.id}:{'first' if first_month else 'regular'}",
            currency="XTR",
            prices=prices,
            start_parameter="subscribe",
        )
    finally:
        await db.close()


@start_router.message(Command("my"))
async def cmd_my_status(message: types.Message) -> None:
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, message.from_user.id)
        if user is None:
            await message.answer("Ты ещё не начал. Напиши /start")
            return

        subscribed = await is_subscribed(db, message.from_user.id)

        if subscribed:
            daily = await get_daily_non_daily_count(db, user.id)
            monthly = await get_monthly_non_daily_count(db, user.id)
            remaining_monthly = max(0, 100 - monthly)
            sub_end = user.subscription_end or "?"
            await message.answer(
                f"\u2b50 Подписка активна до {sub_end[:10]}\n"
                f"Осталось раскладов в месяце: {remaining_monthly}\n"
                f"Сегодня использовано: {daily} из 3 (бесплатные не считаются)",
            )
        else:
            await message.answer(
                "У тебя пока нет подписки.\n"
                "Бесплатно: 3 расклада в день.\n"
                "Подписка: 100 раскладов в месяц.\n"
                "Первый месяц — 100 \u2605, далее — 600 \u2605 в месяц.\n"
                "/subscribe — оформить",
            )
    finally:
        await db.close()


@start_router.pre_checkout_query()
async def on_pre_checkout(pre_checkout: PreCheckoutQuery) -> None:
    await pre_checkout.answer(ok=True)


@start_router.message(F.successful_payment)
async def on_successful_payment(message: types.Message) -> None:
    payload = message.successful_payment.invoice_payload
    parts = payload.split(":")
    if len(parts) < 2 or parts[0] != "sub":
        await message.answer("Ошибка платежа. Свяжись с поддержкой.")
        return

    tg_id = int(parts[1])
    is_first = len(parts) >= 3 and parts[2] == "first"

    if tg_id != message.from_user.id:
        await message.answer("Ошибка: неверный пользователь.")
        return

    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        await activate_subscription(db, tg_id, first_month=is_first)
    finally:
        await db.close()

    await message.answer(
        "Подписка активирована!\n"
        "Тебе доступно 100 раскладов в месяц.",
        reply_markup=_main_menu_keyboard(),
    )
