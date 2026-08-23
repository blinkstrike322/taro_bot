# LLM Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стабильное качество раскладов на бесплатных LLM: validation gate + retry вместо «кто первый ответил», честный кулдаун, JSON mode, few-shot голоса проводниц и детерминированное «настроение дня».

**Architecture:** Новый модуль `core/llm_gate.py` (валидация ответа) и `core/moods.py` (настроение дня). `core/llm.py` — gate-цикл в `interpret_reading`/`interpret_followup`, cooldown по streak, `response_format: json_object` с откатом. `app.py` — поле `mood` в ответе `/api/spread`.

**Tech Stack:** Python 3.12+, aiohttp, pytest + pytest-asyncio (уже в проекте).

## Global Constraints

- Только бесплатные модели (Zen / OpenRouter free) — список `ZEN_MODEL_ORDER` не менять.
- Средняя латентность не должна вырасти; worst-case +15с допустим (gate retry).
- Эмодзи по-прежнему вырезаются (`strip_emojis`), но наличие = провал gate.
- Все новые строки кода и логов — как в существующем стиле (`logger.info/warning`).
- Тесты: `pytest tests/ -v` зелёный до и после каждого коммита.
- Рабочая директория всех команд: корень репозитория `taro_bot/`.

---

### Task 1: Validation gate — `core/llm_gate.py`

**Files:**
- Create: `core/llm_gate.py`
- Create: `tests/test_llm_gate.py`

**Interfaces:**
- Produces: `validate_interpretation(parsed: dict, cards: list[dict], character_id: str, had_emoji: bool = False) -> tuple[bool, str]` и `validate_followup(answer: str, character_id: str, had_emoji: bool = False) -> tuple[bool, str]`. Используются Task 2.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_llm_gate.py
import pytest

from core.llm_gate import validate_interpretation, validate_followup
from core.prompts import GLOBAL_FORBIDDEN


CARDS = [
    {"name": "The Moon", "orientation": "upright"},
    {"name": "The Star", "orientation": "upright"},
    {"name": "The Sun", "orientation": "upright"},
]

GOOD = {
    "intro": "Ты несёшь вопрос, как фонарь в тумане.",
    "short_answer": (
        "Луна в раскладе говорит о паузе, которая тебе нужна. Звезда рядом — "
        "значит, за этой паузой уже ждёт надежда, которую ты почти не пускаешь "
        "к себе. Солнце в конце истории обещает ясность: не сейчас, но скоро, "
        "и она придёт не извне, а из твоего решения перестать торопить себя."
    ),
    "card_meaning": ["The Moon: пауза.", "The Star: надежда.", "The Sun: ясность."],
    "advice": "Сегодня позволь себе не решать ничего окончательного.",
}


def test_valid_interpretation_passes():
    ok, reason = validate_interpretation(GOOD, CARDS, "shadow_walker")
    assert ok, reason


def test_short_answer_too_short_fails():
    bad = {**GOOD, "short_answer": "Карты говорят всё хорошо."}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "short" in reason


def test_missing_intro_fails():
    bad = {**GOOD, "intro": ""}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "intro" in reason


def test_missing_advice_fails():
    bad = {**GOOD, "advice": None}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "advice" in reason


def test_emoji_flag_fails():
    ok, reason = validate_interpretation(GOOD, CARDS, "shadow_walker", had_emoji=True)
    assert not ok and "emoji" in reason


def test_card_name_coverage_required():
    bad = {**GOOD, "short_answer": GOOD["short_answer"].replace("Луна", "Тень").replace("Звезда", "Искра").replace("Солнце", "Свет")}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "coverage" in reason


def test_character_forbidden_phrase_fails():
    bad = {**GOOD, "advice": "Луна шепчет — доверяй."}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "forbidden" in reason


def test_global_forbidden_phrase_fails():
    bad = {**GOOD, "advice": "Стоит обратить внимание на то, что день новый."}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "forbidden" in reason


def test_followup_ok():
    ok, reason = validate_followup("Вода в чаше ещё не успокоилась — дай ей ночь, и спроси себя утром снова.", "shadow_walker")
    assert ok, reason


def test_followup_too_short_fails():
    ok, reason = validate_followup("Хорошо.", "shadow_walker")
    assert not ok and "short" in reason
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_gate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.llm_gate'`

