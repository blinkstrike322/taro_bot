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
        character_id: The character reading the cards.
        spread_type: Number of cards in spread (1 or 3). For 3-card spreads,
                     includes positional labels (Прошлое/Настоящее/Будущее).

    Returns:
        A formatted user prompt string.
    """
    lines: list[str] = []

    # ── Question ──
    lines.append("Вопрос пользователя:")
    lines.append(question if question else "(спонтанный расклад — пользователь не задавал вопроса)")
    lines.append("")

    # ── Cards ──
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

    # ── Core instruction ──
    if spread_type == 3 and len(cards) == 3:
        if question:
            lines.append(
                "Толкуй эти три карты как единую историю судьбы. "
                "Прошлое перетекает в настоящее, а из настоящего рождается будущее. "
                "Каждую карту объясни через три слоя: "
                "(1) базовое значение, (2) связь с её позицией, (3) что это значит "
                "именно для ситуации пользователя (его вопрос, его жизнь)."
            )
        else:
            lines.append(
                "Толкуй эти три карты как единую историю. "
                "Прошлое перетекает в настоящее, из настоящего рождается будущее. "
                "Карты образуют сюжет — раскрой его."
            )
        lines.append("")
        lines.append(
            "ВАЖНО — ЧЕГО НЕ ДЕЛАТЬ:\n"
            "• НЕ начинай абзацы с «В прошлом...», «В настоящем...», «В будущем...»\n"
            "• НЕ пиши маркированные списки и нумерацию\n"
            "• НЕ используй шаблон «Эта карта указывает на...», «Значение этой карты...»\n"
            "• НЕ дублируй одно и то же в short_answer и card_meaning — "
            "они про разное: short_answer это связный пересказ всей истории, "
            "а card_meaning это детальный разбор по картам\n"
            "• НЕ ставь префиксы [Прошлое]/[Настоящее]/[Будущее] в тексте\n"
            "• Называй карты по имени органично внутри повествования"
        )
    else:
        if question:
            lines.append(
                "Свяжи эту карту с вопросом пользователя. "
                "Не просто опиши значение — объясни, что конкретно "
                "эта карта значит в его ситуации."
            )
        else:
            lines.append("Дай толкование этой карты.")

    lines.append("")

    # ── JSON format ──
    if spread_type == 3 and len(cards) == 3:
        lines.append(
            'ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n'
            '{\n'
            '  "intro": "вступительная фраза ко всему раскладу (1 предложение)",\n'
            '  "short_answer": "связное повествование из 5-7 предложений. '
            'Все три карты как единая история. Никаких списков. '
            'Без префиксов позиций.",\n'
            '  "card_meaning": "дополнительный разбор — три абзаца, '
            'по одному на каждую карту/позицию. '
            'В каждом абзаце: базовое значение, связь с позицией, '
            'контекст вопроса. Тоже связным текстом, абзацами, а не списком.",\n'
            '  "advice": "конкретный совет на основе всей ситуации (1-2 предложения)"\n'
            '}'
        )
    else:
        lines.append(
            'ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n'
            '{\n'
            '  "intro": "вступительная фраза (1 предложение)",\n'
            '  "short_answer": "2-4 предложения",\n'
            '  "card_meaning": ["Название карты: развёрнутое значение, привязанное к вопросу пользователя"],\n'
            '  "advice": "конкретный совет (1 предложение)"\n'
            '}'
        )

    return "\n".join(lines)
