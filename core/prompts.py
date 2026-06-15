from __future__ import annotations

import json
from pathlib import Path

_CHARACTERS_PATH = Path(__file__).resolve().parent.parent / "data" / "characters.json"

_characters_cache: dict[str, dict] | None = None


def _load_characters() -> dict[str, dict]:
    global _characters_cache
    if _characters_cache is None:
        with open(_CHARACTERS_PATH, encoding="utf-8") as f:
            raw: list[dict] = json.load(f)
        _characters_cache = {ch["id"]: ch for ch in raw}
    return _characters_cache


def get_system_prompt(character_id: str) -> str:
    """Return the system prompt for the given character.

    Args:
        character_id: One of 'shadow_walker', 'ruin_keeper', 'spark_of_chaos'.

    Returns:
        The full system prompt string.

    Raises:
        KeyError: If character_id is not found.
    """
    characters = _load_characters()
    if character_id not in characters:
        raise KeyError(
            f"Unknown character_id '{character_id}'. "
            f"Available: {', '.join(characters)}"
        )
    base_prompt = characters[character_id]["system_prompt"]
    no_emoji_rule = (
        "\n\nПОДТВЕРЖДЕНИЕ: Emoji СТРОГО ЗАПРЕЩЕНЫ в любом месте ответа. "
        "Ни одного эмодзи. Только обычный кириллический текст.\n"
        "REMEMBER: Your response will be REJECTED if it contains any emoji. "
        "This is a hard rule with zero exceptions."
    )
    return base_prompt + no_emoji_rule


def build_reading_prompt(
    cards: list[dict],
    question: str | None,
    character_id: str,
    spread_type: int = 1,
) -> str:
    """Construct the user-facing prompt for a tarot reading.

    Args:
        cards: List of card dicts, each with at least 'name' and
               'orientation' ('upright' or 'reversed').
        question: The user's question, or None if no question was asked.
        character_id: The character reading the cards (used for future
                       character-specific prompt tweaks).
        spread_type: Number of cards in spread (1 or 3). For 3-card spreads,
                     includes positional labels (Прошлое/Настоящее/Будущее).

    Returns:
        A formatted user prompt string.
    """
    lines: list[str] = []

    lines.append("Вопрос пользователя:")
    lines.append(question if question else "(спонтанный расклад — пользователь не задавал вопроса)")
    lines.append("")

    positions = ["Прошлое", "Настоящее", "Будущее"]
    if spread_type == 3 and len(cards) == 3:
        lines.append("Расклад 3 карты (Прошлое — Настоящее — Будущее):")
        for i, card in enumerate(cards, 1):
            orientation = (
                "прямое" if card.get("orientation") == "upright" else "перевернутое"
            )
            lines.append(f"{i}. {card['name']} ({orientation}) — позиция {positions[i-1]}")
    else:
        lines.append("Карта:" if spread_type == 1 else "Расклад карт:")
        for i, card in enumerate(cards, 1):
            orientation = (
                "прямое" if card.get("orientation") == "upright" else "перевернутое"
            )
            lines.append(f"{i}. {card['name']} ({orientation})")

    lines.append("")
    if question:
        if spread_type == 3 and len(cards) == 3:
            lines.append(
                "СВЯЖИ КАЖДУЮ КАРТУ С ВОПРОСОМ ПОЛЬЗОВАТЕЛЯ. "
                "Не просто опиши значение карты — объясни, как именно эта карта "
                "в этой позиции отвечает на его ситуацию. "
                "card_meaning: напиши три строки, по одной на каждую позицию, "
                "где каждая строка привязана к вопросу."
            )
        else:
            lines.append(
                "СВЯЖИ КАРТУ С ВОПРОСОМ ПОЛЬЗОВАТЕЛЯ. "
                "Не просто опиши значение — объясни, что эта карта значит "
                "именно для его ситуации."
            )
    else:
        if spread_type == 3 and len(cards) == 3:
            lines.append("Дай толкование этого расклада по позициям.")
        else:
            lines.append("Дай толкование этой карты.")
    lines.append("")
    lines.append(
        "ВАЖНО: Ответ должен быть ТОЛЬКО в формате JSON, без markdown, без дополнительного текста. "
        'Формат: {"intro": "вступительная фраза", '
        '"short_answer": "2-3 предложения", '
        '"card_meaning": ["Название карты: значение, привязанное к вопросу"], '
        '"advice": "совет"}'
    )

    return "\n".join(lines)
