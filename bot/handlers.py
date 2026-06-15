import json
from pathlib import Path

import aiosqlite
from aiogram import Router, types, F
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

from config import settings
from storage.db import create_tables, get_or_create_user, update_character, update_last_active

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
