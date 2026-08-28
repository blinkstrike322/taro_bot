from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

# ── Provider configs ──────────────────────────────────────────────
# Each entry: (model_id, base_url, api_key, label_for_logs)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"

def _zen_key() -> str | None:
    return settings.OPENCODE_ZEN_KEY or None

# Primary — DeepSeek Flash via OpenCode Zen
PRIMARY_MODEL = "deepseek-v4-flash-free"

# Zen free-tier fallbacks (in order)
ZEN_FALLBACKS = [
    "deepseek-v4-flash-free",
    "nemotron-3-ultra-free",
    "north-mini-code-free",
    "mimo-v2.5-free",
]

# OpenRouter fallbacks (kept as last resort)
OPENROUTER_FALLBACKS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "openrouter/free",
]


def _build_provider_list() -> list[tuple[str, str, str | None, str]]:
    """Build ordered list of (model, base_url, api_key, label)."""
    providers: list[tuple[str, str, str | None, str]] = []

    # 1. Zen primary
    key = _zen_key()
    if key:
        providers.append((PRIMARY_MODEL, ZEN_URL, key, "zen"))

    # 2. Zen fallbacks
    if key:
        for m in ZEN_FALLBACKS:
            if m != PRIMARY_MODEL:
                providers.append((m, ZEN_URL, key, "zen"))

    # 3. OpenRouter fallbacks
    or_key = settings.OPENROUTER_API_KEY
    if or_key:
        for m in OPENROUTER_FALLBACKS:
            providers.append((m, OPENROUTER_URL, or_key, "or"))

    return providers


def _get_primary_provider() -> tuple[str, str, str | None, str] | None:
    key = _zen_key()
    if key:
        return (PRIMARY_MODEL, ZEN_URL, key, "zen")
    or_key = settings.OPENROUTER_API_KEY
    if or_key:
        return (OPENROUTER_FALLBACKS[0], OPENROUTER_URL, or_key, "or")
    return None


EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f926-\U0001f937"
    "\U00010000-\U0010ffff"
    "\u2640-\u2642"
    "\u2600-\u2B55"
    "\u200d"
    "\u23cf"
    "\u23e9"
    "\u231a"
    "\ufe0f"
    "\u3030"
    "]+",
    flags=re.UNICODE,
)


def strip_emojis(text: str) -> str:
    return EMOJI_PATTERN.sub("", text)


async def call_llm(
    messages: list[dict],
    model: str,
    base_url: str,
    api_key: str,
    max_tokens: int = 2000,
) -> str:
    """Call a single LLM endpoint and return the text content.

    Handles reasoning models that return content in ``reasoning_content``
    when the visible ``content`` field is empty.
    """
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.8,
            },
        )
        response.raise_for_status()
        data = response.json()
        choice = data["choices"][0]
        msg = choice["message"]

        # DeepSeek-style reasoning: content may be in reasoning_content
        content = msg.get("content")
        if content and content.strip():
            return content

        # Some reasoning models return content in reasoning fields
        reasoning = (
            msg.get("reasoning_content")
            or msg.get("reasoning")
            or ""
        )
        if reasoning:
            logger.warning(
                "Model %s returned empty content — using reasoning as fallback",
                model,
            )
            return reasoning

        raise ValueError(f"Model {model} returned no content or reasoning")


