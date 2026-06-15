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

    character_headers = {
        "shadow_walker": "Странница Теней читает твой расклад.",
        "ruin_keeper": "Хранитель Руин смотрит на карты.",
        "spark_of_chaos": "Искра Хаоса проглядывает расклад.",
    }
    header = character_headers.get(character_id, "Расклад карт.")
    lines.append(header)
    lines.append("")

    # Character-specific voice instruction for stronger character influence
    character_instruction = {
        "shadow_walker": (
            "Говори загадочно, поэтично, словно открываешь тайну, "
            "которую никто до этого не видел."
        ),
        "ruin_keeper": (
            "Говори весомо, мудро, как древний страж, "
            "видевший тысячи судеб."
        ),
        "spark_of_chaos": (
            "Говори дерзко, энергично, с неожиданными поворотами — "
            "как трюкстер, играющий с судьбой."
        ),
    }
    char_style = character_instruction.get(character_id, "")
    if char_style:
        lines.append(char_style)
        lines.append("")

    if question:
        lines.append(f"Вопрос пользователя: {question}")
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
            lines.append("Для каждой позиции объясни, как эта карта отвечает на вопрос пользователя. Свяжи значение карты с вопросом — это самое важное.")
        else:
            lines.append("Объясни, как эта карта отвечает на вопрос пользователя.")
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
        '"card_meaning": ["Название карты: значение"], '
        '"advice": "совет"}'
    )

    return "\n".join(lines)
