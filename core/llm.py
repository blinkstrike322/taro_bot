from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from config import settings
from core.voice_gate import SCORE_PASS

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

# Температура по умолчанию (историческое поведение call_llm). Per-guide
# значение задаётся из characters.json и пробрасывается только при отличии.
DEFAULT_TEMPERATURE = 0.8


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


# ── Analytics: LLM hop of the *current* request (observe-only) ────────
# Per-request (task-local) snapshot of which provider/model won and whether a
# fallback was needed. Lives in a ContextVar so concurrent background whisper
# tasks each observe only their own request's outcome — a failed attempt
# reports None rather than a stale provider/model left by a previous, unrelated
# request. Does NOT change fallback order or circuit-breaker state; used only
# by the analytics layer to attach provider/model/fallback to spread events.
_EMPTY_HOP: dict[str, object] = {
    "provider": None,
    "model": None,
    "fallback_used": False,
}
_llm_hop: ContextVar[dict[str, object]] = ContextVar("llm_hop", default=_EMPTY_HOP)


def get_last_llm_hop() -> dict[str, object]:
    """Metadata of the most recent LLM hop (provider/model/fallback) for this request.

    Returns None provider/model when the current request never succeeded — it
    never leaks a previous request's successful hop.
    """
    return _llm_hop.get()


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


_DAILY_FIELDS = ("проявление", "на_что_смотреть", "траектория")


def _has_daily_field(repaired: dict) -> bool:
    """Есть ли в карте дня хотя бы одно непустое дневное поле."""
    for field in _DAILY_FIELDS:
        value = repaired.get(field)
        if isinstance(value, dict) and value:
            return True
        if isinstance(value, list) and len(value) > 0:
            return True
        if isinstance(value, str) and value.strip():
            return True
    return False


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
      • карта дня обязана нести хотя бы одно дневное поле
        (проявление / на_что_смотреть / траектория) — иначе None;
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
    is_daily = (not is_three) and not (question and str(question).strip())
    if is_daily and not _has_daily_field(repaired):
        return None

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
    temperature: float = 0.8,
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
                "temperature": temperature,
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


def _order_providers(
    providers: list[tuple[str, str, str | None, str]],
    preferred: list[str] | None,
) -> list[tuple[str, str, str | None, str]]:
    """Предпочитаемые модели — первыми, остальные как фолбэк."""
    if not preferred:
        return providers
    first = [p for p in providers if p[0] in preferred]
    return first + [p for p in providers if p[0] not in preferred]


async def call_llm_with_fallback(
    messages: list[dict],
    max_tokens: int = 2000,
    temperature: float = 0.8,
    preferred_models: list[str] | None = None,
) -> str:
    # Fresh per-request snapshot: if this request never succeeds, get_last_llm_hop
    # stays None instead of leaking a previous request's winning provider/model.
    _llm_hop.set(dict(_EMPTY_HOP))
    last_error: Exception | None = None
    provider_list = _order_providers(_build_provider_list(),
                                     preferred_models)

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
                if temperature == DEFAULT_TEMPERATURE:
                    result = await call_llm(
                        messages, model, base_url, api_key,
                        max_tokens=max_tokens,
                    )
                else:
                    result = await call_llm(
                        messages, model, base_url, api_key,
                        max_tokens=max_tokens,
                        temperature=temperature,
                    )
                _record_success(label, model)
                _primary = _get_primary_provider()
                _llm_hop.set({
                    "provider": label,
                    "model": model,
                    "fallback_used": not (
                        _primary is not None and model == _primary[0] and label == _primary[3]
                    ),
                })
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


# Попыток генерации с учётом voice-гейта: первая + починки. Латентность
# скрыта двухфазным шёпотом (карты уже на экране), поэтому отбор дешевле надежды.
# Но фронт ждёт шёпот не дольше ~180с (E1): общий бюджет попыток — 90с,
# дальше отдаём лучшее из готового, а не идеальное из никогда.
MAX_QUALITY_ATTEMPTS = 3
QUALITY_TIME_BUDGET_S = 90.0


def should_retry(attempt: int, score: int, elapsed_s: float) -> bool:
    """Можно ли идти на следующую попытку починки (счётчик + порог + бюджет)."""
    return (
        attempt < MAX_QUALITY_ATTEMPTS
        and score < SCORE_PASS
        and elapsed_s < QUALITY_TIME_BUDGET_S
    )