- [ ] **Step 3: Write implementation**

```python
# core/llm_gate.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_llm_gate.py -v`
Expected: PASS (11 passed)

- [ ] **Step 5: Commit**

```bash
git add core/llm_gate.py tests/test_llm_gate.py
git commit -m "feat(llm): validation gate for readings and followups"
```

---

### Task 2: Gate в пайплайне + JSON mode + cooldown streak + temperature

**Files:**
- Modify: `core/llm.py` (весь файл затрагивается точечно: константы, `call_llm`, `_attempt`, `interpret_reading`, `interpret_followup`)
- Modify: `tests/test_quota.py` — нет; Create: `tests/test_llm_pipeline.py`

**Interfaces:**
- Consumes: `validate_interpretation`, `validate_followup` из Task 1.
- Produces: `call_llm(messages, model, base_url, api_key, max_tokens=2000, json_mode=True)`; поведение `interpret_reading`/`interpret_followup` без изменения сигнатур.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_llm_pipeline.py
"""Unit-тесты чистых функций пайплайна (без сети)."""
from core.llm import _failure_streak, _register_failure, _register_success, _should_cool_down


def test_cooldown_after_two_consecutive_failures():
    _failure_streak.pop("m1", None)
    _should_cool_down  # noqa: B018 - existence check
    assert _register_failure("m1") is False  # первая неудача — ещё не cooldown
    assert _register_failure("m1") is True   # вторая подряд — cooldown
    assert _register_failure("m1") is True   # третья — по-прежнему cooldown


def test_success_resets_streak():
    _failure_streak.pop("m2", None)
    _register_failure("m2")
    _register_success("m2")
    assert _register_failure("m2") is False  # streak сброшен — снова нужна 2-я
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_pipeline.py -v`
Expected: FAIL — `ImportError: cannot import name '_register_failure'`

- [ ] **Step 3: Implement cooldown streak в `core/llm.py`**

Заменить блок кулдауна (сейчас `_cooldown_until` + `_set_cooldown` вызывается на каждую неудачу) на streak-версию. Изменения в `core/llm.py`:

```python
# ── после COOLDOWN_SECONDS ──
COOLDOWN_SECONDS = 300.0
COOLDOWN_STREAK = 2          # неудач подряд, прежде чем модель остынет
_cooldown_until: dict[str, float] = {}
_failure_streak: dict[str, int] = {}


def _register_failure(model: str) -> bool:
    """Учесть неудачу модели. True — если модель должна уйти в cooldown."""
    n = _failure_streak.get(model, 0) + 1
    _failure_streak[model] = n
    return n >= COOLDOWN_STREAK


def _register_success(model: str) -> None:
    _failure_streak.pop(model, None)