async def call_llm_with_fallback(
    messages: list[dict],
    max_tokens: int = 2000,
) -> str:
    last_error: Exception | None = None
    provider_list = _build_provider_list()

    if not provider_list:
        raise RuntimeError("No LLM providers configured — set OPENCODE_ZEN_KEY or OPENROUTER_API_KEY")

    logger.info(
        "Attempting LLM call with %d provider(s) total",
        len(provider_list),
    )

    for model, base_url, api_key, label in provider_list:
        for attempt in range(3):
            try:
                result = await call_llm(
                    messages, model, base_url, api_key,
                    max_tokens=max_tokens,
                )
                logger.info(
                    "OK: %s — %s (%d chars)",
                    label, model, len(result),
                )
                return result
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429 and attempt < 2:
                    delay = (attempt + 1) * 2
                    logger.warning(
                        "%s — %s rate limited (429), retry %d/3 in %ds",
                        label, model, attempt + 1, delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                last_error = e
                logger.warning("%s — %s failed: %s", label, model, e)
                break
            except Exception as e:
                last_error = e
                logger.warning("%s — %s failed: %s", label, model, e)
                break

    raise RuntimeError("All LLM models failed") from last_error


async def interpret_reading(
    question: Optional[str],
    cards: list[dict],
    character_id: str = "shadow_walker",
    spread_type: int = 1,
) -> dict:
    from core.prompts import get_system_prompt, build_reading_prompt

    system_prompt = get_system_prompt(character_id)
    user_prompt = build_reading_prompt(cards, question, character_id, spread_type)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Reasoning models need extra token budget
    is_reasoning = _zen_key() is not None
    token_base = 6000 if is_reasoning else 4000

    try:
        raw = await call_llm_with_fallback(messages, max_tokens=token_base)
        cleaned = strip_emojis(raw)
        if len(cleaned) != len(raw):
            logger.warning("Emojis detected and removed from LLM response")
        raw = cleaned
        parsed = parse_llm_response(raw)
        if parsed:
            return parsed
    except RuntimeError:
        logger.error("All LLM models failed, using fallback")

    return fallback_from_cards_db(cards, question, character_id)


def _parse_text_format(text: str) -> Optional[dict]:
    """Try to parse text-format LLM response in any field order."""
    result = {}

    field_pat = re.compile(
        r"^\s*(intro|short_answer|card_meaning|advice)\s*:\s*",
        re.MULTILINE | re.IGNORECASE,
    )

    parts = list(field_pat.finditer(text))
    if not parts:
        return None

    for i, m in enumerate(parts):
        field = m.group(1).lower()
        val_start = m.end()
        val_end = parts[i + 1].start() if i + 1 < len(parts) else len(text)
        value = text[val_start:val_end].strip()

        if field == "card_meaning":
            try:
                result[field] = json.loads(value)
            except (json.JSONDecodeError, ValueError):
                result[field] = [value]
        else:
            result[field] = value

    if "short_answer" in result:
        return result
    return None


def parse_llm_response(text: str) -> Optional[dict]:
    text = strip_emojis(text)

    # 1. Strip markdown code blocks if present
    text = re.sub(r'```(?:json)?\s*', '', text)
    text = text.strip()

    # 2. Try to extract first complete JSON object via brace matching
    brace_depth = 0
    json_start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if brace_depth == 0:
                json_start = i
            brace_depth += 1
        elif ch == '}':
            brace_depth -= 1
            if brace_depth == 0 and json_start >= 0:
                try:
                    return json.loads(text[json_start:i + 1])
                except json.JSONDecodeError:
                    json_start = -1

    # 3. Fallback: regex JSON
    match = re.search(r"\{(?:[^{}]|\{[^{}]*\})*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # 4. Fallback: try text format
    parsed = _parse_text_format(text)
    if parsed:
        return parsed

    return {
        "intro": "Карты готовы поведать свою историю...",
        "short_answer": text.strip(),
        "card_meaning": [],
        "advice": "",
    }


def fallback_from_cards_db(
    cards: list[dict],
    question: str | None = None,
    character_id: str = "shadow_walker",
) -> dict:
    from core.tarot import load_cards

    all_cards = load_cards()
    cards_by_name = {c["name"]: c for c in all_cards}

    character_intros = {
        "shadow_walker": "Тени сгущаются над древними символами...",
        "ruin_keeper": "Пыль веков оседает на камнях судьбы...",
        "spark_of_chaos": "Искры истины пробиваются сквозь пустоту!",
    }
    character_voices = {
        "shadow_walker": "Странница Теней",
        "ruin_keeper": "Хранитель Руин",
        "spark_of_chaos": "Искра Хаоса",
    }

    meanings = []
    for i, card in enumerate(cards):
        name = card.get("name", "")
        orientation = card.get("orientation", "upright")
        card_data = cards_by_name.get(name, {})
        meaning = card_data.get(orientation, card_data.get("upright", "—"))

        prefix = ""
        if len(cards) == 3:
            positions = ["Прошлое", "Настоящее", "Будущее"]
            prefix = f"[{positions[i]}] "
        elif len(cards) == 1:
            prefix = ""

        meanings.append(f"{prefix}{name}: {meaning}")

    intro = character_intros.get(character_id, "Карты раскрывают свои тайны...")
    voice = character_voices.get(character_id, "Проводник")

    if question:
        short_answer = (
            f"{voice} отмечает: в контексте твоего вопроса — "
            f"{question[:100]}... Карты указывают на скрытые связи."
        )
    else:
        short_answer = f"{voice} видит в раскладе важный узор судьбы."

    advice_templates = {
        "shadow_walker": (
            "Прислушайся к шёпоту теней — они указывают путь, "
            "даже если ты его не видишь."
        ),
        "ruin_keeper": (
            "Не торопись. Древние знаки требуют осмысления. "
            "Вернись к раскладу на рассвете."
        ),
        "spark_of_chaos": (
            "Действуй! Карты лишь подтверждают то, "
            "что ты уже знаешь внутри себя."
        ),
    }
    advice = advice_templates.get(
        character_id,
        "Обдумай значение карт в контексте своего вопроса.",
    )

    return {
        "intro": intro,
        "short_answer": short_answer,
        "card_meaning": meanings,
        "advice": advice,
    }
