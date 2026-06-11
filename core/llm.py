from __future__ import annotations

import json
import logging
import re
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

FALLBACK_MODELS = [
    "deepseek/deepseek-v4-flash:free",
    "deepseek/deepseek-chat-v3-0324:free",
    "deepseek/deepseek-r1:free",
]

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


async def call_llm(messages: list[dict], model: str, max_tokens: int = 1500) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.7,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def call_llm_with_fallback(messages: list[dict]) -> str:
    for model in FALLBACK_MODELS:
        try:
            return await call_llm(messages, model)
        except Exception as e:
            logger.warning(f"Model {model} failed: {e}")
    raise RuntimeError("All LLM models failed")


async def interpret_reading(
    question: Optional[str],
    cards: list[dict],
    character_id: str = "shadow_walker",
) -> dict:
    from core.prompts import get_system_prompt, build_reading_prompt

    system_prompt = get_system_prompt(character_id)
    user_prompt = build_reading_prompt(cards, question, character_id)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        raw = await call_llm_with_fallback(messages)
        cleaned = strip_emojis(raw)
        if len(cleaned) != len(raw):
            logger.warning("Emojis detected and removed from LLM response")
        raw = cleaned
        parsed = parse_llm_response(raw)
        if parsed:
            return parsed
    except RuntimeError:
        logger.error("All LLM models failed, using fallback")

    return fallback_from_cards_db(cards, character_id)


def parse_llm_response(text: str) -> Optional[dict]:
    text = strip_emojis(text)
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {
        "short_answer": text.strip(),
        "card_meaning": [],
        "advice": "",
    }


def fallback_from_cards_db(cards: list[dict], character_id: str = "shadow_walker") -> dict:
    from core.tarot import load_cards

    all_cards = load_cards()
    cards_by_name = {c["name"]: c for c in all_cards}

    meanings = []
    for card in cards:
        name = card.get("name", "")
        orientation = card.get("orientation", "upright")
        card_data = cards_by_name.get(name, {})
        meaning = card_data.get(orientation, card_data.get("upright", ""))
        meanings.append({"card": name, "meaning": meaning})

    tone_prefix = ""
    if character_id == "shadow_walker":
        tone_prefix = "Тени шепчут: "
    elif character_id == "ruin_keeper":
        tone_prefix = ""
    elif character_id == "spark_of_chaos":
        tone_prefix = "А вот и нет: "

    short_base = "Трактовка на основе базы карт."
    if character_id == "shadow_walker":
        short_answer = tone_prefix + short_base
    elif character_id == "ruin_keeper":
        short_answer = short_base
    elif character_id == "spark_of_chaos":
        short_answer = tone_prefix + short_base
    else:
        short_answer = short_base

    return {
        "short_answer": short_answer,
        "card_meaning": meanings,
        "advice": "Обдумай значение карт в контексте своего вопроса.",
    }