```

В `_attempt` заменить вызовы `_set_cooldown(...)` на streak-логику:

```python
    async def _attempt(model: str, base_url: str, api_key: str, label: str) -> str:
        t0 = asyncio.get_running_loop().time()
        try:
            result = await call_llm(messages, model, base_url, api_key,
                                    max_tokens=max_tokens, json_mode=json_mode)
        except httpx.HTTPStatusError as e:
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
```

- [ ] **Step 4: JSON mode с откатом в `call_llm`**

```python
async def call_llm(
    messages: list[dict],
    model: str,
    base_url: str,
    api_key: str,
    max_tokens: int = 2000,
    json_mode: bool = True,
) -> str:
    """Call a single LLM endpoint and return the text content.

    json_mode: пробуем response_format={"type":"json_object"}; часть моделей
    отвечает 400 — тогда повторяем тот же запрос без json_mode.
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

    async def _post(p: dict):
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

    content = msg.get("content")
    if content and content.strip():
        return content

    reasoning = msg.get("reasoning_content") or msg.get("reasoning") or ""
    if reasoning:
        logger.warning("Model %s returned empty content — using reasoning as fallback", model)
        return reasoning

    raise ValueError(f"Model {model} returned no content or reasoning")
```

- [ ] **Step 5: Gate-цикл в `interpret_reading`**

```python
async def interpret_reading(
    question: Optional[str],
    cards: list[dict],
    character_id: str = "shadow_walker",
    spread_type: int | str = 1,
    avoid_texts: list[str] | None = None,
) -> dict:
    from core.llm_gate import validate_interpretation
    from core.prompts import get_system_prompt, build_reading_prompt

    system_prompt = get_system_prompt(character_id, avoid_texts=avoid_texts)
    user_prompt = build_reading_prompt(cards, question, character_id, spread_type)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    is_reasoning = _zen_key() is not None
    token_base = 6000 if is_reasoning else 4000

    # До трёх заходов: каждый заход — хедж-вызов; ответ должен пройти gate,
    # иначе пробуем следующую модель.
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
            "Gate rejected output (attempt %d/3): %s — trying next model", attempt + 1, reason
        )

    if last_text.strip():
        # Все модели отсеяны gate — отдаём лучший имеющийся разбор, не пустоту.
        parsed = parse_llm_response(last_text)
        if isinstance(parsed.get("short_answer"), str) and parsed["short_answer"].strip():
            logger.warning("Gate exhausted — returning best-effort parse")
            return parsed

    return fallback_from_cards_db(cards, question, character_id)
```

- [ ] **Step 6: Gate-цикл в `interpret_followup`**

```python
async def interpret_followup(
    character_id: str,
    reading: dict,
    history: list[dict],
    question: str,
    avoid_texts: list[str] | None = None,
) -> str:
    from core.llm_gate import validate_followup
    from core.prompts import build_followup_messages

    messages = build_followup_messages(
        character_id, reading, history, question, avoid_texts=avoid_texts
    )

    is_reasoning = _zen_key() is not None
    token_base = 4500 if is_reasoning else 3000

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
```

- [ ] **Step 7: Run all tests**

Run: `python -m pytest tests/ -v`
Expected: PASS (все, включая существующие test_quota, test_tarot)

- [ ] **Step 8: Commit**

```bash
git add core/llm.py tests/test_llm_pipeline.py
git commit -m "feat(llm): gate+retry pipeline, json mode, cooldown streak, temp 0.75"
```

---

### Task 3: Настроение дня — `core/moods.py` + few-shot голоса

**Files:**
- Create: `core/moods.py`
- Modify: `data/characters.json` (добавить `voice_examples` каждому персонажу)
- Modify: `core/prompts.py` (`get_system_prompt` — инжект few-shot; убрать random mood из `get_system_prompt`, mood передаётся явно)
- Modify: `core/llm.py` (`interpret_reading`/`interpret_followup` — mood из `mood_of_day`)
- Modify: `app.py` (`handle_spread` — поле `mood` в ответе)
- Create: `tests/test_moods.py`

**Interfaces:**
- Produces: `moon_phase(now=None) -> float`; `mood_of_day(character_id: str, now=None) -> dict` (возвращает элемент `moods` из characters.json: `{"id","name","prompt"}` или `{}`). `/api/spread` ответ дополняется `"mood": {"id","name"}`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_moods.py
import datetime as dt

from core.moods import mood_of_day, moon_phase


def test_moon_phase_in_range():
    p = moon_phase(dt.datetime(2026, 8, 23, tzinfo=dt.timezone.utc))
    assert 0.0 <= p < 1.0


def test_moon_phase_known_new_moon():
    # 2000-01-06 18:14 UTC — известное новолуние (эпоха)
    p = moon_phase(dt.datetime(2000, 1, 6, 18, 14, tzinfo=dt.timezone.utc))
    assert p < 0.01


def test_selena_mood_deterministic_within_day():
    t = dt.datetime(2026, 8, 23, 10, 0)
    a = mood_of_day("shadow_walker", now=t)
    b = mood_of_day("shadow_walker", now=t + dt.timedelta(minutes=30))
    assert a == b and a.get("id")


def test_vesta_mood_depends_on_hour():
    morning = mood_of_day("ruin_keeper", now=dt.datetime(2026, 8, 23, 8, 0))
    evening = mood_of_day("ruin_keeper", now=dt.datetime(2026, 8, 23, 19, 0))
    assert morning["id"] == "amber"
    assert evening["id"] == "smoke"


def test_lilith_mood_rotates_by_day():
    a = mood_of_day("spark_of_chaos", now=dt.datetime(2026, 8, 23, 12, 0))
    b = mood_of_day("spark_of_chaos", now=dt.datetime(2026, 8, 24, 12, 0))
    assert a.get("id") and b.get("id")
    assert a["id"] in {"sparks", "quiet_fire", "storm", "midnight_laugh"}


def test_unknown_character_returns_empty():
    assert mood_of_day("nope") == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_moods.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.moods'`

- [ ] **Step 3: Implement `core/moods.py`**

```python
# core/moods.py
"""Настроение дня проводницы — детерминированное, вместо random на расклад.

