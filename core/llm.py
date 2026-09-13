from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from config import settings

logger = logging.getLogger(__name__)

# ── Provider configs ──────────────────────────────────────────────
# Each entry: (model_id, base_url, api_key, label_for_logs)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"

def _zen_key() -> str | None:
    return settings.OPENCODE_ZEN_KEY or None

# Primary — Ling via OpenCode Zen. Free tier требует заголовок x-session-id
# (см. call_llm), без него Zen возвращал 400 и тракт считался «мёртвым».
PRIMARY_MODEL = "ling-3.0-flash-fin-free"

# Zen free-tier fallbacks (in order)
ZEN_FALLBACKS = [
    "laguna-s-2.1-free",
    "hy3-free",
]

# OpenRouter fallbacks (kept as last resort)
OPENROUTER_FALLBACKS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "openrouter/free",
]

# ── Таймауты на один вызов провайдера ─────────────────────────────
# Вместо одного 180с-хэнга: connect должен быстро падать при недоступном
# хосте, read ограничивает тело ответа, общий потолок ~70с (connect+read)
# гораздо ниже требуемых ~90с на попытку.
LLM_TIMEOUT_CONNECT = 10.0
LLM_TIMEOUT_READ = 60.0
LLM_TIMEOUT_WRITE = 30.0
LLM_TIMEOUT_POOL = 10.0


def build_llm_timeout() -> httpx.Timeout:
    """Split per-phase timeout for a single LLM attempt."""
    return httpx.Timeout(
        connect=LLM_TIMEOUT_CONNECT,
        read=LLM_TIMEOUT_READ,
        write=LLM_TIMEOUT_WRITE,
        pool=LLM_TIMEOUT_POOL,
    )


# ── Circuit breaker per (label, model) ────────────────────────────
BREAKER_FAILURE_THRESHOLD = 3
BREAKER_COOLDOWN_BASE = 30.0   # секунд после 3-го подряд сбоя
BREAKER_COOLDOWN_MAX = 300.0   # backoff ×2 потолок


@dataclass(slots=True)
class _Breaker:
    consecutive_failures: int = 0
    cooled_until: float = 0.0


_breaker_state: dict[tuple[str, str], _Breaker] = {}


def _breaker(label: str, model: str) -> _Breaker:
    state = _breaker_state.get((label, model))
    if state is None:
        state = _Breaker()
        _breaker_state[(label, model)] = state
    return state


def _cooldown_seconds(failures: int) -> float:
    if failures < BREAKER_FAILURE_THRESHOLD:
        return 0.0
    return min(
        BREAKER_COOLDOWN_BASE * (2 ** (failures - BREAKER_FAILURE_THRESHOLD)),
        BREAKER_COOLDOWN_MAX,
    )


def _record_failure(label: str, model: str) -> None:
    state = _breaker(label, model)
    state.consecutive_failures += 1
    if state.consecutive_failures >= BREAKER_FAILURE_THRESHOLD:
        state.cooled_until = time.time() + _cooldown_seconds(state.consecutive_failures)


def _record_success(label: str, model: str) -> None:
    state = _breaker(label, model)
    state.consecutive_failures = 0
    state.cooled_until = 0.0


def _is_cooled_down(label: str, model: str) -> bool:
    state = _breaker_state.get((label, model))
    if state is None:
        return False
    if state.consecutive_failures < BREAKER_FAILURE_THRESHOLD:
        return False
    return state.cooled_until > time.time()


def _cooldown_end(label: str, model: str) -> float:
    state = _breaker_state.get((label, model))
    return state.cooled_until if state else 0.0


def _reset_breakers() -> None:
    """Clear all breaker state (админ-операция, используется тестами)."""
    _breaker_state.clear()


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


LATIN_WORD = re.compile(r"\b[A-Za-z]{3,}\b")


