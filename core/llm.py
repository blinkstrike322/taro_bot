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

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"


def _zen_key() -> str | None:
    return settings.OPENCODE_ZEN_KEY or None


# Порядок Zen-моделей — по бенчмарку (scripts/benchmark_models.py, 2026-08):
# скорость+качество на реальных промптах раскладов и доп-вопросов.
# nemotron-3-ultra: ~15c / score 99 · muse-spark-1.2: ~24c / 99 (лучший текст)
# laguna-s-2.1: ~22c / 89 · mimo: быстрый, но рейт-лимиты ·
# deepseek: хорош, но регулярно «Model is unavailable» ·
# nemotron-3.5-lightning: медленный и ломает JSON расклада — последним.
# hy3 и x-preview-f исключены (500-е / обрывы соединения).
ZEN_MODEL_ORDER = [
    "nemotron-3-ultra-free",
    "muse-spark-1.2-contributor-free",
    "laguna-s-2.1-free",
    "mimo-v2.5-free",
    "deepseek-v4-flash-free",
    "nemotron-3.5-lightning-free",
]

# OpenRouter fallbacks (последний рубеж)
OPENROUTER_FALLBACKS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "openrouter/free",
]

# ── Скоростной контур: хеджированные попытки ──────────────────────
# Первая модель получает 12 секунд форы; если не успела — параллельно
# стартует следующая. Побеждает первый успешный ответ, остальные
# отменяются. Таймаут одной попытки 45 c (вместо 180 c + 3 ретрая,
# которые и давали «от 5 секунд до минуты»).
HEDGE_DELAY_S = 12.0
MAX_CONCURRENT_ATTEMPTS = 3
ATTEMPT_TIMEOUT_S = 45.0

# Кулдаун только что упавших моделей: 429/5xx/«unavailable»/таймаут —
# и модель на 5 минут выпадает из хедж-очереди, не тратит слот.
# Честный streak: модель остывает после 2 подряд неудач, а не одной —
# одиночный таймаут больше не выкидывает сильную модель из ротации.
COOLDOWN_SECONDS = 300.0
COOLDOWN_STREAK = 2
_cooldown_until: dict[str, float] = {}
_failure_streak: dict[str, int] = {}


def _register_failure(model: str) -> bool:
    """Учесть неудачу модели. True — если модель должна уйти в cooldown."""
    n = _failure_streak.get(model, 0) + 1
    _failure_streak[model] = n
    return n >= COOLDOWN_STREAK


def _register_success(model: str) -> None:
    _failure_streak.pop(model, None)


def _set_cooldown(model: str, why: str) -> None:
    loop = asyncio.get_running_loop()
    _cooldown_until[model] = loop.time() + COOLDOWN_SECONDS
    logger.info("Cooldown %s for %.0fs (%s)", model, COOLDOWN_SECONDS, why)


def _clear_cooldown(model: str) -> None:
    _cooldown_until.pop(model, None)


def _filter_cooldown(providers: list[tuple[str, str, str | None, str]]) -> list[tuple[str, str, str | None, str]]:
    """Убрать модели в кулдауне; если остыли все — вернуть полный список."""
    loop = asyncio.get_running_loop()
    now = loop.time()
    fresh = [p for p in providers if _cooldown_until.get(p[0], 0) < now]
    return fresh or providers


def _build_provider_list() -> list[tuple[str, str, str | None, str]]:
    """Build ordered list of (model, base_url, api_key, label)."""
    providers: list[tuple[str, str, str | None, str]] = []

    key = _zen_key()
    if key:
        for m in ZEN_MODEL_ORDER:
            providers.append((m, ZEN_URL, key, "zen"))

    or_key = settings.OPENROUTER_API_KEY
    if or_key:
        for m in OPENROUTER_FALLBACKS:
            providers.append((m, OPENROUTER_URL, or_key, "or"))

    return providers