async def interpret_reading(
    question: str | None,
    cards: list[dict],
    character_id: str = "shadow_walker",
    spread_type: int = 1,
    avoid_texts: list[str] | None = None,
) -> dict:
    from core.prompts import _load_characters, build_reading_prompt, get_system_prompt
    from core.voice_gate import SCORE_PASS, build_repair_note, score_interpretation

    ch = _load_characters().get(character_id, {})
    temperature = ch.get("temperature", DEFAULT_TEMPERATURE)
    preferred_models = ch.get("prefer_models") or None
    system_prompt = get_system_prompt(character_id, avoid_texts=avoid_texts)
    user_prompt = build_reading_prompt(cards, question, character_id, spread_type)

    # Reasoning models need extra token budget
    is_reasoning = _zen_key() is not None
    token_base = 6000 if is_reasoning else 4000

    best: dict | None = None
    best_score = -1
    started = time.monotonic()

    try:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        for attempt in range(1, MAX_QUALITY_ATTEMPTS + 1):
            raw = await call_llm_with_fallback(
                messages, max_tokens=token_base,
                temperature=temperature, preferred_models=preferred_models)
            cleaned = strip_emojis(raw)
            if len(cleaned) != len(raw):
                logger.warning("Emojis detected and removed from LLM response")
            raw = cleaned
            parsed = parse_llm_response(raw)
            if parsed:
                # схемная + семантическая проверка против фактических карт
                parsed = validate_interpretation(parsed, cards, question, spread_type)
            if not parsed:
                logger.warning(
                    "LLM response failed validation (attempt %d) — raw head: %r",
                    attempt, raw[:300],
                )
                continue
            score, reasons = score_interpretation(parsed, character_id, avoid_texts)
            hop = get_last_llm_hop()
            logger.info(
                "voice score=%d reasons=%s attempt=%d guide=%s model=%s",
                score, reasons, attempt, character_id, hop.get("model"),
            )
            if score > best_score:
                best, best_score = parsed, score
            if score >= SCORE_PASS:
                _warn_latin_leak(" ".join(_iter_prose(parsed)))
                return parsed
            elapsed = time.monotonic() - started
            if not should_retry(attempt, score, elapsed):
                if elapsed >= QUALITY_TIME_BUDGET_S:
                    logger.warning(
                        "voice quality budget (%.0fs) exhausted, returning best score=%d",
                        elapsed, best_score,
                    )
                break
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt + "\n\n" + build_repair_note(reasons)},
            ]
        if best is not None:
            logger.warning(
                "voice gate never passed, returning best score=%d guide=%s",
                best_score, character_id,
            )
            _warn_latin_leak(" ".join(_iter_prose(best)))
            return best
        logger.warning("LLM response failed validation — falling back to cards DB.")
    except RuntimeError:
        logger.error("All LLM models failed, using fallback")

    return fallback_from_cards_db(cards, question, character_id, spread_type)


_TEXT_FIELD_ALIASES = {
    "ввод": "intro",
    "краткий_ответ": "short_answer",
    "краткий ответ": "short_answer",
    "совет": "advice",
    "значение": "card_meaning",
}

# кириллические ключи схемы + латинские + русские алиасы; длинные — первыми
_TEXT_FIELD_KEYS = (
    "на_что_смотреть", "связь_карт", "проявление", "траектория", "позиции",
    "краткий ответ", "краткий_ответ", "card_meaning", "short_answer",
    "значение", "совет", "ввод", "intro", "advice",
)