def _norm_name(value: object) -> str:
    """Нормализация имени карты для сопоставления с ответом модели."""
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def validate_interpretation(
    parsed: object,
    cards: list[dict],
    question: str | None,
    spread_type: object = 1,
) -> dict | None:
    """Схемная + семантическая проверка ответа LLM о фактических картах.

    LLM может вернуть красивый JSON, в котором перепутаны карты, реверсы или
    порядок позиций. Проверяем и чиним:
      • short_answer обязателен — без него ответ непригоден (None);
      • позиции → пересобираем по фактическим картам: имя карты из ответа
        находит реальную карту, её реверс и позиция берутся из бэкенда;
      • интро/совет при отсутствии заменяются на «».

    Возвращает починенный dict или None — тогда сработает фолбэк по БД карт.
    """
    if not isinstance(parsed, dict):
        return None

    short_answer = parsed.get("short_answer")
    if not isinstance(short_answer, str) or not short_answer.strip():
        return None

    repaired = dict(parsed)
    repaired.setdefault("intro", "")
    repaired.setdefault("advice", "")

    is_three = str(spread_type) == "3" and len(cards) == 3
    if is_three:
        positions_raw = repaired.get("позиции")
        if not isinstance(positions_raw, list) or len(positions_raw) != len(cards):
            return None

        from core.prompts import _positions_for_question
        backend_positions = _positions_for_question(question)

        # карта по имени → индекс в фактической раздаче
        actual_names = {_norm_name(c.get("name")): i for i, c in enumerate(cards)}
        claimed: list[int | None] = []
        for item in positions_raw:
            if not isinstance(item, dict):
                return None
            idx = actual_names.get(_norm_name(item.get("карта")))
            claimed.append(idx)

        # дубликаты/промахи → позиционный фолбэк (карта i из промпта)
        unique_claimed = {i for i in claimed if i is not None}
        if len(unique_claimed) != len(cards):
            claimed = list(range(len(cards)))

        rebuilt = []
        for slot, (item, claimed_idx) in enumerate(zip(positions_raw, claimed)):
            card_idx = claimed_idx if claimed_idx is not None else slot
            card = cards[card_idx]
            item_text = item.get("трактовка")
            if not isinstance(item_text, str) or not item_text.strip():
                return None
            rebuilt.append({
                "_card_idx": card_idx,
                "позиция": backend_positions[card_idx],
                "карта": card.get("name"),
                "реверс": bool(card.get("is_reversed")),
                "трактовка": item_text.strip(),
            })
        # порядок позиций = порядок фактической раздачи (как карты лежат на столе);
        # проза путешествует вместе с картой, которую описывает
        rebuilt.sort(key=lambda p: p["_card_idx"])
        for p in rebuilt:
            del p["_card_idx"]
        repaired["позиции"] = rebuilt

    elif len(cards) == 1:
        meaning = repaired.get("card_meaning")
        if isinstance(meaning, str) and not meaning.strip():
            repaired["card_meaning"] = []
        elif isinstance(meaning, list):
            repaired["card_meaning"] = [m for m in meaning if isinstance(m, str) and m.strip()]
        elif meaning is None:
            repaired["card_meaning"] = []
        elif not isinstance(meaning, (str, list)):
            repaired["card_meaning"] = []

    return repaired


def _iter_prose(value):
    """Yield every string leaf of the interpretation dict (prose, not keys)."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _iter_prose(v)
    elif isinstance(value, list):
        for v in value:
            yield from _iter_prose(v)


def _warn_latin_leak(text: str) -> None:
    """Лог о латинских словах в ответе модели — правило «только русский» в промпте."""
    latin = set(LATIN_WORD.findall(text))
    if latin:
        logger.warning(
            "Model leaked latin words: %s — тексты будут проверены",
            sorted(latin)[:5],
        )


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
    async with httpx.AsyncClient(timeout=build_llm_timeout()) as client:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        # Zen free tier требует непустой заголовок x-session-id, иначе
        # провайдер возвращает 400 MissingSessionID. OpenRouter его игнорирует.
        if base_url == ZEN_URL:
            headers["x-session-id"] = settings.OPENCODE_ZEN_SESSION or "taro-bot"
        response = await client.post(
            base_url,
            headers=headers,
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
        if _is_cooled_down(label, model):
            logger.warning(
                "Skipping %s — %s: circuit breaker open until %s",
                label, model,
                datetime.fromtimestamp(_cooldown_end(label, model), UTC).isoformat(),
            )
            continue

        for attempt in range(3):
            try:
                result = await call_llm(
                    messages, model, base_url, api_key,
                    max_tokens=max_tokens,
                )
                _record_success(label, model)
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
                _record_failure(label, model)
                last_error = e
                logger.warning("%s — %s failed: %s", label, model, e)
                break
            except Exception as e:
                _record_failure(label, model)
                last_error = e
                logger.warning("%s — %s failed: %s", label, model, e)
                break

    raise RuntimeError("All LLM models failed") from last_error


async def interpret_reading(
    question: str | None,
    cards: list[dict],
    character_id: str = "shadow_walker",
    spread_type: int = 1,
) -> dict:
    from core.prompts import build_reading_prompt, get_system_prompt

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
            # схемная + семантическая проверка против фактических карт
            parsed = validate_interpretation(parsed, cards, question, spread_type)
        if parsed:
            _warn_latin_leak(" ".join(_iter_prose(parsed)))
            return parsed
        logger.warning(
            "LLM response failed validation — falling back to cards DB. Raw head: %r",
            raw[:300],
        )
    except RuntimeError:
        logger.error("All LLM models failed, using fallback")

    return fallback_from_cards_db(cards, question, character_id)


def _parse_text_format(text: str) -> dict | None:
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


def parse_llm_response(text: str) -> dict | None:
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
    from core.prompts import _positions_for_question
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
    positions = _positions_for_question(question) if len(cards) == 3 else None
    for i, card in enumerate(cards):
        name = card.get("name", "")
        orientation = card.get("orientation", "upright")
        card_data = cards_by_name.get(name, {})
        meaning = card_data.get(orientation, card_data.get("upright", "—"))

        prefix = ""
        if positions:
            prefix = f"[{positions[i]}] "

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
