"""Validation gate for LLM responses.

Бесплатные модели отвечают неровно: gate отсеивает слабые ответы
(короткие, без имён карт, со штампами, с эмодзи) и отправляет
пайплайн на retry к следующей модели.
"""
from __future__ import annotations

from core.prompts import GLOBAL_FORBIDDEN, get_character

MIN_SHORT_ANSWER_LEN = 200
MIN_FIELD_LEN = 10
MIN_FOLLOWUP_LEN = 40


def _forbidden_for(character_id: str) -> list[str]:
    try:
        ch = get_character(character_id)
    except KeyError:
        return list(GLOBAL_FORBIDDEN)
    return list(ch.get("forbidden") or []) + GLOBAL_FORBIDDEN


def _card_coverage(text: str, cards: list[dict]) -> float:
    """Доля выпавших карт, чьи имена упомянуты в тексте."""
    if not cards:
        return 1.0
    lowered = text.lower()
    hits = sum(1 for c in cards if c.get("name", "").lower() in lowered)
    return hits / len(cards)


def _has_forbidden(text: str, character_id: str) -> str | None:
    lowered = text.lower()
    for phrase in _forbidden_for(character_id):
        if phrase.lower() in lowered:
            return phrase
    return None


def validate_interpretation(
    parsed: dict,
    cards: list[dict],
    character_id: str,
    had_emoji: bool = False,
) -> tuple[bool, str]:
    """Проверить толкование. Вернуть (ok, reason)."""
    if had_emoji:
        return False, "emoji in raw response"

    short = parsed.get("short_answer")
    if not isinstance(short, str) or len(short.strip()) < MIN_SHORT_ANSWER_LEN:
        return False, "short_answer too short"

    intro = parsed.get("intro")
    if not isinstance(intro, str) or len(intro.strip()) < MIN_FIELD_LEN:
        return False, "intro missing or short"

    advice = parsed.get("advice")
    if not isinstance(advice, str) or len(advice.strip()) < MIN_FIELD_LEN:
        return False, "advice missing or short"

    combined = f"{intro} {short} {advice}"
    phrase = _has_forbidden(combined, character_id)
    if phrase:
        return False, f"forbidden phrase: {phrase}"

    coverage = _card_coverage(combined, cards)
    if coverage < 1.0:
        return False, f"card name coverage {coverage:.0%}"

    return True, "ok"


def validate_followup(
    answer: str,
    character_id: str,
    had_emoji: bool = False,
) -> tuple[bool, str]:
    """Проверить ответ доп-вопроса. Вернуть (ok, reason)."""
    if had_emoji:
        return False, "emoji in raw response"
    if not isinstance(answer, str) or len(answer.strip()) < MIN_FOLLOWUP_LEN:
        return False, "answer too short"
    phrase = _has_forbidden(answer, character_id)
    if phrase:
        return False, f"forbidden phrase: {phrase}"
    return True, "ok"