# ── Shared HTTP client (connection reuse — one pool for all calls) ──

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(180.0, connect=15.0),
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=40,
                keepalive_expiry=60.0,
            ),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


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
    json_mode: bool = True,
) -> str:
    """Call a single LLM endpoint and return the text content.

    json_mode: пробуем response_format={"type":"json_object"} — часть моделей
    отвечает на него 400, тогда повторяем тот же запрос без json_mode.

    Handles reasoning models that return content in ``reasoning_content``
    when the visible ``content`` field is empty. Per-attempt timeout is
    tight (connect 8s / read 45s) — slow or hung models must not block
    the hedged pipeline.
    """
    client = _get_client()
    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.75,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async def _post(p: dict) -> httpx.Response:
        return await client.post(
            base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=p,
            timeout=httpx.Timeout(ATTEMPT_TIMEOUT_S, connect=8.0),
        )

    try:
        response = await _post(payload)
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        if json_mode and e.response.status_code == 400:
            logger.info("json_mode rejected by %s — retrying without it", model)
            payload.pop("response_format", None)
            response = await _post(payload)
            response.raise_for_status()
        else:
            raise
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
    json_mode: bool = True,
) -> str:
    """Hedged LLM call: first success wins, slow models don't block.

    Модель №1 получает HEDGE_DELAY_S форы; если за это время не ответила —
    параллельно стартует модель №2 (и так до MAX_CONCURRENT_ATTEMPTS).
    Первый успешный ответ возвращается, остальные попытки отменяются.
    429/5xx/таймаут просто скидывают попытку — вместо старых
    «3 ретрая × 180 секунд» на каждую модель.
    """
    provider_list = _filter_cooldown(_build_provider_list())

    if not provider_list:
        raise RuntimeError("No LLM providers configured — set OPENCODE_ZEN_KEY or OPENROUTER_API_KEY")

    logger.info("Hedged LLM call over %d provider(s)", len(provider_list))

    pending: set[asyncio.Task] = set()
    launched = 0
    errors: list[str] = []

    async def _attempt(model: str, base_url: str, api_key: str, label: str) -> str:
        t0 = asyncio.get_running_loop().time()
        try:
            result = await call_llm(
                messages, model, base_url, api_key,
                max_tokens=max_tokens, json_mode=json_mode,
            )
        except httpx.HTTPStatusError as e:
            # рейт-лимит / недоступна / серверная ошибка — модель остывает по streak
            if e.response.status_code in (429, 500, 502, 503, 504) or "unavailable" in e.response.text[:300].lower():
                if _register_failure(model):
                    _set_cooldown(model, f"HTTP {e.response.status_code}")
            raise
        except (httpx.TimeoutException, httpx.TransportError) as e:
            if _register_failure(model):
                _set_cooldown(model, type(e).__name__)
            raise
        dt = asyncio.get_running_loop().time() - t0
        logger.info("OK: %s — %s (%d chars, %.1fs)", label, model, len(result), dt)
        _clear_cooldown(model)
        _register_success(model)
        return result

    try:
        while True:
            # добираем попытки, пока есть провайдеры и слоты
            while (
                launched < len(provider_list)
                and len(pending) < MAX_CONCURRENT_ATTEMPTS
            ):
                model, base_url, api_key, label = provider_list[launched]
                launched += 1
                pending.add(asyncio.create_task(_attempt(model, base_url, api_key, label)))

            if not pending:
                break  # провайдеры кончились

            done, pending = await asyncio.wait(
                pending,
                timeout=HEDGE_DELAY_S,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                exc = task.exception()
                if exc is None:
                    return task.result()  # первый успех — побеждает
                errors.append(f"{type(exc).__name__}: {str(exc)[:120]}")
                logger.warning("Attempt failed (%d/%d): %s", launched, len(provider_list), errors[-1])
    finally:
        for task in pending:
            task.cancel()

    raise RuntimeError(
        "All LLM attempts failed; launched %d/%d: %s"
        % (launched, len(provider_list), " | ".join(errors[:4]))
    )


async def interpret_reading(
    question: Optional[str],
    cards: list[dict],
    character_id: str = "shadow_walker",
    spread_type: int | str = 1,
    avoid_texts: list[str] | None = None,
) -> dict:
    from core.llm_gate import validate_interpretation
    from core.moods import mood_of_day
    from core.prompts import get_system_prompt, build_reading_prompt

    system_prompt = get_system_prompt(
        character_id, mood=mood_of_day(character_id), avoid_texts=avoid_texts
    )
    user_prompt = build_reading_prompt(cards, question, character_id, spread_type)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Reasoning models need extra token budget
    is_reasoning = _zen_key() is not None
    token_base = 6000 if is_reasoning else 4000

    # До трёх заходов: каждый заход — хедж-вызов; ответ должен пройти
    # validation gate, иначе пробуем следующую модель. Так быстрые слабые
    # модели больше не крадут расклад у качественных.
    last_text = ""
    for attempt in range(3):
        try:
            raw = await call_llm_with_fallback(messages, max_tokens=token_base)
        except RuntimeError:
            logger.error("All LLM models failed (attempt %d/3)", attempt + 1)
            continue
        had_emoji = len(strip_emojis(raw)) != len(raw)
        cleaned = strip_emojis(raw)
        last_text = cleaned
        parsed = parse_llm_response(cleaned)
        ok, reason = validate_interpretation(parsed, cards, character_id, had_emoji=had_emoji)
        if ok:
            return parsed
        logger.warning(
            "Gate rejected output (attempt %d/3): %s — trying next model",
            attempt + 1, reason,
        )

    if last_text.strip():
        parsed = parse_llm_response(last_text)
        if isinstance(parsed.get("short_answer"), str) and parsed["short_answer"].strip():
            logger.warning("Gate exhausted — returning best-effort parse")
            return parsed

    return fallback_from_cards_db(cards, question, character_id)


async def interpret_followup(
    character_id: str,
    reading: dict,
    history: list[dict],
    question: str,
    avoid_texts: list[str] | None = None,
) -> str:
    """Answer a follow-up question about an existing reading, in character."""
    from core.prompts import build_followup_messages

    messages = build_followup_messages(
        character_id, reading, history, question, avoid_texts=avoid_texts
    )

    is_reasoning = _zen_key() is not None
    token_base = 4500 if is_reasoning else 3000

    # До трёх заходов с gate — как в interpret_reading
    last_text = ""
    for attempt in range(3):
        try:
            raw = await call_llm_with_fallback(messages, max_tokens=token_base)
        except RuntimeError:
            logger.error("All LLM models failed for followup (attempt %d/3)", attempt + 1)
            continue
        had_emoji = len(strip_emojis(raw)) != len(raw)
        cleaned = strip_emojis(raw)
        parsed = parse_llm_response(cleaned)
        candidate = ""
        for key in ("answer", "short_answer", "intro"):
            v = parsed.get(key) if parsed else None
            if isinstance(v, str) and v.strip():
                candidate = v.strip()
                break
        if not candidate and cleaned.strip():
            candidate = cleaned.strip()
        last_text = candidate
        ok, reason = validate_followup(candidate, character_id, had_emoji=had_emoji)
        if ok:
            return candidate
        logger.warning("Followup gate rejected (attempt %d/3): %s", attempt + 1, reason)

    if last_text:
        return last_text
    return _fallback_followup(reading, question, character_id)


def _fallback_followup(reading: dict, question: str, character_id: str) -> str:
    from core.prompts import get_character

    ch = get_character(character_id)
    name = ch.get("name", "Проводница")
    cards = reading.get("cards") or []
    card_names = ", ".join(c.get("name", "?") for c in cards[:3])
    return (
        f"{name} на миг замерла у своей чаши... Карты этого расклада ({card_names}) "
        "уже сказали главное. Спроси ещё раз чуть позже — я отвечу подробнее."
    )


def _parse_text_format(text: str) -> Optional[dict]:
    """Try to parse text-format LLM response in any field order."""
    result = {}

    field_pat = re.compile(
        r"^\s*(intro|short_answer|card_meaning|advice|answer)\s*:\s*",
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

    if "short_answer" in result or "answer" in result:
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
    from core.prompts import DAILY_POSITIONS, THREE_POSITIONS

    all_cards = load_cards()
    cards_by_name = {c["name"]: c for c in all_cards}

    character_intros = {
        "shadow_walker": "Луна вышла из-за туч — слушай.",
        "ruin_keeper": "Очаг потрескивает. Слушай, что видно при его свете.",
        "spark_of_chaos": "Искра! Ну наконец-то что-то интересное.",
    }
    character_voices = {
        "shadow_walker": "Селена",
        "ruin_keeper": "Веста",
        "spark_of_chaos": "Лилит",
    }

    meanings = []
    for i, card in enumerate(cards):
        name = card.get("name", "")
        orientation = card.get("orientation", "upright")
        card_data = cards_by_name.get(name, {})
        meaning = card_data.get(orientation, card_data.get("upright", "—"))

        prefix = ""
        if len(cards) == 3:
            positions = DAILY_POSITIONS if len(cards) == 3 else THREE_POSITIONS
            prefix = f"[{positions[i] if i < len(positions) else i + 1}] "

        meanings.append(f"{prefix}{name}: {meaning}")

    intro = character_intros.get(character_id, "Карты раскрывают свои тайны...")
    voice = character_voices.get(character_id, "Проводница")

    if question:
        short_answer = (
            f"{voice} смотрит на твой вопрос — «{question[:100]}» — и видит в картах "
            "узор, который говорит больше слов."
        )
    else:
        short_answer = f"{voice} видит в этом раскладе важный узор твоего дня."

    advice_templates = {
        "shadow_walker": (
            "Сегодня разреши воде нести себя: одна пауза тишины — и станет ясно."
        ),
        "ruin_keeper": (
            "Сделай одно настоящее дело. Маленькое, но руками."
        ),
        "spark_of_chaos": (
            "Хватит мерить чужие жизни. Один маленький дерзкий шаг — сегодня."
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
