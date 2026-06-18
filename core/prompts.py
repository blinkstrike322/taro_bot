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
                "У тебя 3 карты в позициях Прошлое, Настоящее, Будущее. "
                "Для КАЖДОЙ карты объясни: "
                "(1) базовое значение карты, "
                "(2) как оно связано с её позицией (прошлое/настоящее/будущее), "
                "(3) что конкретно это значит в контексте вопроса пользователя. "
                "Не пиши общие фразы — каждый элемент card_meaning должен быть "
                "привязан и к позиции, и к вопросу."
            )
        else:
            lines.append(
                "СВЯЖИ КАРТУ С ВОПРОСОМ ПОЛЬЗОВАТЕЛЯ. "
                "Не просто опиши значение — объясни, что эта карта значит "
                "именно для его ситуации."
            )
    else:
        if spread_type == 3 and len(cards) == 3:
            lines.append(
                "Дай живое, связное толкование всех трёх карт как единой истории. "
                "Не перечисляй карты по шаблону 'в прошлом... в настоящем... в будущем...' — "
                "раскажи, как прошлое перетекает в настоящее, а из настоящего рождается будущее. "
                "Называй карты по имени органично внутри текста. Пиши минимум 5-7 предложений."
            )
        else:
            lines.append("Дай толкование этой карты.")
    lines.append("")
    if spread_type == 3 and len(cards) == 3:
        lines.append(
            'Формат JSON: {"intro": "вступительная фраза ко всему раскладу, задающая тон", '
            '"short_answer": "подробное связное толкование — минимум 5-7 предложений, '
            'все три карты переплетены в единую историю. Не используй маркированные списки, '
            'пиши цельными абзацами.", '
            '"card_meaning": "дополнительный разбор каждой карты по позициям — '
            'но тоже связным текстом, абзацами, а не списком. Можно с упоминанием позиций, '
            'но без жёстких префиксов [Прошлое]/[Настоящее]/[Будущее] в каждой строке", '
            '"advice": "конкретный совет на основе всей ситуации"}'
        )
    else:
        lines.append(
            'Формат JSON: {"intro": "вступительная фраза", '
            '"short_answer": "2-3 предложения", '
            '"card_meaning": ["Название карты: значение, привязанное к вопросу"], '
            '"advice": "совет"}'
        )

    return "\n".join(lines)