Селена живёт по фазе луны, Веста — по времени суток, Лилит — по дню года.
Настроение стабильно весь день: его видно в UI («сегодня у неё гроза»).
"""
from __future__ import annotations

import datetime as _dt

from core.prompts import get_character

_SYNODIC = 29.53058867
_EPOCH_NEW_MOON = _dt.datetime(2000, 1, 6, 18, 14, tzinfo=_dt.timezone.utc)

# Границы фаз (доля синодического месяца, 0 = новолуние) → mood_id Селены
_SELENA_PHASE_MAP: list[tuple[float, str]] = [
    (0.0625, "fog"),          # новолуние
    (0.4375, "tide"),         # растущая
    (0.6875, "light_moon"),   # полнолуние
    (0.9375, "storm"),        # убывающая
    (1.01, "fog"),            # к новолунию
]


def moon_phase(now: _dt.datetime | None = None) -> float:
    """Фаза луны 0..1 (0 — новолуние)."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=_dt.timezone.utc)
    delta = now - _EPOCH_NEW_MOON
    return (delta.total_seconds() / 86400 / _SYNODIC) % 1.0


def mood_of_day(character_id: str, now: _dt.datetime | None = None) -> dict:
    """Детерминированное настроение проводницы на сегодня.

    Возвращает элемент `moods` персонажа ({"id","name","prompt"}) или {}.
    """
    try:
        ch = get_character(character_id)
    except KeyError:
        return {}
    moods: list[dict] = ch.get("moods") or []
    if not moods:
        return {}
    by_id = {m["id"]: m for m in moods}

    now = now or _dt.datetime.now()
    if character_id == "shadow_walker":
        p = moon_phase(now)
        for limit, mood_id in _SELENA_PHASE_MAP:
            if p < limit:
                return by_id.get(mood_id, moods[0])
        return moods[0]

    if character_id == "ruin_keeper":
        h = now.hour
        mood_id = (
            "amber" if 5 <= h < 11
            else "hearth" if 11 <= h < 17
            else "smoke" if 17 <= h < 22
            else "stone"
        )
        return by_id.get(mood_id, moods[0])

    # spark_of_chaos и остальные — ротация по дню года
    return moods[now.timetuple().tm_yday % len(moods)]
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_moods.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Добавить `voice_examples` в `data/characters.json`**

В объект `shadow_walker` (после `"forbidden"`) добавить:

```json
    "voice_examples": [
      {
        "question": "Он вернётся?",
        "intro": "Ты уже знаешь ответ — просто вода ещё не дошла до берега.",
        "advice": "Сегодня не пиши ему первой. Пусть луна доработает за тебя — утром станет тише."
      },
      {
        "question": "Стоит ли менять работу?",
        "intro": "Ты спрашиваешь про работу, а сердце спрашивает про сон.",
        "advice": "Составь два списка перед сном — где спокойнее дышится, там и ответ."
      }
    ],
```

В объект `ruin_keeper`:

```json
    "voice_examples": [
      {
        "question": "Стоит ли менять работу?",
        "intro": "Хлеб печётся там, где жар. Твой жар сейчас не в этой печи.",
        "advice": "Обнови резюме сегодня — одно конкретное дело за день."
      },
      {
        "question": "Что он чувствует ко мне?",
        "intro": "Кто молчит у чужого очага, тот греется о свои мысли. Он думает о тебе, но медленно.",
        "advice": "Дай ему сутки тишины. Огонь не любят торопить."
      }
    ],
```

В объект `spark_of_chaos`:

