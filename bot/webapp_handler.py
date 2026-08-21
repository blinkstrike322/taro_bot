import json
import logging

from aiogram import Router, F
from aiogram.types import Message
from aiogram.enums import ContentType

from core.quota import check_quota
from core.tarot import draw_cards
from core.llm import interpret_reading
from storage.db import (
    get_or_create_user, save_reading, update_last_active, get_db,
    get_monthly_non_daily_count, get_recent_guide_texts,
)

router = Router()
logger = logging.getLogger(__name__)

DAILY_POSITIONS = ["Энергия дня", "Вызов дня", "Совет дня"]


async def has_daily_reading(db, user_id: int) -> bool:
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type = 'daily' AND date(created_at) = date('now')",
        (user_id,),
    )
    row = await cursor.fetchone()
    return row[0] > 0


def _format_daily_message(cards: list[dict], interpretation: dict) -> str:
    lines = ["РАСКЛАД ДНЯ", ""]
    for i, card in enumerate(cards[:3]):
        orientation = "пер." if card.get("is_reversed") else "прям."
        pos = DAILY_POSITIONS[i] if i < len(DAILY_POSITIONS) else ""
        lines.append(f"{pos}: {card['name']} ({orientation})")
    lines.append("")
    short = interpretation.get("short_answer", "")
    if short:
        lines.append(short)
    advice = interpretation.get("advice", "")
    if advice:
        lines.append(f"\nРитуал дня: {advice}")
    return "\n".join(lines)


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

    if action == "spread_done":
        # New-format summary sent by the WebApp after a completed reading
        text = data.get("text")
        if not text:
            cards = data.get("cards") or []
            interp = data.get("interpretation") or {}
            if data.get("type") == "daily" and cards:
                text = _format_daily_message(cards, interp)
            else:
                text = interp.get("short_answer", "")
        if text:
            await message.answer(text)
        return

    if action == "card_picked":
        # Legacy flow: user picked one of three face-down cards
        if await has_daily_reading(db, user.id):
            await message.answer(
                "Расклад дня уже открыт. Загляни завтра — карты придумают что-то новое."
            )
            return

        card_index = data.get("card_index", 0)
        cards = draw_cards(3)
        chosen_card = cards[card_index] if 0 <= card_index < len(cards) else cards[0]

        avoid_texts = await get_recent_guide_texts(db, user.id, user.character_id)
        interpretation = await interpret_reading(
            question=None,
            cards=[chosen_card],
            character_id=user.character_id,
            spread_type=1,
            avoid_texts=avoid_texts,
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

        monthly_count = await get_monthly_non_daily_count(db, user.id)
        remaining = max(0, 10 - monthly_count)
        if remaining > 0:
            result += f"\n\nПелена приоткрыта. Осталось {remaining} призывов из 10 в этом месяце."

        await message.answer(result)