def _parse_text_format(text: str) -> dict | None:
    """Try to parse text-format LLM response in any field order."""
    result = {}

    field_pat = re.compile(
        r"^\s*("
        + "|".join(re.escape(k) for k in sorted(_TEXT_FIELD_KEYS, key=len, reverse=True))
        + r")\s*:\s*",
        re.MULTILINE | re.IGNORECASE,
    )

    parts = list(field_pat.finditer(text))
    if not parts:
        return None

    for i, m in enumerate(parts):
        raw = m.group(1).lower()
        field = _TEXT_FIELD_ALIASES.get(raw, raw)
        val_start = m.end()
        val_end = parts[i + 1].start() if i + 1 < len(parts) else len(text)
        value = text[val_start:val_end].strip()

        if field in ("card_meaning",):
            try:
                result[field] = json.loads(value)
            except (json.JSONDecodeError, ValueError):
                result[field] = [value]
        elif field in ("позиции", "траектория"):
            try:
                result[field] = json.loads(value)
            except (json.JSONDecodeError, ValueError):
                result[field] = value
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
    spread_type: object = 1,
) -> dict:
    from core.prompts import _positions_for_question, _spread_mode
    from core.tarot import load_cards

    all_cards = load_cards()
    cards_by_name = {c["name"]: c for c in all_cards}

    from core.prompts import _load_characters
    characters = _load_characters()
    ch = characters.get(character_id, characters.get("shadow_walker", {}))
    intro = ch.get("fallback_intro", "Карты раскрывают свои тайны...")
    voice = ch.get("name", "Проводник")
    advice = ch.get("fallback_advice", "Обдумай значение карт в контексте своего вопроса.")

    mode = _spread_mode(spread_type, question, len(cards))

    def _meaning(card: dict) -> str:
        name = card.get("name", "")
        orientation = card.get("orientation", "upright")
        card_data = cards_by_name.get(name, {})
        return card_data.get(orientation, card_data.get("upright", "—"))

    def _is_reversed(card: dict) -> bool:
        return bool(
            card.get("is_reversed", card.get("orientation") == "reversed")
        )

    if mode == "three":
        positions = _positions_for_question(question)
        position_items = []
        for i, card in enumerate(cards):
            name = card.get("name", "")
            meaning = _meaning(card)
            prefix = f"[{positions[i]}] "
            position_items.append(
                {
                    "позиция": positions[i],
                    "карта": name,
                    "реверс": _is_reversed(card),
                    "трактовка": f"{prefix}{name}: {meaning}",
                }
            )

        card_names = [c.get("name", "…") for c in cards]
        short_answer = (
            f"{voice} читает три карты как одну историю: «{card_names[0]}» "
            f"задаёт начало, «{card_names[1]}» раскрывает суть происходящего, "
            f"а «{card_names[2]}» показывает, к чему всё движется."
        )
        связь_карт = (
            f"{card_names[0]}, {card_names[1]} и {card_names[2]} образуют "
            f"единую линию: «{positions[0]}» подталкивает к «{positions[1]}», "
            f"и вместе они ведут к «{positions[2]}». Карты усиливают и "
            f"продолжают одна другую, складываясь в последовательный сюжет."
        )

        return {
            "intro": intro,
            "short_answer": short_answer,
            "позиции": position_items,
            "связь_карт": связь_карт,
            "advice": advice,
        }

    if mode == "daily":
        card = cards[0] if cards else {}
        name = card.get("name", "")
        meaning = _meaning(card)
        rev_note = "перевёрнутая" if _is_reversed(card) else "прямая"

        return {
            "intro": intro,
            "short_answer": (
                f"Карта дня — «{name}», {rev_note}. {meaning}"
            ),
            "проявление": (
                f"Сегодня энергия «{name}» может проявиться через обычные "
                f"вещи: разговор, сообщение, неожиданная мысль или сдвиг в "
                f"настроении. Ключ — {meaning}"
            ),
            "на_что_смотреть": (
                f"Обрати внимание на мелочи, связанные с «{name}»: "
                f"{rev_note} энергия может прятаться за внешне "
                f"незначительным событием. Не пропусти знак."
            ),
            "траектория": {
                "утро": f"Утро задаёт тон энергией «{name}» — {meaning[:80]}.",
                "день": (
                    f"Днём «{name}» проявится сильнее всего, "
                    f"особенно в {meaning[:80]}."
                ),
                "вечер": (
                    "К вечеру станет понятнее, как использовать "
                    "этот сигнал дня."
                ),
            },
            "advice": advice,
        }

    meanings = []
    for card in cards:
        name = card.get("name", "")
        meaning = _meaning(card)
        meanings.append(f"{name}: {meaning}")

    if question:
        short_answer = (
            f"{voice} отмечает: в контексте твоего вопроса — "
            f"{question[:100]}... Карты указывают на скрытые связи."
        )
    else:
        short_answer = f"{voice} видит в раскладе важный узор судьбы."

    return {
        "intro": intro,
        "short_answer": short_answer,
        "card_meaning": meanings,
        "advice": advice,
    }
