import json
import logging
from datetime import datetime

import aiosqlite
from aiogram import Router, F
from aiogram.types import Message
from aiogram.enums import ContentType

from core.tarot import draw_cards
from core.llm import interpret_reading
from storage.db import get_or_create_user, save_reading, update_last_active, get_db

router = Router()
logger = logging.getLogger(__name__)


async def has_daily_reading(db: aiosqlite.Connection, user_id: int) -> bool:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type = 'daily' AND date(created_at) = date('now')",
        (user_id,),
    )
    row = await cursor.fetchone()
    return row[0] > 0


@router.message(F.content_type == ContentType.WEB_APP_DATA)
async def handle_webapp_data(message: Message):
    try:
        data = json.loads(message.web_app_data.data)
    except (json.JSONDecodeError, TypeError):
        await message.answer("Ошибка данных. Попробуй еще раз.")
        return

    action = data.get("action")
    db = await get_db()
    user = await get_or_create_user(db, message.from_user.id)
    await update_last_active(db, message.from_user.id)

    if action == "card_picked":
        if await has_daily_reading(db, user.id):
            await message.answer("Ты уже узнал свою судьбу сегодня. Завтра будут новые карты.")
            return

        card_index = data.get("card_index", 0)
        cards = draw_cards(3)
        chosen_card = cards[card_index] if 0 <= card_index < len(cards) else cards[0]

        interpretation = await interpret_reading(
            question=None,
            cards=[chosen_card],
            character_id=user.character_id,
            spread_type=1,
        )

        await save_reading(
            db=db,
            user_id=user.id,
            type="daily",
            question=None,
            cards_data={"chosen_index": card_index, "chosen_card": chosen_card},
            interpretation=interpretation,
            character_id=user.character_id,
        )

        short_answer = interpretation.get("short_answer", "")
        advice = interpretation.get("advice", "")
        orientation = "перевернута" if chosen_card.get("is_reversed") else "прямое"

        result = f"-- {chosen_card['name']} ({orientation}) --\n\n{short_answer}"
        if advice:
            result += f"\n\nСовет: {advice}"

        await message.answer(result)
