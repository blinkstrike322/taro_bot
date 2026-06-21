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
    get_monthly_non_daily_count,
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


@start_router.message(Command("subscribe"))
async def cmd_subscribe(message: types.Message) -> None:
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, message.from_user.id)
        subscribed = user and user.subscription_end and user.subscription_end > datetime.utcnow().isoformat()[:19]

        if subscribed:
            days_left = (datetime.fromisoformat(user.subscription_end) - datetime.utcnow()).days
            await message.answer(
                f"Подписка активна ещё {days_left} дн. "
                f"Следующее списание — 600 \u2605."
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
        # Auto-renewal for return buyers
        if not is_first:
            kwargs["subscription_period"] = 2_592_000  # 30 days

        await message.answer_invoice(**kwargs)
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
            monthly = await get_monthly_non_daily_count(db, user.id)
            remaining = max(0, 100 - monthly)
            sub_end = user.subscription_end or "?"
            days_left = (datetime.fromisoformat(sub_end) - datetime.utcnow()).days
            await message.answer(
                f"Подписка активна до {sub_end[:10]} (осталось {days_left} дн.)\n"
                f"Осталось призывов: {remaining} из 100\n"
                f"Следующее списание: 600 \u2605 — авто",
            )
        else:
            monthly = await get_monthly_non_daily_count(db, user.id)
            remaining = max(0, 10 - monthly)
            is_first = user is not None and user.first_month_done == 0
            price = FIRST_MONTH_PRICE if is_first else REGULAR_PRICE
            msg = (
                f"Пелена приоткрыта. Осталось {remaining} призывов из 10 в этом месяце."
                if remaining > 0
                else "Пелена сомкнулась. Призывы иссякли до следующего месяца."
            )
            msg += f"\n\nПодписка — 100 призывов в месяц. Напиши /subscribe — {price} \u2605."
            await message.answer(msg)
    finally:
        await db.close()


@start_router.callback_query(F.data == "renew_subscription")
async def renew_subscription(callback: types.CallbackQuery) -> None:
    """Callback from expiry reminder — sends subscription invoice with auto-renewal."""
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

    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, tg_id)
        if sp.subscription_expiration_date:
            # Telegram subscription (with auto-renewal)
            end_iso = datetime.fromtimestamp(sp.subscription_expiration_date).isoformat()[:19]
            await db.execute(
                "UPDATE users SET subscription_end = ? WHERE tg_id = ?",
                (end_iso, tg_id),
            )
            # Mark first_month_done if this is the first recurring
            if sp.is_first_recurring and user and not user.first_month_done:
                await db.execute(
                    "UPDATE users SET first_month_done = 1 WHERE tg_id = ?",
                    (tg_id,),
                )
            await db.commit()
        else:
            # One-time payment (first month 100 Stars)
            await activate_subscription(db, tg_id, first_month=True)
    finally:
        await db.close()

    await message.answer(
        "Подписка активна!\n"
        "100 раскладов в месяц — карты ждут.",
        reply_markup=_main_menu_keyboard(),
    )
