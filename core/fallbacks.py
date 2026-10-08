# core/fallbacks.py — детерминированные фолбэки ask/pair/forecast.
# Тексты строятся из data/cards.json значений + голосовых полей characters.json.
# Порт локальных фолбэков SNAP3: src/app/api/ask/route.ts (localFallback /
# localPairFallback) и src/server/prompts.ts (localDayForecast); санкция
# ответа LLM — sanitize_llm_text.
from __future__ import annotations

import re

from core.llm import _extract_json, strip_emojis
from core.prompts import _card_meaning_text, _is_upright, _load_characters, pair_bridge_phrase

# ── Санитизация ответа LLM ────────────────────────────────────────
# Срез markdown-заборов (в т.ч. ```json) с сохранением содержимого,
# как в SNAP3 ask/route.ts: .replace(/```[a-z]*\s*([\s\S]*?)```/g, '$1').
_FENCE_BLOCK_RE = re.compile(r"```[a-z]*[ \t]*\n?([\s\S]*?)```", re.IGNORECASE)
# Незакрытый забор (модель обрезалась) — срезаем маркер целиком.
_FENCE_OPEN_RE = re.compile(r"```[a-z]*[ \t]*\n?", re.IGNORECASE)
_MULTI_NL_RE = re.compile(r"\n{3,}")

_DEFAULT_INTRO = "Карты раскрывают свои тайны..."
_DEFAULT_ADVICE = "Обдумай значение карт в контексте своего вопроса."


def sanitize_llm_text(text: str) -> str:
    """Чистка ответа LLM: срез ```-заборов (в т.ч. ```json), эмодзи, \\n{3,}, trim."""
    if not isinstance(text, str):
        return ""
    text = _FENCE_BLOCK_RE.sub(r"\1", text)
    text = _FENCE_OPEN_RE.sub("", text)
    text = strip_emojis(text)
    text = _MULTI_NL_RE.sub("\n\n", text)
    return text.strip()


# ── Голос проводника для фолбэков ────────────────────────────────
def _voice(character_id: str | None) -> dict:
    characters = _load_characters()
    return characters.get(character_id or "", characters.get("shadow_walker", {}))


# ── Фолбэк одиночного вопроса: ответ из значений карты голосом проводника ──
def local_followup_fallback(card: dict, ctx: dict) -> str:
    ch = _voice(ctx.get("character_id"))
    upright = _is_upright(card)
    base = _card_meaning_text(card)
    orient = (
        "в прямом положении — в полный голос"
        if upright
        else "перевёрнутая — энергия уходит внутрь, наружу выйдет не сразу"
    )
    return (
        f"{ch.get('fallback_intro', _DEFAULT_INTRO)} Про {card.get('name', '')}: "
        f"карта легла {orient}. "
        f"Смотри на неё через свой вопрос и через то, что уже сказали остальные: "
        f"{base.lower()}. "
        f"{ch.get('fallback_advice', _DEFAULT_ADVICE)}"
    )


# ── Фолбэк парного вопроса: формула связи из значений обеих карт ──
def local_pair_fallback(card_a: dict, card_b: dict, ctx: dict) -> str:
    ch = _voice(ctx.get("character_id"))
    ma = _card_meaning_text(card_a).lower()
    mb = _card_meaning_text(card_b).lower()
    bridge = pair_bridge_phrase(card_a, card_b)
    return (
        f"{ch.get('fallback_intro', _DEFAULT_INTRO)} "
        f"Пара «{card_a.get('name', '')}» и «{card_b.get('name', '')}»: {bridge}. "
        f"Первая держит {ma}. Вторая отвечает: {mb}. "
        f"Твой вопрос — про связь, и ответ лежит между ними: смотри, где одна "
        f"поддерживает, а где гасит. "
        f"{ch.get('fallback_advice', _DEFAULT_ADVICE)}"
    )


# ── Локальный фолбэк прогноза: из значений карты, без LLM ─────────
def local_day_forecast(card: dict) -> dict:
    upright = _is_upright(card)
    base = _card_meaning_text(card)
    # числа от номера аркана (порт SNAP3: seed = (number ?? 3) + (upright ? 0 : 5))
    number = card.get("number")
    seed = (number if number is not None else 3) + (0 if upright else 5)
    first_sentence = re.split(r"[.!?]", base)[0].strip().lower() if base else ""
    return {
        "лозунг": "день идёт тебе навстречу" if upright else "день просит медленного шага",
        "утро": (
            "Не разгоняйся сразу: дай карте дня минуту — она задаёт тон лучше будильника."
            if upright
            else "Утро начнётся с лёгкого тумана — это карта дня уходит внутрь, наружу выйдет позже."
        ),
        "день": (
            f"Главный сюжет дня: {first_sentence}. Смотри, где это проявится "
            f"в разговорах и мелких решениях."
        ),
        "вечер": (
            "Вечером сведи баланс: что из задуманного реально вышло — то и есть ответ карты."
            if upright
            else "К вечеру станет тише — и в этой тишине будет понятнее, что карта дня имела в виду."
        ),
        "фокус": "сделать один шаг вместо десяти",
        "тонус": max(2, min(10, seed)),
        "удача": max(2, min(10, 10 - seed + 2)),
        "общение": max(2, min(10, seed + (2 if upright else -1))),
        "глоток": (
            "запиши одну фразу изо всех разговоров дня — она окажется важнее остальных"
            if upright
            else "выйди на пять минут туда, где тихо, и не бери телефон"
        ),
    }


# ── Строгий парс JSON-прогноза ────────────────────────────────────
# Прогноз НЕ проходит через validate_interpretation (урок T7): только
# строгий экстрактор JSON + обязательные 9 ключей.
_FORECAST_STR_KEYS = ("лозунг", "утро", "день", "вечер", "фокус", "глоток")
_FORECAST_INT_KEYS = ("тонус", "удача", "общение")


def _clamp_scale(value: object) -> int:
    """Шкала 0–10 (порт SNAP3 clampScale): число → round+clamp, строка → int, мусор → 5."""
    if value is None or isinstance(value, bool):
        return 5
    if isinstance(value, (int, float)):
        n = value
    else:
        try:
            n = int(str(value).strip())
        except (ValueError, TypeError):
            return 5
    return max(0, min(10, round(n)))


def parse_forecast(raw: str) -> dict | None:
    """Санитизация ответа LLM в прогноз дня; None — если схема не сошлась.

    Все 9 ключей обязательны: строки непустые (эмодзи срезаются, кап 400
    символов как в SNAP3 strField), шкалы зажимаются 0–10.
    """
    data = _extract_json(raw)
    if not isinstance(data, dict):
        return None
    forecast: dict = {}
    for key in _FORECAST_STR_KEYS:
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            return None
        forecast[key] = strip_emojis(value).strip()[:400]
    for key in _FORECAST_INT_KEYS:
        forecast[key] = _clamp_scale(data.get(key))
    return forecast
