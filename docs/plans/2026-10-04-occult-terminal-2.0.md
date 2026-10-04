# Оккультный терминал 2.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отполировать таро-бот ARCANUM: плавный typing-движок (rAF, DOM-inject), событийная секвенция чтения, инлайн-разбор позиций, каталог из 8 раскладов (`data/spreads.json`), углублённые проводники, полировка UI.

**Architecture:** Frontend — Next.js 15/React 19 (Pages Router, static export в `static/webapp`), весь флоу — растущий транскрипт в `Shell`. Backend — aiohttp (`app.py`) + `core/prompts.py` (LLM-промпты) + SQLite. Новый источник правды для раскладов — `data/spreads.json` (backend) с зеркалом `web/src/lib/spreads.ts` (frontend) по образцу существующего `guides.ts`/`characters.json`.

**Tech Stack:** TypeScript/React/Tailwind4/vitest/playwright (frontend); Python 3.12/pytest (backend). Команды: backend — `cd taro_bot && .venv/bin/python -m pytest tests/... -v`; frontend tests — `cd taro_bot/web && npx vitest run <file>`; build — `cd taro_bot/web && npm run build`; dev-сервер — `cd taro_bot/web && npm run dev` → http://localhost:3000 (мок-API включается автоматически при NODE_ENV!==production).

**Spec:** `docs/specs/2026-10-04-occult-terminal-2.0-design.md` (читать вместе с планом; план спорит от спеки). Все пути относительно `taro_bot/`.

## Global Constraints

- НЕ трогать: LLM-провайдеры/фоллбеки (`core/llm.py`), платежи (`core/payments.py`), резерв квоты (`storage/db.py` reserve_quota), aiogram-слой (`bot/`), напоминания.
- Обратная совместимость: `POST /api/spread/begin` принимает старые `spread_type` (`1`, `"1"`, `3`, `"3"`, `"daily"`) и новые строковые id. URL `?type=1|3|daily` работает.
- Все пользовательские тексты — русский, строчные в терминальном регистре (как в существующем UI), без эмодзи.
- Перф-цель: 0 long tasks > 50ms во время typing (Task 16).
- Кегли: метки ≥12px, проза чтения 15px; dim-текст ≥ rgba(255,255,255,.45).
- Коммиты: шаг «Commit» выполняется ТОЛЬКО если юзер одобрил коммиты (уточнить при handoff). Автор — личный GitHub-профиль `omr <omar56055@gmail.com>` (не WB-репо).
- `data/characters.json` и `web/src/lib/guides.ts` — близнецы: текстовые поля (whispers, greetings, closings) меняются синхронно, backend — источник правды.
- steps() easing остаются ТОЛЬКО у blink-курсора и braille-спиннера (+ намеренно `flip-glitch steps(7)`). Остальное (`btn-vibe`, `portrait-flicker`, `guide-loading-pulse`, прочее) → плавные cubic-bezier.
- Python для тестов: `.venv/bin/python` (если нет — `python3`).

## Review Focus

1. **Старые клиенты/ссылки** `?type=1|3|daily` и старые `spread_type` в теле `/api/spread/begin` — ожидание: работают как раньше (Task 1/3, тест в Task 3).
2. **Журнал старых записей** — записи без новых полей (`layout`, `flipOrder`, `spreadId`) и интерпретации без `позиции` — ожидание: рендерятся как сейчас, без падений (instant-режим ReadingResult, фолбэки — Task 9/16).
3. **Слабый WebView во время печати** — ambient-слои при активном typing — ожидание: на паузе (`is-typing`), 0 long tasks > 50ms (Task 7, замер Task 16).
4. **LLM вернул не по схеме** (нет `позиции`, вердикт не первой фразой в yesno) — ожидание: frontend не падает, секции пропускаются (фолбэк-рендер Task 6).
5. **Флип не по порядку** (пентаграмма) — ожидание: игнор вне очереди, подсказка показывает следующую позицию (Task 10).

---

### Task 1: `data/spreads.json` + loader `core/spreads.py`

**Files:**
- Create: `data/spreads.json`
- Create: `core/spreads.py`
- Test: `tests/test_spreads.py`

**Interfaces:**
- Produces: `load_spreads() -> dict[str, dict]`, `get_spread(spread_id: str) -> dict | None`, `resolve_spread(raw: object, question: str | None) -> dict` (легаси `1`/`"1"`→`single`, `3`/`"3"`→`three`, `"daily"`→`daily`; неизвестный id → `single` при вопросе, иначе `daily`). Spread-дикт: `id, name, aliases, cmd, count, mode, layout, needs_question, flip_order, positions (list[{key,name,desc}]), synthesis, quota_cost`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_spreads.py
from core.spreads import load_spreads, resolve_spread

def test_all_spreads_valid():
    spreads = load_spreads()
    assert set(spreads) == {"daily","single","yesno","three","mfd","shadow","pentagram","horseshoe"}
    for s in spreads.values():
        assert 1 <= s["count"] <= 10
        assert s["mode"] in {"daily","single","yesno","three","mfd","shadow","pentagram","horseshoe"}
        assert s["layout"] in {"column1","trio","pyramid","spine","pentagram","arc"}
        assert len(s["positions"]) == s["count"]
        if s["id"] != "three":
            assert {p["key"] for p in s["positions"]} == set(s["flip_order"]), s["id"]

def test_legacy_mapping():
    assert resolve_spread("daily", None)["id"] == "daily"
    assert resolve_spread(1, "вопрос?")["id"] == "single"
    assert resolve_spread("1", "вопрос?")["id"] == "single"
    assert resolve_spread(3, None)["id"] == "three"
    assert resolve_spread("3", None)["id"] == "three"
    assert resolve_spread("pentagram", "кто я?")["id"] == "pentagram"

def test_unknown_falls_back():
    assert resolve_spread("nonexistent", "q")["id"] == "single"
    assert resolve_spread("nonexistent", None)["id"] == "daily"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd taro_bot && .venv/bin/python -m pytest tests/test_spreads.py -v`
Expected: FAIL (`ModuleNotFoundError: core.spreads`)

- [ ] **Step 3: Write spreads.json + loader**

`data/spreads.json` — полное содержимое (см. приложение A в конце плана — вставить целиком).

`core/spreads.py`:

```python
# core/spreads.py
"""Каталог раскладов — источник правды data/spreads.json.

Легаси-совместимость: старые типы фронта (1, "1", 3, "3", "daily")
маппятся на записи каталога. Неизвестный id безопасно падает в single/daily.
"""
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
_SPREADS: dict[str, dict[str, Any]] = {}

_LEGACY_MAP = {1: "single", "1": "single", 3: "three", "3": "three", "daily": "daily"}


def load_spreads() -> dict[str, dict[str, Any]]:
    global _SPREADS
    if _SPREADS:
        return _SPREADS
    path = PROJECT_ROOT / "data" / "spreads.json"
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    _SPREADS = raw["spreads"]
    return _SPREADS


def get_spread(spread_id: str) -> dict[str, Any] | None:
    return load_spreads().get(spread_id)