```json
    "voice_examples": [
      {
        "question": "Он вернётся?",
        "intro": "Ох, детка. Карты говорят «да», но вопрос-то — «надо ли?».",
        "advice": "Надень то самое платье и выйди из дома. Не к нему — просто вспомни, какая ты."
      },
      {
        "question": "Стоит ли менять работу?",
        "intro": "Ты не работу хочешь сменить, а стул, на котором сидит твой страх.",
        "advice": "Отправь отклик на ту самую вакансию. Сегодня. Я слежу."
      }
    ],
```

- [ ] **Step 6: Инжект few-shot в `get_system_prompt` (`core/prompts.py`)**

После блока `if opener:` добавить:

```python
    # Few-shot: мини-примеры голоса — сильнее любого описания характера
    examples = ch.get("voice_examples") or []
    if examples:
        ex_lines = ["\nПримеры твоего голоса (НЕ копируй дословно, держи интонацию):"]
        for ex in examples[:2]:
            ex_lines.append(f"  Вопрос: «{ex['question']}»")
            ex_lines.append(f"  Ты: «{ex['intro']} {ex['advice']}»")
        parts.append("\n".join(ex_lines))
```

- [ ] **Step 7: Mood из `mood_of_day` в `core/llm.py`**

В `interpret_reading` заменить строку `system_prompt = get_system_prompt(character_id, avoid_texts=avoid_texts)` на:

```python
    from core.moods import mood_of_day
    system_prompt = get_system_prompt(
        character_id, mood=mood_of_day(character_id), avoid_texts=avoid_texts
    )
```

В `build_followup_messages` (`core/prompts.py`) заменить:

```python
    moods = ch.get("moods") or []
    mood = random.choice(moods) if moods else None
```

на:

```python
    from core.moods import mood_of_day
    mood = mood_of_day(character_id)
```

- [ ] **Step 8: Поле `mood` в `/api/spread` (`app.py`)**

После вызова `interpret_reading(...)`:

```python
    from core.moods import mood_of_day
    mood = mood_of_day(character_id)
```

и в `web.json_response({...})` добавить поле:

```python
        "mood": {"id": mood["id"], "name": mood["name"]} if mood else None,
```

- [ ] **Step 9: Run all tests + smoke**

Run: `python -m pytest tests/ -v && python -c "from core.moods import mood_of_day; print(mood_of_day('shadow_walker')['name'])"`
Expected: все тесты PASS; печатается название настроения (например «Туманная ночь»)

- [ ] **Step 10: Commit**

```bash
git add core/moods.py tests/test_moods.py data/characters.json core/prompts.py core/llm.py app.py
git commit -m "feat(llm): mood-of-the-day (moon phase/hour/day) + few-shot voice examples"
```

---

### Task 4: Фолбэк-тексты под голоса + финальная верификация

**Files:**
- Modify: `core/llm.py` (`fallback_from_cards_db`, `_fallback_followup`)

- [ ] **Step 1: Обновить `fallback_from_cards_db`**

Заменить `character_intros` и `advice_templates` на голоса (короткие, в характере):

```python
    character_intros = {
        "shadow_walker": "Луна вышла из-за туч — слушай.",
        "ruin_keeper": "Очаг потрескивает. Слушай, что видно при его свете.",
        "spark_of_chaos": "Искра! Ну наконец-то что-то интересное.",
    }
```

```python
    advice_templates = {
        "shadow_walker": "Сегодня разреши воде нести себя: одна пауза тишины — и станет ясно.",
        "ruin_keeper": "Сделай одно настоящее дело. Маленькое, но руками.",
        "spark_of_chaos": "Хватит мерить чужие жизни. Один маленький дерзкий шаг — сегодня.",
    }
```

- [ ] **Step 2: Обновить `_fallback_followup`** — заменить строку возврата на:

```python
    return (
        f"{name} на миг замерла у своей чаши... Карты этого расклада ({card_names}) "
        "уже сказали главное. Спроси ещё раз чуть позже — я отвечу подробнее."
    )
```

- [ ] **Step 3: Полный прогон**

Run: `python -m pytest tests/ -v && python scripts/e2e_check.py`
Expected: тесты PASS; e2e-скрипт отрабатывает (если требует сети/ключей — прогнать локально с `.env`)

- [ ] **Step 4: Commit**

```bash
git add core/llm.py
git commit -m "fix(llm): fallback texts in guide voices"
```
