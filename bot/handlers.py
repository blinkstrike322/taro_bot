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
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="Карта дня",
            web_app=WebAppInfo(url=settings.WEBAPP_URL),
        )],
        [InlineKeyboardButton(
            text="Сменить проводника",
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