def resolve_spread(raw: object, question: str | None) -> dict[str, Any]:
    """Разрешить spread_type запроса в запись каталога (никогда не None)."""
    spreads = load_spreads()
    if isinstance(raw, str) and raw in spreads:
        return spreads[raw]
    if str(raw) in spreads:
        return spreads[str(raw)]
    legacy = _LEGACY_MAP.get(raw) or _LEGACY_MAP.get(str(raw))
    if legacy:
        return spreads[legacy]
    if question and str(question).strip():
        return spreads["single"]
    return spreads["daily"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd taro_bot && .venv/bin/python -m pytest tests/test_spreads.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add data/spreads.json core/spreads.py tests/test_spreads.py
git commit -m "feat: spread catalog as data (8 spreads) + legacy-compatible resolver"
```

---

### Task 2: `core/prompts.py` — режимы новых раскладов

**Files:**
- Modify: `core/prompts.py` (`_spread_mode` удалить, `build_reading_prompt:263-433` переписать)
- Test: `tests/test_prompts_spreads.py`

**Interfaces:**
- Consumes: `core.spreads.get_spread` (Task 1), существующие `_positions_for_question`, `_format_cards`, `_character_reminder`, `_load_characters`.
- Produces: `build_reading_prompt(cards, question, character_id, spread, positions, voice_reminder=None) -> str`. `spread` — дикт каталога; `positions: list[str]` — финальные имена позиций (для `three` вычислены снаружи через `_positions_for_question`). Все multi-card режимы (three/yesno/mfd/shadow/pentagram/horseshoe) используют ОДНУ JSON-схему `позиции[] + связь_карт`. Старую сигнатуру НЕ сохраняем — вызовы обновит Task 3 (и существующие тесты `tests/test_prompts*.py` подправить под новую сигнатуру).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_prompts_spreads.py
from core.spreads import get_spread
from core.prompts import build_reading_prompt

CARDS = [
    {"name": "Луна", "orientation": "reversed"},
    {"name": "Солнце", "orientation": "upright"},
    {"name": "Башня", "orientation": "upright"},
]

def _pos(spread_id):
    return [p["name"] for p in get_spread(spread_id)["positions"]]

def test_yesno_requires_verdict():
    p = build_reading_prompt(CARDS, "менять ли работу?", "shadow_walker",
                             get_spread("yesno"), _pos("yesno"))
    assert "Да." in p and "Скорее да." in p
    assert "позиции" in p and "связь_карт" in p

def test_pentagram_rules():
    p = build_reading_prompt(CARDS, "кто я в этой ситуации?", "ruin_keeper",
                             get_spread("pentagram"), _pos("pentagram"))
    assert "НЕ предсказание" in p
    assert "доминирует" in p

def test_shadow_requires_concrete_step():
    p = build_reading_prompt(CARDS, None, "spark_of_chaos",
                             get_spread("shadow"), _pos("shadow"))
    assert "конкретное" in p

def test_three_uses_dynamic_positions():
    p = build_reading_prompt(CARDS, "что будет в отношениях?", "shadow_walker",
                             get_spread("three"), ["Твоя позиция", "Динамика", "Вектор"])
    assert "Твоя позиция" in p and "Динамика" in p

def test_single_daily_unchanged():
    p = build_reading_prompt([CARDS[0]], "кто виноват?", "shadow_walker",
                             get_spread("single"), _pos("single"))
    assert "card_meaning" in p
    d = build_reading_prompt([CARDS[0]], None, "shadow_walker", get_spread("daily"), _pos("daily"))
    assert "проявление" in d and "траектория" in d
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd taro_bot && .venv/bin/python -m pytest tests/test_prompts_spreads.py -v`
Expected: FAIL (сигнатура не принимает `spread`/`positions`)

- [ ] **Step 3: Implement**

В `core/prompts.py`:
1. Удалить `_spread_mode` (логика переехала в каталог). Новая сигнатура `build_reading_prompt(cards, question, character_id, spread, positions, voice_reminder=None)`; `mode = spread["mode"]`; `spread_name = spread["name"]`.
2. Блок «Cards»: для multi-card режимов — `f"Расклад «{spread_name}». Позиции:"` + `_format_cards(cards, positions)`; single/daily — как сейчас.
3. Блок «Core instruction» — существующий `three` остаётся; добавить ветки `elif mode == "yesno" / "mfd" / "shadow" / "pentagram" / "horseshoe"` со следующим текстом (стиль тот же, что у three):

```python
    elif mode == "yesno":
        lines.append(
            "Расклад «да / нет»: три карты — аргументы «за», «против» и совет.\n"
            "Первая фраза short_answer — ВЕРДИКТ, дословно один из четырёх: "
            "«Да.», «Скорее да.», «Скорее нет.», «Нет.»\n"
            "Дальше — 2-3 предложения обоснования. Вердикт обязан следовать из карт, "
            "а не из вежливости: если аргументы расходятся, честно говори «скорее…».\n"
            "НЕ подменяй вердикт «всё зависит от тебя»."
        )
    elif mode == "mfd":
        lines.append(
            "Расклад о другом человеке: что он ДУМАЕТ, что ЧУВСТВУЕТ, что будет ДЕЛАТЬ.\n"
            "Говори о нём в третьем лице, без диагнозов и всезнайства: "
            "карты — зеркало вероятного, не рентген.\n"
            "НЕ выдумывай факты (сообщения, разговоры), которых не было в вопросе.\n"
            "Синтез: где мысль расходится с чувством и что из этого дойдёт до действий."
        )
    elif mode == "shadow":
        lines.append(
            "Расклад «тень» — работа с тем, что прячется. Позиции 1-4 — диагностика, "
            "5-6 — выход в действие.\n"
            "Тон: бережный спуск, без надрыва и эзотерического пафоса. Скрывать — "
            "нормально: сначала это было защитой, и это стоит признать.\n"
            "Позиция 6 — ОБЯЗАТЕЛЬНО одно конкретное маленькое действие на неделю "
            "(не «поразмысли», а наблюдаемое действие).\n"
            "НЕ ставь диагнозы и НЕ отправляй к специалисту без повода из карт."
        )
    elif mode == "pentagram":
        lines.append(
            "Расклад «пентаграмма»: пять элементов вокруг сигнификатора.\n"
            "Сигнификатор (центр) — суть ситуации и кто в ней спрашивающий; вскрывается "
            "последней и читается как рамка, а не как событие.\n"
            "Дух — НЕ предсказание: сквозная линия, объединяющая элементы.\n"
            "Элементы — текущее состояние, не приговор: земля (тело, деньги, опора), "
            "воздух (мысли и слова), вода (чувства и интуиция), огонь (воля и импульс).\n"
            "Синтез обязателен: какой элемент доминирует, какой голодает, "
            "какие два в диалоге (усиливают или грызутся)."
        )
    elif mode == "horseshoe":
        lines.append(
            "Расклад «подкова» — семь карт по дуге от ситуации к исходу.\n"
            "Читай как маршрут: где линия ровная, где гнётся, что подталкивает извне.\n"
            "Исход (позиция 7) — при текущей линии, НЕ приговор: если совет меняет "
            "траекторию, скажи об этом в advice.\n"
            "НЕ дублируй «скрытое» и «препятствие»: скрытое не видно изнутри, "
            "препятствие стоит на пути."
        )
```

4. Блок «JSON format»: условие multi-card — `if mode in {"three","yesno","mfd","shadow","pentagram","horseshoe"}` — переиспользовать СУЩЕСТВУЮЩУЮ three-схему (`позиции[]` + `связь_карт`), заменив фразу «Три карты — это ОДНА история» в short_answer-описании на `f"связный ответ на вопрос целиком (5-7 предложений)"` и добавив в описание `позиции[]` требование «{"позиция": "<имя позиции ДОСЛОВНО, как задано выше>"}». Ещё добавить в текст схемы строку: `f"  "связь_карт": синтез — {spread['synthesis']}"` (если `spread["synthesis"]` непустой — вставить его текст в инструкцию для связь_карт).
5. Убедиться, что `field_voice`, `daily_voice`, `reminder` блоки не изменились.

- [ ] **Step 4: Run tests (new + existing prompts tests)**

Run: `cd taro_bot && .venv/bin/python -m pytest tests/test_prompts_spreads.py tests/ -k "prompt" -v`
Expected: PASS. Существующие тесты `build_reading_prompt` обновить на новую сигнатуру (spread=resolve_spread(...), positions из каталога).

- [ ] **Step 5: Commit**

```bash
git add core/prompts.py tests/
git commit -m "feat: per-spread prompt modes (yesno/mfd/shadow/pentagram/horseshoe), uniform multi-card JSON schema"
```

---

### Task 3: `app.py` — интеграция каталога

**Files:**
- Modify: `app.py` (`_spread_request_context:414-519`, `_whisper_task`, `handle_spread_begin:346-381`)
- Test: `tests/test_app_spreads.py`

**Interfaces:**
- Consumes: `core.spreads.resolve_spread` (Task 1), `core.prompts.build_reading_prompt(cards, question, character_id, spread, positions)` (Task 2).
- Produces: `/api/spread/begin` response + новые поля: `positions: string[]` (имена позиций, по одной на карту — для ВСЕХ multi-card раскладов, не только three), `position_keys: string[]` (ключи позиций из каталога; для three — `["p1","p2","p3"]`), `spread_id: string`, `spread_name: string`. `reading_type` в БД: `daily` для daily, `spread_<id>` для остальных (`spread_1`/`spread_3` легаси-значения сохраняются для старых типов — фронтовский `spreadLabelFromType` уже их знает).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_app_spreads.py
import json
import pytest
from unittest.mock import patch, AsyncMock
from core.spreads import resolve_spread

def test_count_comes_from_catalog():
    for sid, n in [("yesno", 3), ("mfd", 3), ("shadow", 6), ("pentagram", 6), ("horseshoe", 7), ("daily", 1)]:
        assert resolve_spread(sid, None)["count"] == n

def test_positions_and_keys_shape():
    s = resolve_spread("pentagram", "q")
    names = [p["name"] for p in s["positions"]]
    keys = [p["key"] for p in s["positions"]]
    assert len(names) == len(keys) == 6
    assert keys[0] == "center" and names[0] == "сигнификатор"

# Интеграцию хендлера проверяем на уровне моков: распаковка контекста
# тестируется существующими tests/test_spread_lifecycle.py — их расширяем:
def test_reading_type_format():
    from core.spreads import resolve_spread
    for sid in ["yesno", "mfd", "shadow", "pentagram", "horseshoe", "single", "three"]:
        s = resolve_spread(sid, None)
        assert (s["id"] == "daily") or (f"spread_{s['id']}" == f"spread_{sid}")
```

- [ ] **Step 2: Run to verify** — `cd taro_bot && .venv/bin/python -m pytest tests/test_app_spreads.py -v` → PASS (это контрактные тесты; интеграционную часть проверит Step 4)

- [ ] **Step 3: Implement в `app.py`**

1. Импорт: `from core.spreads import resolve_spread`.
2. В `_spread_request_context` заменить блок `spread_type_str/is_daily/count/reading_type/positions` (строки ~436-442) на:

```python
    spread = resolve_spread(spread_type, question)
    spread_id = spread["id"]
    # легаси-типы сохраняют прежние reading_type (дедуп/журнал не ломаются)
    if spread_id == "daily":
        spread_type_str = "daily"
        reading_type = "daily"
    elif spread_id in ("single", "three") and str(spread_type) in ("1", "3", 1, 3):
        spread_type_str = "non_daily"
        reading_type = f"spread_{spread_id}"
    else:
        spread_type_str = "non_daily"
        reading_type = f"spread_{spread_id}"
    is_daily = spread_type_str == "daily"
    count = min(int(spread["count"]), 10)
    needs_q = spread["needs_question"]
    if needs_q and not (question and str(question).strip()):
        return web.json_response({"error": "для этого расклада нужен вопрос"}, status=400)
    if spread_id == "three":
        positions = _positions_for_question(question)
    else:
        positions = [p["name"] for p in spread["positions"]]
    position_keys = [p["key"] for p in spread["positions"]]
```

3. Dedup-блок (~452): `active["type"] == reading_type` — оставить; в dedup-ответ добавить `positions` (по `len(active_cards)` и spread_id — для multi-card вернуть имена позиций тем же способом) и `spread_id`/`spread_name`.
4. `cards_data = {"cards": cards, "spread_type": spread_id}` (строка ~467) — храним строковый id.
5. Возвращаемый контекст (строка ~507): добавить `"spread": spread, "positions": positions, "position_keys": position_keys, "spread_id": spread_id, "spread_name": spread["name"]`.
6. `handle_spread_begin`: в оба ответа (dedup ~354 и обычный ~371) добавить `spread_id`, `spread_name`, `position_keys` (рядом с `positions`).
7. `_whisper_task` — найти вызов `build_reading_prompt(...)` внутри; передать `spread=ctx["spread"]`, `positions=ctx["positions"]` вместо старого `spread_type=`. Прочитать `_whisper_task` полностью перед правкой (там же resolveWhisper-цепочка и записи статусов — их не менять).
8. Прочитать и обновить все прочие вызовы `build_reading_prompt` в репо (grep).

- [ ] **Step 4: Run tests**

Run: `cd taro_bot && .venv/bin/python -m pytest tests/ -v`
Expected: PASS (обновить существующие тесты, которые мокают старый flow — минимум: формат reading_type, поля ответа).

- [ ] **Step 5: Commit**

```bash
git add app.py tests/
git commit -m "feat: /api/spread/begin serves catalog spreads (count/positions/keys), legacy-compatible"
```

---

### Task 4: Typing-движок `lib/typeFlow.ts` + переписать `ProseType`

**Files:**
- Create: `web/src/lib/typeFlow.ts`
- Modify: `web/src/components/shell/ProseType.tsx` (полностью)
- Test: `web/src/components/shell/__tests__/typeFlow.test.ts`

**Interfaces:**
- Produces: `typeInto(node: Text, text: string, opts?: { cps?: number; onTick?: () => void; minSoundIntervalMs?: number }): { cancel(): void; finished: Promise<void> }`; `punctDelay(ch: string): number`. ProseType props совместимы со старыми (text, startDelay, speed→cps, className, style, tail, shimmer, sound, instant, quotes, onDone) — вызовы в ReadingResult/Shell не ломаются.
- Perf-инварианты: НИКАКОГО React-state на символ; DOM-инжект в один Text-нод; максимум 2 символа за кадр; скорость ~72 cps c синус-микровариацией ±12%; звук не чаще раза в 48мс.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/components/shell/__tests__/typeFlow.test.ts
import { describe, it, expect, vi } from 'vitest';
import { punctDelay } from '@/lib/typeFlow';

describe('punctDelay', () => {
  it('pauses on sentence ends', () => {
    expect(punctDelay('.')).toBe(120);
    expect(punctDelay('!')).toBe(120);
    expect(punctDelay('…')).toBe(120);
  });
  it('short pause on commas', () => {
    expect(punctDelay(',')).toBe(50);
    expect(punctDelay('—')).toBe(50);
  });
  it('no pause on letters', () => {
    expect(punctDelay('а')).toBe(0);
  });
});
```

Run: `cd taro_bot/web && npx vitest run src/components/shell/__tests__/typeFlow.test.ts` → FAIL (модуля нет)

- [ ] **Step 2: Implement `lib/typeFlow.ts`**

```ts
// web/src/lib/typeFlow.ts
'use client';

/**
 * Typing-движок ARCANUM v2: печать через requestAnimationFrame
 * прямой инжекцией в Text-нод. Никаких React-ререндеров на символ,
 * никакого случайного джиттера — микро-вариация скорости плавная.
 * После залипания кадра догоняем максимум 2 символами за кадр,
 * чтобы текст не «выстреливал» блоком.
 */

export interface TypeFlowHandle {
  cancel: () => void;
  finished: Promise<void>;
}

export interface TypeFlowOptions {
  /** базовая скорость, символов в секунду */
  cps?: number;
  /** звук на тик (движок сам троттлит) */
  onTick?: () => void;
  minSoundIntervalMs?: number;
}

/** Пауза после знака препинания, мс. */
export function punctDelay(ch: string): number {
  if ('.!?…'.includes(ch)) return 120;
  if (',;:—'.includes(ch)) return 50;
  return 0;
}

export function typeInto(
  node: Text,
  text: string,
  opts: TypeFlowOptions = {},
): TypeFlowHandle {
  const cps = Math.max(10, opts.cps ?? 72);
  const minSoundIntervalMs = opts.minSoundIntervalMs ?? 48;
  let i = 0;
  let lastSound = 0;
  let raf = 0;
  let cancelled = false;
  let nextAt = 0;
  let resolveDone: (() => void) | undefined;

  const finished = new Promise<void>((resolve) => { resolveDone = resolve; });
  const finish = () => { if (!cancelled) resolveDone?.(); };

  const baseDelay = () => {
    const wobble = 1 + 0.12 * Math.sin(i * 0.35);
    return 1000 / (cps * wobble);
  };

  const step = (now: number) => {
    if (cancelled) return;
    if (i >= text.length) { finish(); return; }
    if (now < nextAt) { raf = requestAnimationFrame(step); return; }
    let budget = 2; // жёсткий кап на кадр — анти-«блок»
    while (budget-- > 0 && i < text.length && now >= nextAt) {
      i += 1;
      node.textContent = text.slice(0, i);
      if (opts.onTick) {
        const t = performance.now();
        if (t - lastSound >= minSoundIntervalMs) { lastSound = t; opts.onTick(); }
      }
      nextAt = now + baseDelay() + punctDelay(text[i - 1]);
    }
    if (i >= text.length) { finish(); return; }
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);

  return {
    cancel: () => { cancelled = true; cancelAnimationFrame(raf); resolveDone?.(); },
    finished,
  };
}
```

- [ ] **Step 3: Run test → PASS**

- [ ] **Step 4: Переписать `ProseType.tsx`** (полностью заменить тело; props совместимы, `speed` переосмыслен как cps):

```tsx
'use client';

// ProseType v2 — проза печатается движком typeFlow (rAF + DOM-инжект):
// ноль React-ререндеров на символ, паузы на знаках, тонкий курсор.
import { useEffect, useRef, useState } from 'react';
import { sType } from '@/lib/sound';
import { joinedParagraphs } from '@/lib/prose';
import { typeInto, type TypeFlowHandle } from '@/lib/typeFlow';

interface ProseTypeProps {
  text: string;
  /** мс до первого символа — оркестрация последовательности */
  startDelay?: number;
  /** скорость печати, символов в секунду (бывшие ~8мс/символ ≈ 110cps; 72 — спокойнее) */
  cps?: number;
  className?: string;
  style?: React.CSSProperties;
  tail?: string;
  quotes?: boolean;
  shimmer?: boolean;
  sound?: boolean;
  /** мгновенный вывод без посимвольной печати (журнал) */
  instant?: boolean;
  onDone?: () => void;
}

// сколько займёт печать строки (мс) — оценка для внешних оркестраторов
export function proseDuration(text: string, cps = 72): number {
  const target = joinedParagraphs(text);
  let ms = (target.length * 1000) / cps;
  for (const ch of target) ms += ('.!?…'.includes(ch) ? 120 : ',;:—'.includes(ch) ? 50 : 0);
  return ms + 90;
}

export default function ProseType({
  text, startDelay = 0, cps = 72, className, style, tail,
  shimmer = false, sound = true, instant = false, quotes = true, onDone,
}: ProseTypeProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const flowRef = useRef<TypeFlowHandle | null>(null);
  const [done, setDone] = useState(Boolean(instant || !text));
  // onDone в ref — эффект не должен перезапускаться от смены коллбэка
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    flowRef.current?.cancel();
    flowRef.current = null;
    if (instant || !text) {
      host.textContent = joinedParagraphs(text);
      setDone(true);
      onDoneRef.current?.();
      return;
    }
    setDone(false);
    host.textContent = '';
    const node = document.createTextNode('');
    host.appendChild(node);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      if (cancelled) return;
      flowRef.current = typeInto(node, joinedParagraphs(text), {
        cps,
        onTick: sound ? sType : undefined,
      });
      flowRef.current.finished.then(() => {
        if (cancelled) return;
        setDone(true);
        onDoneRef.current?.();
      });
    };
    timer = startDelay > 0 ? setTimeout(start, startDelay) : (start(), undefined);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      flowRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, instant]);

  return (
    <span className={`j-prose ${className ?? ''}`} style={style}>
      {quotes && '"'}
      <span className={done && shimmer ? 'j-shimmer' : undefined}>
        <span ref={hostRef} />
        {!done && !instant && <span className="prose-cursor" aria-hidden="true">│</span>}
      </span>
      {done && quotes && '"'}
      {done && tail && <span className="j-punct">{tail}</span>}
    </span>
  );
}
```

- [ ] **Step 5: Reduced motion + звук.** В начале эффекта ProseType: `const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;` → трактовать как `instant`. Питч-вариация typing-звука (spec §9): в `web/src/lib/sound.ts` у `sType` добавить опциональный параметр `pitch: number` (0.9–1.1) и передавать из typeFlow `onTick` значение `0.9 + 0.2 * Math.sin(i * 0.35)` (синхронно с wobble скорости) — ProseType пробрасывает его в sType. Если сигнатура sType не позволяет — обернуть без изменения глобального состояния.

- [ ] **Step 6: Smoke через dev-сервер** — `npm run dev`, открыть localhost:3000, `taro daily`, флип: текст печатается плавно, курсор `│`. Длинное чтение из мока не «прыгает» блоками.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/typeFlow.ts web/src/components/shell/ProseType.tsx web/src/components/shell/__tests__/typeFlow.test.ts
git commit -m "perf: rAF DOM-inject typing engine, kill per-char React re-renders"
```

---

### Task 5: `Typewriter.tsx` (эхо команд) на том же движке

**Files:**
- Modify: `web/src/components/shell/Typewriter.tsx`
- Modify: `web/src/hooks/useTarotSession.ts:76-79` (`echoCmd` — длительность по новой формуле)

**Interfaces:**
- Produces: `typeDuration(text: string, cps = 55): number` (оценка, совместимая по использованию); Typewriter props совместимы. Командное эхо медленнее прозы: 55 cps (~18мс/символ — прежний темп).

- [ ] **Step 1: Переписать Typewriter на typeInto** — та же схема, что Task 4 Step 4, но: `cps = 1000 / speedMs` из пропса `speedMs` (обратная совместимость вызовов: Shell передаёт `speedMs={18}`), звук `sKey` с тем же троттлингом, курсор `▊` оставить ТОЛЬКО здесь (командная строка — легитимный блочный курсор терминала). `typeDuration(text, speedMs)` оставить формулу `text.length * speedMs + 60` — echoCmd ждёт её, темп не менялся.
- [ ] **Step 2: Smoke** — эхо команд печатается плавно, темп прежний.
- [ ] **Step 3: Commit** — `git commit -m "refactor: command echo on typeFlow engine"`.

---

### Task 6: `ReadingResult` — событийная секвенция + инлайн-позиции + ритуальная рамка

**Files:**
- Modify: `web/src/components/ReadingResult.tsx` (переписать оркестрацию)
- Modify: `web/src/styles/globals.css` (блок `.reading-*`: новые правила в конце файла, помеченные `/* v2 */`)
- Modify: `web/src/lib/guides.ts` (добавить поле `closings: string[]` во все 3 гайда — тексты взять из Task 12-14, до их выполнения временно 3 фразы на гайда)
- Modify: `web/src/pages/_document.tsx:26` (шрифтовая ссылка)

**Interfaces:**
- Consumes: ProseType v2 (Task 4), `GUIDES[guideId].closings`.
- Produces: `ReadingResult` props без изменений. Секции рендерятся последовательно по `onDone` предыдущей (никаких pre-computed задержек для prose). `instant` — всё сразу (журнал).

- [ ] **Step 1: Шрифты.** В `_document.tsx` расширить href: `family=Cormorant+Garamond:wght@500;600;700` добавить в тот же css2-URL. В `globals.css` `@theme`/переменные: `--font-serif: 'Cormorant Garamond', 'Times New Roman', serif;`

- [ ] **Step 2: Переписать оркестрацию ReadingResult.** Структура стадий (state `stage: number`, `instant` → все сразу):

```tsx
// порядок секций; каждая — { id, render(active: boolean, onDone: () => void) }
// header   — мета+вопрос+карточки, autoAdvance 350 + 45*cards мс
// intro    — ProseType (шёпот)        → onDone
// signal   — ProseType (signal)       → onDone
// body[i]  — по блоку на каждую позицию: метка сразу + ProseType → onDone
// synthesis— «нить» ProseType         → onDone
// disclosure — daily-траектория <details>, autoAdvance 200
// advice   — ProseType в рамке        → onDone
// close    — ритуальная подпись (fade-in), конец
```

Ключевые изменения против текущего кода:
1. Удалить весь блок pre-computed задержек (`tWhisper/tSignal/tBodyStart/bodyDelays/tAdvice/tClose`, строки 152-179) и `--jl-delay` для prose-секций. `next()`-stagger оставить ТОЛЬКО внутри header (строки, артефакты).
2. `buildBodyGroups` упростить: для multi-card интерпретаций `позиции[]` — ВСЕГДА visible-секции (никаких disclosures для позиций и связи_карт); disclosures остаётся только для `траектория` (daily). `связь_карт` — отдельная visible-секция «нить» перед advice.
3. Заголовок: `[ DAILY TRANSMISSION ]` → `<span className="reading-title">✦ {spreadLabel.toUpperCase()} ✦</span>` (spreadLabel уже приходит пропсом; `.reading-title` — Cormorant 600, 18px, accent, letter-spacing 0.08em).
4. Миниатюры: убрать grayscale — в CSS `.reading-artifact-img { filter: none; }` (переопределить старое правило) + цветная рамка 1px `--guide-accent-dim`.
5. Позиционные блоки body: `.reading-position-name` — Cormorant 600 20px (имя карты), метка позиции — `.reading-section-label` 12px caps tracking 0.14em, ориентация — 12px dim. Проза `.reading-body-text` — **15px / line-height 1.65** (обновить глобально `.reading-body-text`).
6. Футер: вместо `exit 0` —
```tsx
<div className="term-exit reading-close ...">
  <span className="reading-close-phrase">— {closing} —</span>
  <span className="reading-close-tag">{guide.tag}</span>
</div>
```
где `const closing = instant ? 'из журнала сеансов' : (guide.closings?.[Math.floor(Math.random()*guide.closings.length)] ?? 'свиток запечатан');`
7. `[ advice ]` → метка `совет` тем же стилем секций; `.reading-advice-box` — рамка 1px `--guide-accent-dim`, background `guide.accentDim`, уголки-глифы через существующие `corner-*` классы.
8. React-механика стадий: `useEffect` с таймером для autoAdvance-стадий; ProseType `onDone` → `setStage(s => s + 1)`. Рендерить стадию только если `stage >= index`. При `instant` — `useState(STAGES.length)`.

- [ ] **Step 3: CSS (globals.css, блок v2)**

```css
/* ── ReadingResult v2 ── */
.reading-title { font-family: var(--font-serif); font-weight: 600; font-size: 18px;
  letter-spacing: .08em; color: var(--guide-accent); text-shadow: 0 0 18px var(--guide-accent-dim); }
.reading-card-name { font-family: var(--font-serif); font-weight: 600; font-size: 20px; line-height: 1.15; }
.reading-artifact-img { filter: none; border: 1px solid var(--guide-accent-dim); }
.reading-body-text { font-size: 15px; line-height: 1.65; }
.reading-position-name { font-family: var(--font-serif); font-weight: 600; font-size: 20px; }
.reading-close-phrase { font-style: italic; color: var(--guide-accent); font-size: 12.5px; }
.reading-section-label { font-size: 12px; letter-spacing: .14em; }
.prose-cursor { color: var(--guide-accent); animation: blink 1s steps(2) infinite; font-weight: 300; }
```
(Старые конфликтующие правила `.reading-artifact-img`, `.reading-card-name` — найти и отредактировать на месте, не дублировать.)

- [ ] **Step 4: Smoke** — dev-сервер: `taro daily` → чтение печатается секция за секцией, без наездов; позиции инлайн; имя карты серифом; в конце ритуальная подпись. Журнал (instant) — всё сразу.

- [ ] **Step 5: Commit** — `git commit -m "feat: sequential event-driven reading, inline positions, serif accents, ritual closings"`.

---

### Task 7: Ambient-пауза при typing + сглаживание CSS + скролл

**Files:**
- Modify: `web/src/components/shell/Shell.tsx` (класс `is-typing` + rAF-скролл)
- Modify: `web/src/styles/globals.css` (правила паузы, сглаживание steps)

**Interfaces:**
- Consumes: событие старта/конца typing. Механика БЕЗ прокидывания пропсов: ProseType при старте печати ставит `document.querySelector('.shell-root')?.setAttribute('data-typing','1')`, при завершении/анмаунте снимает. Проще и надёжнее — счётчик: `typeFlow` не знает про DOM-иерархию, поэтому в `ProseType` инкремент/декремент через модульный счётчик `web/src/lib/typingActivity.ts`: `typingActivity.begin()/end()`; Shell подписывается эффектом на `data-typing` через MutationObserver? — НЕТ, усложнение. Решение: `typingActivity.ts` экспортирует `subscribeTyping(cb: (active: boolean) => void)`; Shell в `useEffect` подписывается и ставит/снимает атрибут `data-typing` на rootRef. ProseType/Typewriter вызывают begin/end в своём жизненном цикле.

- Create: `web/src/lib/typingActivity.ts`

```ts
// web/src/lib/typingActivity.ts
let count = 0;
const subs = new Set<(active: boolean) => void>();
function emit() { const a = count > 0; subs.forEach((cb) => cb(a)); }
export const typingActivity = {
  begin() { count += 1; if (count === 1) emit(); },
  end() { count = Math.max(0, count - 1); if (count === 0) emit(); },
  subscribe(cb: (active: boolean) => void) { subs.add(cb); return () => subs.delete(cb); },
  isActive() { return count > 0; },
};
```

- [ ] **Step 1: ProseType + Typewriter** — в эффекте старта печати `typingActivity.begin()`, в cleanup и при `setDone(true)` — `typingActivity.end()` (парно! begin только когда реально пошёл rAF).
- [ ] **Step 2: Shell** — подписка:

```tsx
useEffect(() => typingActivity.subscribe((active) => {
  rootRef.current?.toggleAttribute('data-typing', active);
}), []);
```

- [ ] **Step 3: CSS — пауза ambient-слоёв при typing** (в globals.css):

```css
/* пока канал печатает — мир замирает: фокус на тексте + свободный main-thread */
.shell-root[data-typing] .ritual-smoke__cloud,
.shell-root[data-typing] .constellation-star,
.shell-root[data-typing] .lunar-glyph,
.shell-root[data-typing] .ambient-sigil { animation-play-state: paused; }
.shell-root[data-typing] .ritual-smoke { opacity: .5; transition: opacity 1.2s ease; }
.shell-root[data-typing] .crt-noise { opacity: .35; transition: opacity .6s ease; }
```
(имена классов сверить с фактическими в globals.css: `star-twinkle`/`lunar-drift`/`smoke-drift-*` — ставить паузу на элементы с этими анимациями.)

- [ ] **Step 4: CSS — сглаживание steps()**: grep `steps(` в globals.css; заменить на `cubic-bezier(.3,.7,.2,1)` (или подходящие ease) везде КРОМЕ: `.blink`, braille-спиннера (`spin-braille`), `.flip-glitch`. `portrait-flicker steps(5)` → плавный opacity-keyframes (2 кадра: 0.85→1). `guide-loading-pulse steps(3)` → ease-in-out.
- [ ] **Step 5: Скролл** — в Shell `useLayoutEffect` (строки ~127-171): обернуть `el.scrollTo(...)` follow-ветку в rAF с отменой предыдущего (`scrollRafRef`), сохраняя существующую anchor-логику. smooth → оставить, но только если `!typingActivity.isActive()` (во время печати — `'auto'`, иначе smooth-скролл борется с текстом).
- [ ] **Step 6: Smoke + perf-проба** — PerformanceObserver в консоли: во время печати чтения 0 longtask > 50ms; после печати слои оживают.
- [ ] **Step 7: Commit** — `git commit -m "perf: pause ambient layers while typing, smooth easings, rAF scroll"`.

---

### Task 8: Readiness-driven reveal в `useSpread` (убить 950ms-хардкод)

**Files:**
- Modify: `web/src/hooks/useSpread.ts:137-184` (`handleFlip`)
- Read first: `web/src/hooks/useWhisper.ts` (механика pending-записей)

**Interfaces:**
- Consumes: `resolveWhisper`, `whisperReady` на entry, `push({kind:'pending'})`.
- Produces: после флипа последней карты: (a) whisper готов → пауза 750мс → push json; (b) не готов → pending «канал отвечает…» → по резолву минимум 600мс → push json. Никаких мёртвых пауз.

- [ ] **Step 1: Реализация** (в `handleFlip`, обе ветки — daily и spread):

```ts
const reveal = async () => {
  const interp = await resolveWhisper(entryId, entry.interpretation);
  if (!interp) return;
  await echoCmd('taro read --json');
  push({ kind: 'json', interpretation: interp, cards: ..., question: ..., spreadLabel: ... });
  pushOut([{ text: randomWhisper(characterId), tone: 'comment' }]);
  ...quotaLine...
  setMode('ОЖИДАНИЕ');
};
const waitReady = whisperReady ? sleep(750) : (async () => {
  push({ kind: 'pending', label: 'канал отвечает' });   // если useWhisper уже не ставит свой pending
  await resolveWhisper(...); // готовность
  await sleep(600);
})();
setTimeout(() => { void (async () => { await waitReady; await reveal(); })(); }, 250);
```
Если в useWhisper уже есть собственная pending-запись — НЕ дублировать: переиспользовать её и добавить только минимальную паузу 600мс после готовности. Итоговое поведение: флип → анимация флипа (~0.9s) → если готово: полсекунды тишины → чтение; если нет: видимое «канал отвечает…» до готовности + 600мс.

- [ ] **Step 2: Smoke** — на мок-API шёпот приходит быстро: пауза короткая и всегда «объяснённая». Замедлить мок до 5s (временно в mockApi) → виден pending, потом чтение. Вернуть быстрый мок.
- [ ] **Step 3: Commit** — `git commit -m "fix: reading reveal gated by whisper readiness, no dead 950ms wait"`.

---

### Task 9: Frontend-обвязка каталога: spreads.ts, commands, api, transcript, index, mockApi

**Files:**
- Create: `web/src/lib/spreads.ts`
- Modify: `web/src/lib/commands.ts`
- Modify: `web/src/lib/api.ts` (`spreadBegin`)
- Modify: `web/src/lib/transcript.ts` (`Entry`, `spreadLabelFromType`)
- Modify: `web/src/pages/index.tsx` (диспетчер, help)
- Modify: `web/src/lib/mockApi.ts`
- Test: `web/src/lib/__tests__/commands.test.ts` (если папки нет — создать)

**Interfaces:**
- Consumes: ответ `/api/spread/begin` v2 (`spread_id`, `spread_name`, `positions`, `position_keys`) — Task 3.
- Produces: `SPREADS: Record<string, FrontSpread>` где `FrontSpread = { id, name, aliases: string[], cmd, count, layout, needsQuestion, flipOrder: string[], positions: {key,name,desc}[] }`; `Cmd` вариант `{ kind: 'spread'; id: string; question: string | null }`; `useSpread.runSpread(spreadId, question)`. Entry `spread` — поля `spreadId, layout, flipOrder, count: number` (расширить с `1|3`).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/__tests__/commands.test.ts
import { describe, it, expect } from 'vitest';
import { parseCommand } from '@/lib/commands';

describe('spread commands', () => {
  it('parses new spreads with question', () => {
    expect(parseCommand('taro mfd что думает он')).toEqual({ kind: 'spread', id: 'mfd', question: 'что думает он' });
    expect(parseCommand('данет менять работу')).toEqual({ kind: 'spread', id: 'yesno', question: 'менять работу' });
    expect(parseCommand('пента кто я в этом')).toEqual({ kind: 'spread', id: 'pentagram', question: 'кто я в этом' });
    expect(parseCommand('подкова что будет')).toEqual({ kind: 'spread', id: 'horseshoe', question: 'что будет' });
  });
  it('shadow: bare = guide, with text = spread', () => {
    expect(parseCommand('тень')).toEqual({ kind: 'guide-set', id: 'shadow_walker' });
    expect(parseCommand('тень про смену работы')).toEqual({ kind: 'spread', id: 'shadow', question: 'про смену работы' });
  });
  it('spread without question opens question mode', () => {
    expect(parseCommand('taro mfd')).toEqual({ kind: 'spread', id: 'mfd', question: null });
  });
  it('legacy ask unchanged', () => {
    expect(parseCommand('taro ask вопрос')).toEqual({ kind: 'ask', question: 'вопрос', cards: 3 });
    expect(parseCommand('taro daily')).toEqual({ kind: 'daily' });
  });
});
```

Run: `cd taro_bot/web && npx vitest run src/lib/__tests__/commands.test.ts` → FAIL.

- [ ] **Step 2: `lib/spreads.ts`** — зеркало `data/spreads.json` (структура и тексты позиций — ТОЧНО как в Task 1; комментарий сверху: «Зеркало data/spreads.json — frontend не читает data/ в рантайме. Backend — источник правды.»). Экспорт `SPREADS`, `getFrontSpread(id)`.

- [ ] **Step 3: commands.ts** —
1. `Cmd` += `| { kind: 'spread'; id: string; question: string | null }`.
2. В `switch (bhead)` добавить проверку по алиасам раскладов ДО bare-guide-alias: собрать `SPREAD_ALIASES: Record<string,string>` из `SPREADS` (alias→id). Правило конфликта `тень`: если `GUIDE_ALIASES[head]` и `brest` пуст → guide-set; если head в SPREAD_ALIASES и `brest` непуст → spread с вопросом. Для остальных spread-алиасов — вопрос через тот же `extractQuestion(brest)` (без флагов --cards).
3. `case 'ask'/'ask1'` — не трогать (легаси). `case 'catalog'` — не трогать.

- [ ] **Step 4: api.ts** — `spreadBegin(spreadType: string | number, ...)`: тело `{ ..., spread_type: spreadType }` (строка id или легаси-число). `SpreadBeginResponse` += `spread_id?: string; spread_name?: string; position_keys?: string[];` (`positions?: string[]` остаётся).

- [ ] **Step 5: transcript.ts** — Entry `spread`: `count: number`, `spreadId?: string`, `layout?: string`, `flipOrder?: string[]`. `spreadLabelFromType`: для `spread_<id>` — имя из `SPREADS[id]?.name` (импорт из lib/spreads), легаси `daily/spread_1/spread_3` как было.

- [ ] **Step 6: useSpread.ts** — обобщить `runAsk` → `runSpread(spreadId: string, question: string | null)`:
- `const spread = getFrontSpread(spreadId)`;
- `API.spreadBegin(spreadId, question, characterId)`;
- эхо: `await echoCmd(spread.cmd + (question ? ` "${question}"` : ''))`;
- dealLines: `раздача: ${spread.count} аркана · ${spread.name}` + список позиций (из ответа `positions`);
- entry: `{ kind:'spread', cards, flipped: cards.map(()=>false), question, interpretation:null, spreadLabel: spread.name, count: spread.count, spreadId, layout: spread.layout, flipOrder: res.position_keys ?? spread.flipOrder, positions: res.positions }`;
- `runDaily` — без изменений (id `daily`). Экспортировать `runSpread` вместо `runAsk` (обновить index.tsx).

- [ ] **Step 7: index.tsx** —
1. `case 'spread'`: если `parsed.question == null && SPREADS[parsed.id]?.needsQuestion` → echo + `режим вопроса активирован` + `setPendingQuestion({ spreadId: parsed.id })` (PendingQuestion: `{ spreadId?: string; cards?: 1|3 }`); иначе `runSpread(parsed.id, parsed.question)`.
2. `handleSubmitInput` pending-ветка: если `spreadId` → `runSpread(spreadId, q)`, иначе легаси `runAsk`.
3. `typeParam`: '1'/'3'/'daily' — как было (легаси-ссылки); добавить приём строковых id ('mfd','pentagram',...) → pendingQuestion { spreadId } / runDaily.
4. `runHelp` — добавить строки новых команд в СИНТАКСИС:
```
taro mfd [вопрос]        мысли · чувства · действия
taro yesno [вопрос]      да / нет · вердикт
taro shadow [тема]       работа с тенью · 6 карт
taro pentagram [вопрос]  пентаграмма · элементы и суть
taro horseshoe [вопрос]  подкова · от ситуации к исходу
```
и в ОПИСАНИЕ строку `восемь раскладов: от карты дня до пентаграммы.`

- [ ] **Step 8: mockApi.ts** —
1. `begin`: `const sid = body.spread_type; const spread = SPREADS[sid] ?? {count: body.spread_type===3?3:1, ...}`; вернуть `count` карт, `spread_id`, `spread_name`, `positions` (имена из spread.positions; для three — существующие динамические), `position_keys`.
2. `poll`: для multi-card ответов вернуть `позиции: [{позиция, карта, реверс, трактовка}]` (по именам позиций из мок-расклада, трактовки — 2-3 предложения на позицию из существующих шаблонных фраз, расширить пул до 8 фраз), `связь_карт` (1 синтез-фраза), `intro/short_answer/advice` — как было. Для yesno: short_answer начинается с «Скорее да.» и т.п.
3. `/api/readings`: добавить пару записей с типами `spread_pentagram`, `spread_shadow` (interpretation с `позиции`).

- [ ] **Step 9: Tests pass + smoke** — `npx vitest run`; dev: `taro mfd вопрос` → 3 карты в ряд; `taro pentagram вопрос` → раздача 6 карт (пока все в column1/pyramid — раскладки в Task 10); `taro catalog` — 8 строк.

- [ ] **Step 10: Commit** — `git commit -m "feat: spread catalog plumbing (commands/api/transcript/mock) for 8 spreads"`.

---

### Task 10: `SpreadBlock` — геометрии раскладов + порядок флипа

**Files:**
- Modify: `web/src/components/shell/SpreadBlock.tsx` (переписать)
- Modify: `web/src/styles/globals.css` (геометрии)
- Modify: `web/src/components/shell/Shell.tsx` (прокинуть layout/flipOrder из entry)

**Interfaces:**
- Consumes: Entry `spread` с `layout`, `flipOrder`, `positions` (Task 9); Card без изменений.
- Produces: лейауты `column1 | trio | pyramid | spine | pentagram | arc`. Флип только по `flipOrder` (keys → индексы через positions array order: cards[i] ↔ positions[i]).

- [ ] **Step 1: Разметка геометрий.** Убрать `OFFSETS` (рандомные сдвиги — причина кривой пирамиды). Каждая карта в контейнере со своим label. Скелет:

```tsx
interface SpreadBlockProps {
  cards: TarotCard[]; flipped: boolean[];
  count: number; layout?: string;
  positions?: string[]; positionKeys?: string[]; flipOrder?: string[];
  singleLabel?: string; whisperReady?: boolean; characterId?: string;
  onFlip: (index: number) => void;
}
// nextIndex(): первый нефтёркнутый в порядке flipOrder; flipOrder отсутствует → слева направо.
// клик не по nextIndex → игнор + однократный CSS shake (класс на 300мс).
// hint: `вскрой: <имя следующей позиции>` когда не все флипнуты.
```

Лейауты (CSS-классы в globals.css, grid/flex, БЕЗ absolute кроме пентаграммы):
- `column1` — как текущий single (max-w 224px, центр).
- `trio` — `display:flex; gap:10px; justify-content:center;` каждая карта `max-width:31%`; позиции-метки под картами.
- `pyramid` — текущая пирамида БЕЗ OFFSETS: верх (позиция 2 по массиву [1]) над нижними [0] и [2], выравнивание `items-center`, нижний ряд `gap-3 max-w-[380px]`.
- `spine` — `display:grid; grid-template-columns: 1fr 1fr; gap:10px; max-width:340px; margin:auto;` левая колонка — карты 1-4 (стек), правая — 5-6 (стек с отступом сверху).
- `pentagram` — контейнер `position:relative; aspect-ratio: 1/1; max-width: 340px; margin:auto;` карты absolute, размеры `w-[27%]`:
```
center: left 36.5% top 36.5%
spirit: left 36.5% top 0
fire:   right 0   top 26%
water:  right 0   bottom 6%
earth:  left 0    bottom 6%
air:    left 0    top 26%
```
(по ключам позиций; карта `center` чуть крупнее `w-[30%]`).
- `arc` — `display:flex; flex-wrap:wrap; justify-content:center; gap:8px; max-width:360px; margin:auto;` 7 карт `w-[27%]`; вертикальные микросдвиги дугой через `style={{ marginTop: ARC_DY[i] }}` где `ARC_DY = [14,4,-2,-6,-2,4,14]`.

- [ ] **Step 2: Shell** — в `case 'spread'` передать `layout={entry.layout}`, `positionKeys={entry.positionKeys}`, `flipOrder={entry.flipOrder}` (добавить поля в transcript.ts, если Task 9 не добавил `positionKeys` — добавить в api SpreadBeginResponse и entry).
- [ ] **Step 3: Подсказка** — вместо `переверни карты · канал шепчет`: `вскрой: <позиция>` (`next position name` из positions/positionKeys) + `spread-hint--ready` вариант сохраняется.
- [ ] **Step 4: Smoke всех 8 раскладов** (мок): каждая геометрия выглядит ровно, флип строго по порядку, клик мимо очереди — shake. Пентаграмма: центр вскрывается последним.
- [ ] **Step 5: Commit** — `git commit -m "feat: spread layouts (trio/spine/pentagram/arc), ordered flip, aligned pyramid"`.

---

### Task 11: TuiMenu-каталог из данных + полировка меню/MOTD/help

**Files:**
- Modify: `web/src/components/shell/TuiMenu.tsx` (`catalogRows()` из `SPREADS`)
- Modify: `web/src/components/shell/MotdBlock.tsx` (стек-лейаут списка, футер)
- Modify: `web/src/components/shell/CommandBar.tsx` (чипы: 2 компактных ряда, приоритет daily/ask/catalog)
- Modify: `web/src/components/shell/HistoryBlock.tsx` (label из `spreadLabelFromType` — уже обобщён Task 9)
- Modify: `web/src/styles/globals.css` (menu-box фон+blur, чевроны, active-состояния, help-футер)
- Modify: `web/src/pages/index.tsx` (`runHelp` — уже расширен в Task 9; добавить ритуальный футер help)

**Interfaces:**
- Consumes: `SPREADS` (Task 9).
- Produces: каталог 8 строк: `{key: s.id, marker: i+1, label: s.name, desc: s.positions.map(p=>p.name).join(' · '), right: `${s.count} аркан(а/ов)`, cmd: s.cmd}` (для three desc: «динамический расклад по вопросу»).

- [ ] **Step 1: catalogRows из SPREADS** (порядок: daily, single, yesno, three, mfd, shadow, pentagram, horseshoe).
- [ ] **Step 2: menu-row чеврон + active:** в `mr-right` перед текстом `<span className="mr-chev">▸</span>`; CSS: `.menu-row--active { border-left: 2px solid var(--guide-accent); background: rgba(255,255,255,.06); }` `.menu-row { transition: background .25s ease, border-color .25s ease; }` `.mr-chev { color: var(--guide-accent); opacity: .6; }`
- [ ] **Step 3: menu-box фон:** `.menu-box { background: rgba(5,4,15,.85); backdrop-filter: blur(6px); border-color: rgba(255,255,255,.10); }` — перекрывает sigil. `.frame-ritual`, `.term-frame` — тот же фон (sigil-collision fix).
- [ ] **Step 4: AmbientSigil отодвинуть:** в Shell (или CSS) — sigil сдвинуть выше/левее и `opacity` ↓: `.sigil-wrap { top: -6%; right: -10%; opacity: .8; }` (класс обёртки сверить по факту; `sigil-dim` уже есть — усилить до `opacity:.45`).
- [ ] **Step 5: MOTD/help стек:** в MotdBlock список команд — описания ПОД командой (stack), не right-aligned (2 колонки рвутся на 390px). Help (`runHelp` в index.tsx): команды тоже стеком (`taro mfd [вопрос]` — перенос описания на следующую строку `desc`-тоном). Футер help/MOTD: `{ text: '# тени слушают · ' + randomWhisper(characterId), tone: 'faint' }`.
- [ ] **Step 6: Чипы CommandBar** — прочитать компонент; сгруппировать: ряд 1 `daily · ask · catalog`, ряд 2 `guides · history · sound`; уменьшить паддинги, убрать переносы на 3-4 строки.
- [ ] **Step 7: Гайды в меню** — `guideRows` уже рендерит `desc` целиком; убедиться, что CSS `.mr-desc` допускает 2 строки (`-webkit-line-clamp: 2;` вместо ellipsis-обрезки в одну).
- [ ] **Step 8: Smoke** — catalog 8 строк, всё читаемо, sigil не пересекает текст, чипы 2 ряда.
- [ ] **Step 9: Commit** — `git commit -m "feat: data-driven catalog menu, readable mobile stacks, sigil collision fix"`.

---

### Task 12-14: Проводники — углубление (по задаче на гайда)

**Files (в каждой):**
- Modify: `data/characters.json` — только объект соответствующего гайда
- Modify: `web/src/lib/guides.ts` — синхронно: `description`, `whispers`, `greetings`, новое поле `closings`
- Read first: `data/characters.json` (полностью), `core/prompts.py:1-150` (как поля попадают в промпт), `core/voice_gate.py` (score/bans)

**Interfaces (все три задачи):**
- Обязательные обновления на гайда: `persona` (переписать глубже, 4-6 предложений, с 2-3 характерными фишками), `diction.imagery` 10-14 слов, `diction.anti` пополнить, `rhythm`/`stance`/`lens` конкретнее, `taboo` 5-7 пунктов, `greetings` 5-6 вариантов, `whispers` 8-10 (синхронно в guides.ts), `closings` 6-8 (новое поле; синхронно в guides.ts), `voice_pool` 14-16 пар `{"q": ..., "intro": ..., "advice": ...}`, `entries` 5-6, `field_voice`/`daily_voice` освежить (упомянуть новые расклады), `reminder` — короткий финальный пинок голосу. `temperature` НЕ менять (0.85/0.55/1.0). Все тексты — русский, без эмодзи, в голосе гайда.
- Backend-зеркало: `web/src/lib/guides.ts` — `whispers`, `greetings`, `closings`, `description` копировать из characters.json 1:1.

Контент-требования (общие):

- **shadow_walker (Странница Теней, temp 0.85)** — полушёпот, «малыш», укрывает; образы: лес, луна, вода, свеча, мох, тени, тропы, туман; НЕ мистифицирует запугиванием. closings — укрывающие («иди спать, я постерегу»).
- **ruin_keeper (Хранитель Руин, temp 0.55)** — старый страж; нумерует истины («первое», «второе»); метафоры камня, руин, времени; короткие веские фразы; тепло без сюсюканья. closings — ставят точку («сказано»).
- **spark_of_chaos (Искра Хаоса, temp 1.0)** — трикстер-подруга; прозвища, «слушай, ну смотри», дерзость с теплом; образы: искры, костёр, ветер, смех. closings — подкалывают с любовью.
- voice_pool: каждая пара — реалистичный вопрос юзера (1 строка) + intro (1-2 предложения в голосе) + advice (1 предложение). Покрыть темы: работа, отношения, деньги, семья, саморазвитие, страх, решение, новость, тоска, надежда. ЗАПРЕЩЕНЫ: «карта означает», канцелярит, lists, эскапизм «всё будет хорошо».

- [ ] **Step 1: Переписать объект гайда в characters.json** (все поля выше).
- [ ] **Step 2: Синхронизировать guides.ts** (description/whispers/greetings/closings).
- [ ] **Step 3: Backend-тест голоса:** `cd taro_bot && .venv/bin/python -m pytest tests/ -k "voice or prompt" -v` → PASS (voice_gate не должен зарезать exemplars: проверить, что новые тексты не содержат banned words).
- [ ] **Step 4: Commit** — `git commit -m "content: deepen <guide> voice (pool 16, closings, quirks)"`.

---

### Task 15: Финальный.sync контента + статус-контекст + мелкие фиксы карт

**Files:**
- Modify: `web/src/lib/guides.ts` (финальная сверка полей-близнецов с characters.json)
- Modify: `web/src/components/Card.tsx` (убрать mirrored title — найти transform scaleX(-1)/rotate(180) на имени карты; оставить лёгкий глитч-класс)
- Modify: `web/src/components/shell/Shell.tsx` (statusline: показывать контекст — имя расклада при РАСКЛАД/ЧТЕНИЕ: расширить ShellMode-подпись, `-- ${mode} --` → `-- ${mode}${spreadCtx ? ' · ' + spreadCtx : ''} --`; spreadCtx прокинуть пропсом из index (последний активный spreadLabel в entries))
- Modify: `web/src/styles/globals.css` (card-frame margin-top 8px от титлбара; `.entry-pad` верхний отступ)

- [ ] **Step 1: Diff-сверка близнецов** — скриптом или глазами: whispers/greetings/closings/guides-описания идентичны.
- [ ] **Step 2: Card mirror fix + frame clip fix.**
- [ ] **Step 3: Statusline-контекст.**
- [ ] **Step 4: Commit** — `git commit -m "polish: twin-content sync, card title unmirrored, statusline spread context"`.

---

### Task 16: Верификация — Playwright-тур v2, jank-замер, build, docs

**Files:**
- Create: `scripts/e2e_tour.mjs` (Playwright-тур, на базе существующего скрипта)
- Modify: `docs/DESIGN.md` (переписать под текущую реальность)
- Build: `cd web && npm run build` (static export → `static/webapp`)

- [ ] **Step 1: Скрипт тура** — расширить тур: все 8 раскладов (команда → флипы по порядку → чтение), скриншоты каждой фазы в `docs/assets/tour-v2/`, jank-проба (PerformanceObserver longtask) на фазе печати чтения — цель **0 long tasks > 50ms**. Скрипт снаружи node_modules: `createRequire` от `web/package.json`, запуск `cd web && node ../scripts/e2e_tour.mjs`.
- [ ] **Step 2: pytest/vitest полный прогон** — `cd taro_bot && .venv/bin/python -m pytest tests/ -v` и `cd web && npx vitest run` → всё PASS.
- [ ] **Step 3: Build** — `cd web && npm run build` → export в `static/webapp` без ошибок; smoke prod-сборки через `python3 scripts/serve_webapp_mock.py` (порт 3000).
- [ ] **Step 4: docs/DESIGN.md** — актуализировать: палитры, шрифты (JetBrains Mono + Cormorant Garamond), движок typing (typeFlow), каталог 8 раскладов (таблица), closings, is-typing механика. Удалить описания несуществующих компонентов.
- [ ] **Step 5: Финальный отчёт юзеру** — до/после скриншоты, jank-метрика, список изменений.

---

## Приложение A: `data/spreads.json` (вставить целиком в Task 1 Step 3)

(Содержимое — см. Task 1 Step 3 в плане; файл создаётся целиком из блока JSON выше.)

## Зависимости и параллелизация

- Независимые сразу: Task 1, Task 4, Task 12, Task 13, Task 14.
- После Task 1: Tasks 2→3, Task 9.
- После Task 4: Tasks 5, 6, 7, 8 (7 зависит от 4/5 — begin/end в обоих типерах; можно после 5).
- После Task 9: Tasks 10, 11.
- После Tasks 12-14: Task 15.
- Финал: Task 16 (после всех).

## Приложение A: `data/spreads.json` — полное содержимое (Task 1 Step 3)

```json
{
  "version": 1,
  "spreads": {
    "daily": {
      "id": "daily", "name": "карта дня", "aliases": ["день", "daily", "дневная", "карта"],
      "cmd": "taro daily", "count": 1, "mode": "daily", "layout": "column1",
      "needs_question": false, "flip_order": ["p1"],
      "positions": [{"key": "p1", "name": "энергия дня", "desc": "главный сигнал сегодняшнего дня"}],
      "synthesis": null, "quota_cost": 1
    },
    "single": {
      "id": "single", "name": "одна карта", "aliases": ["одна", "one", "ask1"],
      "cmd": "taro ask1", "count": 1, "mode": "single", "layout": "column1",
      "needs_question": true, "flip_order": ["p1"],
      "positions": [{"key": "p1", "name": "суть ответа", "desc": "прямой ответ на вопрос"}],
      "synthesis": null, "quota_cost": 1
    },
    "yesno": {
      "id": "yesno", "name": "да / нет", "aliases": ["данет", "да-нет", "yesno"],
      "cmd": "taro yesno", "count": 3, "mode": "yesno", "layout": "trio",
      "needs_question": true, "flip_order": ["p1", "p2", "p3"],
      "positions": [
        {"key": "p1", "name": "за", "desc": "что говорит «да»"},
        {"key": "p2", "name": "против", "desc": "что говорит «нет»"},
        {"key": "p3", "name": "совет", "desc": "как поступить с этим"}
      ],
      "synthesis": "вердикт одной фразой: да / скорее да / скорее нет / нет — первой фразой short_answer",
      "quota_cost": 1
    },
    "three": {
      "id": "three", "name": "три карты", "aliases": ["три", "ask", "спроси"],
      "cmd": "taro ask", "count": 3, "mode": "three", "layout": "pyramid",
      "needs_question": false, "flip_order": ["p1", "p2", "p3"],
      "positions": [
        {"key": "p1", "name": "позиция 1", "desc": "вычисляется бэкендом по вопросу"},
        {"key": "p2", "name": "позиция 2", "desc": "вычисляется бэкендом по вопросу"},
        {"key": "p3", "name": "позиция 3", "desc": "вычисляется бэкендом по вопросу"}
      ],
      "synthesis": "как карты усиливают / сталкиваются / переходят друг в друга",
      "quota_cost": 1
    },
    "mfd": {
      "id": "mfd", "name": "мысли · чувства · действия", "aliases": ["чувства", "мчд", "mfd"],
      "cmd": "taro mfd", "count": 3, "mode": "mfd", "layout": "trio",
      "needs_question": true, "flip_order": ["p1", "p2", "p3"],
      "positions": [
        {"key": "p1", "name": "мысли", "desc": "что этот человек думает — вслух и про себя"},
        {"key": "p2", "name": "чувства", "desc": "что он чувствует на самом деле, под словами"},
        {"key": "p3", "name": "действия", "desc": "как это выйдет наружу — что он будет делать"}
      ],
      "synthesis": "где мысль расходится с чувством и что из этого дойдёт до действий",
      "quota_cost": 1
    },
    "shadow": {
      "id": "shadow", "name": "тень", "aliases": ["тень-расклад", "shadow-work", "shadow"],
      "cmd": "taro shadow", "count": 6, "mode": "shadow", "layout": "spine",
      "needs_question": false, "flip_order": ["p1", "p2", "p3", "p4", "p5", "p6"],
      "positions": [
        {"key": "p1", "name": "что я скрываю", "desc": "что во мне прячется за этой темой"},
        {"key": "p2", "name": "почему я это скрываю", "desc": "где и когда прятать стало безопаснее"},
        {"key": "p3", "name": "что скрывание защищает", "desc": "какую выгоду оно всё ещё даёт"},
        {"key": "p4", "name": "что оно стоит", "desc": "цена в энергии, честности, отношениях"},
        {"key": "p5", "name": "путь интеграции", "desc": "какое внутреннее разрешение вернёт это к свету"},
        {"key": "p6", "name": "следующий шаг", "desc": "одно маленькое конкретное действие на ближайшую неделю"}
      ],
      "synthesis": "переход от диагностики (позиции 1-4) к действию (5-6); спуск без надрыва",
      "quota_cost": 1
    },
    "pentagram": {
      "id": "pentagram", "name": "пентаграмма", "aliases": ["пента", "пентаграмма", "pent"],
      "cmd": "taro pentagram", "count": 6, "mode": "pentagram", "layout": "pentagram",
      "needs_question": true,
      "flip_order": ["earth", "air", "water", "fire", "spirit", "center"],
      "positions": [
        {"key": "center", "name": "сигнификатор", "desc": "суть ситуации; кто ты в ней. вскрывается последней"},
        {"key": "spirit", "name": "дух", "desc": "квинтэссенция; сквозная линия, объединяющая всё. не предсказание"},
        {"key": "fire", "name": "огонь", "desc": "воля, импульс, что рвётся вперёд"},
        {"key": "water", "name": "вода", "desc": "чувства, интуиция, невысказанное"},
        {"key": "earth", "name": "земля", "desc": "тело, деньги, дом, опора"},
        {"key": "air", "name": "воздух", "desc": "мысль, слово, ясность; истории, которые мы себе рассказываем"}
      ],
      "synthesis": "какой элемент доминирует, какой голодает, какие два в диалоге; дух — не событие, а рамка",
      "quota_cost": 1
    },
    "horseshoe": {
      "id": "horseshoe", "name": "подкова", "aliases": ["подкова", "shoe", "horseshoe"],
      "cmd": "taro horseshoe", "count": 7, "mode": "horseshoe", "layout": "arc",
      "needs_question": true, "flip_order": ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
      "positions": [
        {"key": "p1", "name": "ситуация", "desc": "что происходит сейчас, на чём стоишь"},
        {"key": "p2", "name": "скрытое", "desc": "чего не видно изнутри ситуации"},
        {"key": "p3", "name": "препятствие", "desc": "что встаёт на пути"},
        {"key": "p4", "name": "внешнее", "desc": "люди и обстоятельства со стороны"},
        {"key": "p5", "name": "твоя позиция", "desc": "твой ресурс и твоя роль в этом"},
        {"key": "p6", "name": "чужая позиция", "desc": "другая сторона: что у них на уме"},
        {"key": "p7", "name": "исход", "desc": "куда ведёт текущая линия, если ничего не менять"}
      ],
      "synthesis": "линия от ситуации к исходу: где она гнётся и что на это влияет",
      "quota_cost": 1
    }
  }
}
```

Примечание к «three»: имена позиций в JSON — плейсхолдеры; бэкенд всегда вычисляет их через `_positions_for_question(question)` и отдаёт в ответе, JSON-позиции для three нигде не рендерятся напрямую.
