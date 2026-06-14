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
) -> str:
    """Construct the user-facing prompt for a tarot reading.

    Args:
        cards: List of card dicts, each with at least 'name' and
               'orientation' ('upright' or 'reversed').
        question: The user's question, or None if no question was asked.
        character_id: The character reading the cards (used for future
                      character-specific prompt tweaks).

    Returns:
        A formatted user prompt string.
    """
    lines: list[str] = []

    character_headers = {
        "shadow_walker": "Странница Теней читает твой расклад:",
        "ruin_keeper": "Хранитель Руин смотрит на карты:",
        "spark_of_chaos": "Искра Хаоса проглядывает расклад:",
    }
    header = character_headers.get(character_id, "Расклад карт:")
    lines.append(header)

    lines.append("Расклад карт:")
    for i, card in enumerate(cards, 1):
        orientation = (
            "прямое" if card.get("orientation") == "upright" else "перевернутое"
        )
        lines.append(f"{i}. {card['name']} ({orientation})")

    if question:
        lines.append("")
        lines.append(f"Вопрос: {question}")

    lines.append("")
    lines.append("Дай толкование этого расклада.")
    lines.append("")
    lines.append(
        "ВАЖНО: Ответ должен быть ТОЛЬКО в формате JSON, без markdown, без дополнительного текста. "
        'Формат: {"short_answer": "2-3 предложения", '
        '"card_meaning": ["Название карты: значение"], '
        '"advice": "совет"}'
    )

    return "\n".join(lines)
