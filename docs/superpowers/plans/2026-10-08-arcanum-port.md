# ARCANUM Port to taro_bot — Implementation Plan

> **Для агентов-исполнителей:** обязательно использовать `superpowers:subagent-driven-development` (или `superpowers:executing-plans`) и идти по таскам строго по порядку. Шаги помечены чекбоксами (`- [ ]`).

**Goal:** Заменить фронт Telegram Mini App на ARCANUM (Next.js 16 App Router, static export), перенеся всю серверную логику z.ai-снапшота в Python-бэкенд (aiohttp + наш LLM-роутер + единый SQLite), затем провести редизайн-раунд (сигил/шум/луна/кнопки/boot-лого) и TG-шару раскладов через нашего бота.

**Architecture:** Фронт собирается `output:'export'` → `static/webapp/` (aiohttp раздаёт статику; GH Actions пайплайн сохраняется). Клиент шлёт `initData` в каждом запросе; Python верифицирует подпись и работает от tg_id. Все z.ai API-роуты из фронта удаляются; их логика (промпты, streak, ask/forecast/week/month, share) переезжает в `core/` + `app.py`. LLM — `core/llm.py::call_llm_with_fallback` (Zen + OpenRouter). БД — существующий SQLite: users + 4 новые колонки, readings без изменения схемы.

**Spec:** `docs/superpowers/specs/2026-10-08-arcanum-port-design.md` — читать вместе с планом; все решения аргументированы в спеке.

**Источники-снапшоты** (далее `SNAP3`, `SNAP4`):
- SNAP3 = `/Users/omr/Library/Application Support/JetBrains/DataSpell2026.1/projects/workspace/temp_files/workspace-b1fbe2d0-cee9-4243-bbad-7bf11dc9d650 (3)` — база (раунды 1–9)
- SNAP4 = `/Users/omr/Library/Application Support/JetBrains/DataSpell2026.1/projects/workspace/temp_files/workspace-b1fbe2d0-cee9-4243-bbad-7bf11dc9d650 (4)` — фикс-ветка (чери-пики в Task 12)

## Global Constraints

- Репозиторий `taro_bot` (GitHub-профиль). Коммиты: author `omr <omar56055@gmail.com>`, сообщения conventional (`feat:`, `fix:`, `test:`, `chore:`), без секретов.
- Node 20, npm. Обязателен `web/package-lock.json` в git (`bun.lock` не переносить). CI (`ci-frontend.yml`) запускает `npx tsc --noEmit`, `npm test`, `npm run build` в `./web`.
- Python 3.12; **новых runtime-зависимостей нет** (aiogram/httpx/aiosqlite/aiohttp уже в requirements.txt; pytest/pytest-asyncio тоже).
- `BOT_TOKEN`/ключи — только из `config.settings`/env; в код и коммиты не попадают.
- В TypeScript не добавлять новых `as any` / `@ts-ignore` (единственное легаси-исключение — существующее `cards_data: any` в api.ts, не трогать).
- Все новые пользовательские строки — русский, терминальный тон; LLM-вывод — без эмодзи (strip обязателен).
- Все новые анимации фронта — под `prefers-reduced-motion`; целевой экран — мобайл 390px без горизонтального переполнения.
- z.ai-костыли не переносить: `thinking:{type:'disabled'}`, system как `role:'assistant'`, cookie `taro_uid`, Prisma, `z-ai-web-dev-sdk`.
- Контракт фронт↔бэк: имена полей — как в SNAP3 `src/lib/api.ts` (см. Interfaces каждого таска). При расхождении правится клиент, не Python (кроме новых эндпоинтов — их контракт определён в плане).

## Review Focus

1. **initData протухает через 24ч** при долгом простое Mini App: запрос отдаёт 401 `{"error":"unauthorized"}` — клиент показывает терминальную строку ошибки, не падает; после переоткрытия WebApp работает. (Пин: ручной чек в Task 16; хендлер-тесты фиксируют 401-шейп.)
2. **Легаси-строки журнала** (старый шейп interpretation, `cards_data` массив vs объект): журнал/эхо/хроника рендерятся без крэша. (Пин: vitest-кейс legacy в Task 3 + ручной прогон на старой БД в Task 16.)
3. **Share из восстановленного сеанса**: токен живого чтения сохранён в json-записи; после рестарта сервера share по токену резолвится (владелец тот же) либо честно падает с фолбэком «скачать .txt», не крэшем. (Пин: pytest в Task 10 + ручной чек Task 16.)
4. **Таймзоны streak**: сервер хранит UTC-строки, клиент шлёт локальный час — gap-математика только по UTC-датам, иначе серия «рассветов» врёт на границе суток. (Пин: pytest сценарий C в Task 5.)
5. **Static export под aiohttp**: `/_next/static/` вечный кэш + gzip; новый билд обязан отдаваться так же (index.html на `/`, ассеты по хэшам). (Пин: локальный прогон `python app.py` в Task 1 и Task 16.)

---

### Task 1: Фронт-скелет — замена web/ на ARCANUM + static export

**Files:**
- Delete: `web/**` (старый Next 15 фронт; `static/webapp/` не трогать — это артефакт сборки)
- Create (копия из SNAP3): `web/src/**` (кроме удаляемого в Step 3), `web/public/**`, `web/components.json`, `web/eslint.config.mjs`, `web/postcss.config.mjs`, `web/tailwind.config.ts`, `web/tsconfig.json`
- Create (новый): `web/package.json`, `web/next.config.ts`

**Interfaces:** Produces фронт-базу ARCANUM в `web/`, собираемую в `static/webapp/`. Следующие таски правят только отдельные файлы внутри `web/src/`.

- [ ] **Step 1: Удалить старый фронт**

```bash
git rm -r web/
```

- [ ] **Step 2: Скопировать ARCANUM из SNAP3**

```bash
SNAP3="/Users/omr/Library/Application Support/JetBrains/DataSpell2026.1/projects/workspace/temp_files/workspace-b1fbe2d0-cee9-4243-bbad-7bf11dc9d650 (3)"
mkdir -p web
cp -R "$SNAP3/src" web/src
cp -R "$SNAP3/public" web/public
cp "$SNAP3/components.json" "$SNAP3/eslint.config.mjs" "$SNAP3/postcss.config.mjs" "$SNAP3/tailwind.config.ts" "$SNAP3/tsconfig.json" web/
```

- [ ] **Step 3: Удалить серверный слой z.ai из копии**

```bash
rm -rf web/src/app/api
rm -f web/src/lib/db.ts
rm -rf web/src/server
```

Обоснование: `src/app/api/*` — route handlers (несовместимы с `output:'export'`, сборка упадёт); `src/lib/db.ts` — Prisma-клиент; `src/server/*` (characters, deck, jobs, prompts, reading, user — verified listing) — серверная логика, переезжает в Python (Tasks 7–10). Проверка отсутствия клиентских импортов удалённого:

```bash
grep -rn "from '@/server/\|from '@/lib/db'" web/src --include='*.ts' --include='*.tsx' && echo "FAIL: есть импорты серверного слоя" || echo "OK"
```

Note: `web/src/lib/guides.ts` — клиентский (остаётся); `src/lib/{moon,arcana,echo,commands,week,scroll,sound,...}.ts` — клиентские чистые функции (остаются, покрываются тестами в Task 3).

- [ ] **Step 4: next.config.ts (static export по паттерну старого web/next.config.mjs)**

Создать `web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  devIndicators: false,
  output: isProd ? 'export' : undefined,
  distDir: isProd ? '../static/webapp' : '.next',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
```

- [ ] **Step 5: package.json — deps/scripts**

Взять `SNAP3/package.json` за основу: из dependencies удалить `z-ai-web-dev-sdk`, `prisma`, `@prisma/client`, `next-auth` (клиентом не используются); scripts заменить на:

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

В devDependencies добавить `"vitest": "^2"`, `"jsdom": "^24"`. `typescript.ignoreBuildErrors` из next.config SNAP3 НЕ переносится — сборка должна быть чистой. В tsconfig проверить `"paths": { "@/*": ["./src/*"] }` — оставить как есть.

- [ ] **Step 6: npm install + lock-файл**

```bash
cd web && rm -f bun.lock && npm install
git add package.json package-lock.json
```

- [ ] **Step 7: Верификация сборки**

```bash
cd web && npx tsc --noEmit && npm run build
ls ../static/webapp/index.html
```

Expected: tsc без ошибок; build OK; `static/webapp/index.html` + `static/webapp/cards/*.png` + `static/webapp/guides/*.png` на месте. Затем `python app.py` из корня taro_bot — сервер поднимается, `curl -s http://localhost:8080/ | head` отдаёт HTML арканума.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: replace Mini App frontend with ARCANUM (static export skeleton)"
```

---

### Task 2: initData-клиент — авторизация во всех запросах + history→readings

**Files:**
- Modify: `web/src/lib/api.ts` (единственная точка fetch)

**Interfaces:**
- `function init_data(): string` — приватный хелпер модуля.
- Все функции api.ts шлют initData: GET → query-параметр `init_data`; POST → поле body `init_data`. Журнал — `/api/readings`. Python (Tasks 6–10) читает именно эти поля.

- [ ] **Step 1: Хелпер initData с dev-моком**

В `web/src/lib/api.ts` после импортов:

```ts
/** Telegram initData для авторизации каждого запроса.
 *  Dev-мок: NEXT_PUBLIC_DEV_MOCK_INITDATA — только локальная разработка,
 *  в проде Python отвергнет такие данные (подпись не совпадёт). */
function init_data(): string {
  if (typeof window === 'undefined') return '';
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp;
  if (tg?.initData) return tg.initData;
  return (process.env.NEXT_PUBLIC_DEV_MOCK_INITDATA as string | undefined) ?? '';
}
```

- [ ] **Step 2: Приклеить init_data ко всем запросам**

- `spreadBegin`: body + `init_data: init_data()` (первым полем).
- `spreadPoll`: URL → `` `/api/spread/poll?token=${encodeURIComponent(token)}&init_data=${encodeURIComponent(init_data())}` ``.
- `getCharacter`: `/api/character?init_data=${encodeURIComponent(init_data())}`.
- `setCharacter`: body + `init_data: init_data()`.
- `getReadings` / `getReadingsDays` / `getAllReadings`: путь `/api/history` → `/api/readings` + `&init_data=${encodeURIComponent(init_data())}`.
- `getStats`: `/api/stats?init_data=${encodeURIComponent(init_data())}`.
- `askFollowup`, `askWeek`, `askMonth`, `dayForecast`: каждый body + `init_data: init_data()`.

- [ ] **Step 3: Верификация**

```bash
cd web && npx tsc --noEmit
grep -rn "'/api/history" src/ && echo "FAIL: старый путь жив" || echo "OK"
grep -c "init_data" src/lib/api.ts   # >= 12 (каждый вызов + хелпер)
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/api.ts && git commit -m "feat: attach Telegram initData to every API request; /api/history -> /api/readings"
```

---

### Task 3: vitest — юнит-тесты чистых функций фронта

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/src/lib/__tests__/moon.test.ts`, `arcana.test.ts`, `echo.test.ts`, `commands.test.ts`, `week.test.ts`, `scroll.test.ts`

**Interfaces:**
- Consumes: чистые функции SNAP3 `src/lib/{moon,arcana,echo,commands,week,scroll}.ts` (скопированы в Task 1 без изменений).
- Produces: `npm test` зелёный в CI (`ci-frontend.yml` шаг `npm test` обязателен).

- [ ] **Step 1: vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 2: moon.test.ts — математика луны**

```ts
import { describe, it, expect } from 'vitest';
import { moonPhase } from '../moon';

describe('moonPhase', () => {
  it('2000-01-06 — новолуние (эпоха формулы)', () => {
    const p = moonPhase(new Date('2000-01-06T18:14:00Z'));
    expect(p.phaseIndex).toBe(0);
    expect(p.illum).toBeLessThan(0.05);
  });
  it('2026-10-26 — полнолуние 100%', () => {
    const p = moonPhase(new Date('2026-10-26T00:00:00Z'));
    expect(p.phaseIndex).toBe(4);
    expect(p.illum).toBeGreaterThan(0.95);
  });
  it('illum в [0,1], nextFull/nextNew положительны', () => {
    for (let d = 0; d < 30; d++) {
      const p = moonPhase(new Date(2026, 9, 1 + d));
      expect(p.illum).toBeGreaterThanOrEqual(0);
      expect(p.illum).toBeLessThanOrEqual(1);
      expect(p.nextFull).toBeGreaterThan(0);
      expect(p.nextNew).toBeGreaterThan(0);
    }
  });
});
```

(Имена полей `phaseIndex/illum/nextFull/nextNew` сверить с реальным `src/lib/moon.ts`; если отличаются — тест адаптируется под фактические имена, НЕ код под тест.)

- [ ] **Step 3: arcana.test.ts — нумерология**

```ts
import { describe, it, expect } from 'vitest';
import { parseBirthDate, computeArcana } from '../arcana';

describe('parseBirthDate', () => {
  it('нормализует дд.мм.гггг', () => expect(parseBirthDate('25.03.1990')?.normalized).toBe('25.03.1990'));
  it('отвергает мусор', () => {
    for (const bad of ['99.99.9999', '32.01.2000', '13.13.2000', '01.01.1899', '01.01.2101', '25031990']) {
      expect(parseBirthDate(bad)).toBeNull();
    }
  });
});

describe('computeArcana', () => {
  it('25.03.1990 → 29 → 11', () => {
    const r = computeArcana('25.03.1990');
    expect(r.number).toBe(11);
  });
  it('08.09.2003 → 22 → Шут (ветвление 22→0)', () => {
    expect(computeArcana('08.09.2003').number).toBe(0);
  });
  it('15.06.1985 → 35 → 8', () => expect(computeArcana('15.06.1985').number).toBe(8));
});
```

- [ ] **Step 4: echo/commands/week/scroll — компактные тесты**

`echo.test.ts` (порог ≥2 общих карт, свежие <3 мин исключены, excludeDbId, сортировка по совпадениям→дате, топ-3; фикстура-row: `{id, created_at, question, cards_data:{cards:[{name}]}, spread_type, character_id}`).

`commands.test.ts` (алиасы: `taro pentagram`→spread, `колода`/`cards`→library, `man taro`→help (бонус-фикс 3-c), `taro месяц`→month, `taro луна`→moon, `taro arcana 25.03.1990`→arcana не съедается как вопрос).

`week.test.ts` (`buildWeekDigest([])` → total 0; реверс и прямая одной карты = один голос).

`scroll.test.ts` (`buildScrollText`: filename вида `свиток-дд.мм.гггг-чч.мм.txt`; строки рамки одной длины).

- [ ] **Step 5: Запуск**

```bash
cd web && npm test
```

Expected: все зелёные. Расхождение сигнатур → правится ТЕСТ под реальный код (снапшот — истина), кроме реального бага в снапшоте (тогда фикс + комментарий).

- [ ] **Step 6: Commit**

```bash
git add web/vitest.config.ts web/src/lib/__tests__ web/package.json web/package-lock.json
git commit -m "test: vitest unit coverage for ARCANUM pure functions"
```

---

### Task 4: Python — миграция users (серии) + модель User

**Files:**
- Modify: `storage/db.py` (`_migrate_schema` — список `migrations`; `get_user_by_tg_id` — SELECT + маппинг строки)
- Modify: `storage/models.py` (`User`)
- Test: `tests/test_migration_streak.py`

**Interfaces:** Produces колонки `users.streak_days INTEGER DEFAULT 0`, `users.last_daily_at TEXT`, `users.morning_streak INTEGER DEFAULT 0`, `users.last_morning_at TEXT`; поля `User.streak_days: int = 0`, `User.last_daily_at: str | None = None`, `User.morning_streak: int = 0`, `User.last_morning_at: str | None = None`. Tasks 5–6 их читают.

- [ ] **Step 1: Падающие тесты** — `tests/test_migration_streak.py`:

```python
import pytest
import pytest_asyncio
import storage.db as sdb

@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None

@pytest.mark.asyncio
async def test_users_has_streak_columns(db):
    cursor = await db.execute("PRAGMA table_info(users)")
    cols = {row[1] for row in await cursor.fetchall()}
    assert {"streak_days", "last_daily_at", "morning_streak", "last_morning_at"} <= cols

@pytest.mark.asyncio
async def test_migration_idempotent(tmp_path):
    path = str(tmp_path / "t2.db")
    c1 = await sdb.init_db(path)
    await c1.close()
    c2 = await sdb.init_db(path)  # второй прогон не падает
    await c2.close()
    sdb._db_connection = None

@pytest.mark.asyncio
async def test_get_user_returns_new_fields(db):
    await sdb.get_or_create_user(db, 424242)
    fresh = await sdb.get_user_by_tg_id(db, 424242)
    assert fresh is not None
    assert fresh.streak_days == 0 and fresh.morning_streak == 0
    assert fresh.last_daily_at is None and fresh.last_morning_at is None
```

Run: `pytest tests/test_migration_streak.py -v` → Expected: FAIL (колонок/полей нет).

- [ ] **Step 2: Миграция + модель**

В `storage/db.py` в список `migrations` внутри `_migrate_schema` добавить:

```python
        "ALTER TABLE users ADD COLUMN streak_days INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_daily_at TEXT",
        "ALTER TABLE users ADD COLUMN morning_streak INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_morning_at TEXT",
```

В `storage/models.py` в `User` добавить:

```python
    streak_days: int = 0
    last_daily_at: str | None = None
    morning_streak: int = 0
    last_morning_at: str | None = None
```

В `storage/db.py::get_user_by_tg_id` расширить SELECT и маппинг строки четырьмя полями (порядок: `..., subscription_end, first_month_done, streak_days, last_daily_at, morning_streak, last_morning_at`), сохранив существующий способ конструирования `User` из строки.

- [ ] **Step 3: Тесты зелёные + регресс**

```bash
pytest tests/test_migration_streak.py -v && pytest tests/ -x -q
```

- [ ] **Step 4: Commit**

```bash
git add storage/db.py storage/models.py tests/test_migration_streak.py
git commit -m "feat: streak columns on users (daily series + morning ritual)"
```

---

### Task 5: Python — core/ritual.py (порт touchDailyStreak)

**Files:**
- Create: `core/ritual.py`
- Test: `tests/test_ritual.py`

**Interfaces:**
- Consumes: `User` из Task 4.
- Produces: `async def touch_daily_streak(db, user: User, local_hour: int | None, now: datetime | None = None) -> dict` → `{"counted": bool, "morning": bool, "streakDays": int, "morningStreak": int}` (camelCase — контракт клиента). Обновляет строку users. Task 6 вызывает из `handle_spread_begin`. Параметр `now` — для тестируемости.

- [ ] **Step 1: Падающие тесты — 5 сценариев (worklog 8-d)**

`tests/test_ritual.py`:

```python
from datetime import datetime, timezone
import pytest
import pytest_asyncio
import storage.db as sdb
from core.ritual import touch_daily_streak

UTC = timezone.utc

def _dt(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)

@pytest_asyncio.fixture
async def env(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    user = await sdb.get_or_create_user(conn, 777)
    yield conn, user
    await conn.close()
    sdb._db_connection = None

async def _fresh(db):
    return await sdb.get_user_by_tg_id(db, 777)

@pytest.mark.asyncio
async def test_A_morning_then_morning(env):
    db, user = env
    r1 = await touch_daily_streak(db, user, 9, now=_dt("2026-10-06 07:00:00"))
    assert r1 == {"counted": True, "morning": True, "streakDays": 1, "morningStreak": 1}
    r2 = await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-07 08:00:00"))
    assert r2["counted"] and r2["streakDays"] == 2 and r2["morningStreak"] == 2

@pytest.mark.asyncio
async def test_B_morning_after_skip(env):
    db, user = env
    await touch_daily_streak(db, user, 9, now=_dt("2026-10-06 07:00:00"))
    r = await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-09 07:00:00"))
    assert r["streakDays"] == 1 and r["morningStreak"] == 1  # обе серии оборвались

@pytest.mark.asyncio
async def test_C_evening_freezes_morning(env):
    db, user = env
    await touch_daily_streak(db, user, 9, now=_dt("2026-10-05 07:00:00"))
    await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-06 07:00:00"))
    r = await touch_daily_streak(db, await _fresh(db), 20, now=_dt("2026-10-07 20:00:00"))
    assert r["counted"] and r["streakDays"] == 3
    assert r["morningStreak"] == 2 and r["morning"] is False  # заморозка, не сброс

@pytest.mark.asyncio
async def test_D_same_day_repeat_not_counted(env):
    db, user = env
    await touch_daily_streak(db, user, 9, now=_dt("2026-10-06 07:00:00"))
    r = await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-06 11:00:00"))
    assert r["counted"] is False and r["streakDays"] == 1

@pytest.mark.asyncio
async def test_E_first_evening_no_morning(env):
    db, user = env
    r = await touch_daily_streak(db, user, 21, now=_dt("2026-10-06 21:00:00"))
    assert r == {"counted": True, "morning": False, "streakDays": 1, "morningStreak": 0}
```

Run: `pytest tests/test_ritual.py -v` → FAIL (core.ritual не существует).

- [ ] **Step 2: Реализация — дословный порт семантики SNAP3 src/server/user.ts::touchDailyStreak**

`core/ritual.py`:

```python
# core/ritual.py — серии карты дня («рассветы»).
# Порт SNAP3 src/server/user.ts::touchDailyStreak 1:1 по семантике:
#   · streakDays — все карты дня подряд;
#   · morningStreak растёт только при тяге до полудня (локальный час < 12)
#     и только если вчера рассвет тоже был пойман (gap == 1);
#   · после полудня серия рассветов ЗАМОРАЖИВАЕТСЯ (не рвётся, не растёт);
#     рвётся пропуском утреннего ритуала на следующий день;
#   · час присылает КЛИЕНТ — ритуал в таймзоне оператора.
# Метки времени — UTC-строки "YYYY-MM-DD HH:MM:SS" (как datetime('now') в SQLite):
# gap-математика всегда по UTC, локальность учитывается только часом клиента.
from __future__ import annotations

from datetime import datetime, timezone

_FMT = "%Y-%m-%d %H:%M:%S"


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts.replace("T", " "), _FMT).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _start_of_day(d: datetime) -> datetime:
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _fmt(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime(_FMT)


async def touch_daily_streak(db, user, local_hour: int | None, now: datetime | None = None) -> dict:
    """Обновить серии после карты дня; вернуть итог ритуала для клиента."""
    now = now or datetime.now(timezone.utc)
    morning = isinstance(local_hour, int) and 0 <= local_hour < 12

    last = _parse(user.last_daily_at)
    if last is None:  # первый ритуал вообще
        morning_streak = 1 if morning else 0
        await db.execute(
            "UPDATE users SET streak_days = 1, last_daily_at = ?, morning_streak = ?, "
            "last_morning_at = CASE WHEN ? THEN ? ELSE last_morning_at END WHERE id = ?",
            (_fmt(now), morning_streak, morning, _fmt(now), user.id),
        )
        await db.commit()
        return {"counted": True, "morning": morning, "streakDays": 1, "morningStreak": morning_streak}

    gap_days = (_start_of_day(now) - _start_of_day(last)).days
    if gap_days == 0:  # уже отмечен сегодня — серии стоят на месте
        return {"counted": False, "morning": morning,
                "streakDays": user.streak_days, "morningStreak": user.morning_streak}

    streak = user.streak_days + 1 if gap_days == 1 else 1

    morning_streak = user.morning_streak
    if morning:
        last_m = _parse(user.last_morning_at)
        m_gap = (_start_of_day(now) - _start_of_day(last_m)).days if last_m else None
        morning_streak = user.morning_streak + 1 if m_gap == 1 else 1

    await db.execute(
        "UPDATE users SET streak_days = ?, last_daily_at = ?, morning_streak = ?, "
        "last_morning_at = CASE WHEN ? THEN ? ELSE last_morning_at END WHERE id = ?",
        (streak, _fmt(now), morning_streak, morning, _fmt(now), user.id),
    )
    await db.commit()
    return {"counted": True, "morning": morning, "streakDays": streak, "morningStreak": morning_streak}
```

- [ ] **Step 3: Тесты зелёные**

```bash
pytest tests/test_ritual.py -v
```

Expected: 5 PASS. Если сценарий C красный — проверь, что gap-математика идёт по `_start_of_day` UTC-дат, а не по абсолютным часам.

- [ ] **Step 4: Commit**

```bash
git add core/ritual.py tests/test_ritual.py
git commit -m "feat: daily/morning streak engine (port of z.ai touchDailyStreak)"
```

---

### Task 6: Python — /api/stats + daily_ritual в spread/begin + ветки readings (days/all)

**Files:**
- Modify: `app.py` (`handle_stats` — новый; `handle_spread_begin` — local_hour/daily_ritual; `handle_readings` — ветки; `create_webapp` — роут)
- Modify: `storage/db.py` (`count_user_readings`, `count_user_readings_grouped`, `get_user_readings_days`, `get_user_readings_all`)
- Test: `tests/test_api_stats.py`, `tests/test_readings_branches.py`

**Interfaces:**
- Consumes: Task 4 (колонки users), Task 5 (`touch_daily_streak`), существующие `verify_telegram_init_data`, `reserve_quota`.
- Produces (контракт клиента из SNAP3 api.ts):
  - `GET /api/stats?init_data=` → `{"streakDays": int, "totalReadings": int, "lastDailyAt": str|null, "morningStreak": int, "lastMorningAt": str|null, "guideReadings": {char_id: n}, "spreadCounts": {raw_type: n}}`; 401 `{"error":"unauthorized"}` при невалидном initData; нулевые группы guideReadings не отдаются.
  - `POST /api/spread/begin`: к существующему ответу добавляется `"daily_ritual": {counted, morning, streakDays, morningStreak}` ТОЛЬКО когда резолвнутый `spread["id"] == "daily"` (семантика SNAP3: raw-проверка после resolve; легаси-числа считаются daily, если резолвятся в daily) и клиент прислал валидный `local_hour` (int 0–23).
  - `GET /api/readings?days=N` (int 1–62, приоритет над year/month, take 400) и `?all=1` (take 500) → тот же `{"readings": [...]}`.

- [ ] **Step 1: Падающие тесты**

`tests/test_api_stats.py` (паттерн `_make_init_data` — из `tests/test_analytics.py`; request-дабл):

```python
import json
import pytest
import pytest_asyncio
import app as app_module
import storage.db as sdb
from tests.test_analytics import _make_init_data


class _FakeRequest:
    def __init__(self, query, json_body=None):
        self.query = query
        self._json = json_body or {}
        self.app = {}

    async def json(self):
        return self._json


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


@pytest.mark.asyncio
async def test_stats_shape(db):
    await sdb.get_or_create_user(db, 1001)
    resp = await app_module.handle_stats(_FakeRequest({"init_data": _make_init_data(1001)}))
    assert resp.status == 200
    data = json.loads(resp.body)
    assert set(data) >= {"streakDays", "totalReadings", "lastDailyAt", "morningStreak",
                         "lastMorningAt", "guideReadings", "spreadCounts"}
    assert data["totalReadings"] == 0 and data["guideReadings"] == {}

@pytest.mark.asyncio
async def test_stats_unauthorized():
    resp = await app_module.handle_stats(_FakeRequest({"init_data": "garbage"}))
    assert resp.status == 401
```

`tests/test_readings_branches.py` — три теста в том же стиле (seed через прямой INSERT reading-строк с нужными created_at, затем `handle_readings` с query `?days=7&init_data=...`):

```python
async def test_readings_days_window(db): ...      # строки старше окна не возвращаются
async def test_readings_all(db): ...              # весь журнал, take 500
async def test_days_priority_over_month(db): ...  # days=7+year=2025 → работает окно days
```

- [ ] **Step 2: Запуск — падение**

Run: `pytest tests/test_api_stats.py tests/test_readings_branches.py -v` → FAIL (`handle_stats` не существует / веток нет).

- [ ] **Step 3: Реализация**

`app.py`:

```python
GUIDE_IDS = ("shadow_walker", "ruin_keeper", "spark_of_chaos")  # если константы ещё нет

async def handle_stats(request):
    user = verify_telegram_init_data(request.query.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    tg_id = user.get("id", 0)
    db = await get_db()
    row = await get_user_by_tg_id(db, tg_id)
    return web.json_response({
        "streakDays": row.streak_days if row else 0,
        "totalReadings": await count_user_readings(db, tg_id),   # истина из строк (урок 6-b)
        "lastDailyAt": row.last_daily_at if row else None,
        "morningStreak": row.morning_streak if row else 0,
        "lastMorningAt": row.last_morning_at if row else None,
        "guideReadings": await count_user_readings_grouped(db, tg_id, "character_id", GUIDE_IDS),
        "spreadCounts": await count_user_readings_grouped(db, tg_id, "type", None),
    })
```

`storage/db.py` — новые хелперы (по паттерну `get_user_readings_by_month`; тот же SELECT-список полей):

```python
async def count_user_readings(db, tg_id: int) -> int:
    # SELECT COUNT(*) FROM readings WHERE user_id=?

async def count_user_readings_grouped(db, tg_id: int, group_col: str, allowed) -> dict:
    # SELECT {col}, COUNT(*) FROM readings WHERE user_id=? GROUP BY {col}
    # allowed — фильтр по значению; нулевые группы невозможны по определению GROUP BY

async def get_user_readings_days(db, tg_id: int, days: int, take: int = 400) -> list:
    # WHERE user_id=? AND created_at >= datetime('now', '-{days} days') ORDER BY created_at DESC LIMIT take

async def get_user_readings_all(db, tg_id: int, take: int = 500) -> list:
    # весь журнал, ORDER BY created_at DESC LIMIT take
```

`handle_readings` — до ветки year/month добавить:

```python
    all_raw = request.query.get("all", "")
    days_raw = request.query.get("days", "")
    if all_raw == "1":
        return web.json_response({"readings": await get_user_readings_all(db, tg_id)})
    if days_raw:
        try:
            days = min(62, max(1, int(float(days_raw))))
        except ValueError:
            days = 0
        if days:
            return web.json_response({"readings": await get_user_readings_days(db, tg_id, days)})
```

`handle_spread_begin` — после резолва спреда, до резерва квоты/карт:

```python
    local_hour_raw = body.get("local_hour")
    try:
        local_hour = int(local_hour_raw) if local_hour_raw is not None else None
    except (TypeError, ValueError):
        local_hour = None
    if local_hour is not None and not (0 <= local_hour <= 23):
        local_hour = None
    daily_ritual = None
    if spread.get("id") == "daily" and local_hour is not None:
        user_row = await get_or_create_user(db, tg_id)
        daily_ritual = await touch_daily_streak(db, user_row, local_hour)
```

и в успешный `json_response` добавить `...({"daily_ritual": daily_ritual} if daily_ritual else {})`. Импорт: `from core.ritual import touch_daily_streak`.

`create_webapp`: `app.router.add_get('/api/stats', handle_stats)`.

- [ ] **Step 4: Тесты зелёные + регресс**

```bash
pytest tests/test_api_stats.py tests/test_readings_branches.py tests/ -x -q
```

- [ ] **Step 5: Commit**

```bash
git add app.py storage/db.py tests/test_api_stats.py tests/test_readings_branches.py
git commit -m "feat: /api/stats, daily_ritual in spread/begin, readings days/all branches"
```

---

### Task 7: Python — промпты ARCANUM (reading v2) + валидация нового шейпа

**Files:**
- Modify: `core/prompts.py` (`get_system_prompt` — блок «10 приёмов ремесла»; `build_reading_prompt` — JSON-схема ARCANUM; новые билдеры follow-up/pair/forecast/week/month)
- Modify: `core/llm.py` (`validate_interpretation` — новый шейп с толерантностью к легаси)
- Test: `tests/test_prompts_arcanum.py`

**Interfaces:**
- Consumes: `data/characters.json` (голоса — НЕ переносятся из z.ai, Python-структура остаётся), SNAP3 `src/server/prompts.ts` (тексты блоков копировать дословно).
- Produces:
  - `get_system_prompt(character_id, avoid_texts=None, voice_examples=None) -> str` — прежняя сигнатура, текст расширен блоком ремесла.
  - `build_reading_prompt(cards, question, character_id, spread, positions, voice_reminder=None) -> str` — просит JSON строго с ключами: `intro, short_answer, advice, позиции: [{позиция, карта, реверс, трактовка}], связь_карт?, проявление?, на_что_смотреть?, траектория? {утро, день, вечер}, card_meaning?` (мульти-карты: позиции + связь_карт; single/daily: intro + short_answer + advice + card_meaning; daily: + траектория).
  - `build_follow_up_prompt(card: dict, ctx: dict) -> str`, `build_pair_prompt(cards: list[dict], ctx: dict) -> str` (стихии Golden Dawn + нумерология `number` + pairBridgePhrase), `build_day_forecast_prompt(card: dict) -> str` (strict-JSON, «тяжёлая карта — не сладить, но дать траекторию»), `build_week_prompt(digest: dict, character_id: str) -> str`, `build_month_prompt(digest: dict, character_id: str) -> str` (Tasks 8–9).
  - `validate_interpretation(parsed, cards, question, spread_type=1) -> dict | None` — принимает новый шейп (обязательны непустые `intro` и `short_answer`; если `позиции` присутствует — list длиной len(cards)); легаси-шейп не валидирует, но и не ломает (возвращает как есть → клиент нормализует).

- [ ] **Step 1: Падающие тесты** — `tests/test_prompts_arcanum.py`:

```python
from core.prompts import get_system_prompt, build_reading_prompt, build_day_forecast_prompt
from core.llm import validate_interpretation

CARDS = [
    {"id": "the-fool", "name": "Шут", "orientation": "прямое", "upright": "н", "reversed": "п"},
    {"id": "the-magician", "name": "Маг", "orientation": "перевернутое", "upright": "н", "reversed": "п"},
]

def test_system_prompt_has_craft_block():
    p = get_system_prompt("shadow_walker")
    assert "позиция фильтрует карту" in p      # маркер «10 приёмов ремесла»
    assert "элементальные соответствия" in p   # блок Golden Dawn
    assert "эмодзи" in p

def test_reading_prompt_requests_arcanum_json():
    p = build_reading_prompt(CARDS, "цель?", "shadow_walker",
                             {"id": "horseshoe", "name": "подкова", "count": 3},
                             ["за", "против", "совет"])
    assert "позиции" in p and "short_answer" in p and "связь_карт" in p and "JSON" in p

def test_forecast_prompt_strict_json():
    p = build_day_forecast_prompt({"name": "Солнце", "orientation": "прямое"})
    for key in ("лозунг", "утро", "день", "вечер", "фокус", "тонус", "удача", "общение", "глоток"):
        assert key in p

def test_validate_interpretation_new_shape():
    good = {"intro": "и", "short_answer": "с",
            "позиции": [{"позиция": "за", "карта": "Шут", "реверс": False, "трактовка": "т"}] * 2}
    assert validate_interpretation(good, CARDS, "в") is not None
    assert validate_interpretation({"intro": "", "short_answer": "с"}, CARDS, "в") is None
    assert validate_interpretation({"intro": "и", "short_answer": "с", "позиции": []}, CARDS, "в") is None

def test_validate_interpretation_legacy_passthrough():
    legacy = {"intro": "и", "short_answer": "с", "card_meaning": "м", "advice": "а"}
    assert validate_interpretation(legacy, CARDS, "в") is not None
```

- [ ] **Step 2: Запуск — падение** (`pytest tests/test_prompts_arcanum.py -v` → маркеров/билдеров нет).

- [ ] **Step 3: Перенос текстов из SNAP3 src/server/prompts.ts**

Скопировать ДОСЛОВНО (адаптируя в python-строки): блок «10 приёмов ремесла» (позиция фильтрует карту; пары карт; элементы Golden Dawn; повторы чисел/стихий; вес мажоров; придворные роли; реверс как блокировка; исход как траектория; один рассказ; вопрос меняет карту), анти-клише бан, скан-подсказку повторов, режимные правила по раскладам (`getSpreadRules`-часть), `buildFollowUpPrompt`, `buildPairPrompt`, `buildDayForecastPrompt`, промпты week/month из `SNAP3/src/app/api/{week,month}/route.ts`. Каркас вызова в `build_reading_prompt` сохраняет существующий Python (voice core + голосовые примеры + reminder) — заменяется только JSON-схема/правила на ARCANUM.

- [ ] **Step 4: validate_interpretation — новый шейп**

В `core/llm.py` переписать: обязательные непустые `intro`, `short_answer`; опциональные `позиции` (list, len == len(cards), каждый элемент с непустыми `карта`/`трактовка`), `связь_карт`, `проявление`, `на_что_смотреть`, `траектория` (dict с необязательными утро/день/вечер), `card_meaning`, `advice`. Вернуть нормализованный dict (лишние ключи отбросить, `strip_emojis` по всем строкам). Легаси-ключи (`card_meaning` без `позиции` для single) — валидны.

- [ ] **Step 5: Тесты зелёные + регресс**

```bash
pytest tests/test_prompts_arcanum.py tests/test_prompts_spreads.py tests/test_llm_reliability.py -v
```

(Старые тесты промптов при несовместимости ассертов обновить под новый текст — семантика «просит JSON, без эмодзи» сохраняется.)

- [ ] **Step 6: Commit**

```bash
git add core/prompts.py core/llm.py tests/test_prompts_arcanum.py
git commit -m "feat: ARCANUM reading prompts (craft block, new interpretation JSON) + validator v2"
```

---

### Task 8: Python — /api/ask (карта и пара) + /api/forecast + локальные фолбэки

**Files:**
- Create: `core/fallbacks.py`
- Modify: `app.py` (`handle_ask`, `handle_forecast`, `_ask_llm`-обёртка, роуты)
- Test: `tests/test_ask_forecast.py`

**Interfaces:**
- Consumes: Task 7 (`build_follow_up_prompt`, `build_pair_prompt`, `build_day_forecast_prompt`, `get_system_prompt`), `core/llm.py::call_llm_with_fallback`, `core/tarot.py` (карты; name→карта индекс), `strip_emojis`.
- Produces:
  - `POST /api/ask` body `{init_data, question, card?|cards?, spread_name, spread_question, reading_summary, character_id}` → `{"answer": str, "fallback": bool}`; 400 «нужны ровно две карты» (len(cards)!=2), 400 «карты не опознаны» (name не резолвится в cards.json), 400 «карта не указана» (нет card и cards); 2 попытки LLM → `local_followup_fallback` / `local_pair_fallback`.
  - `POST /api/forecast` body `{init_data, card: {name, is_reversed?}, character_id}` → `{"forecast": {лозунг, утро, день, вечер, фокус, тонус, удача, общение, глоток}, "fallback": bool}`; strict-JSON + clamp int 0–10 → `local_day_forecast`.
  - `core/fallbacks.py::sanitize_llm_text(text) -> str` — срез ```-заборов, strip_emojis, collapse `\n{3,}`, trim; ответ < 20 символов → фолбэк.
  - Тестируемая обёртка LLM: `app.py::_ask_llm(messages, **kw)` (monkeypatch-точка).

- [ ] **Step 1: Падающие тесты** — `tests/test_ask_forecast.py` (request-дабл `_FakeRequest` — как в Task 6; `_make_init_data` — как в Task 6):

```python
import json
import pytest
import pytest_asyncio
import app as app_module
import core.fallbacks as fb
import storage.db as sdb
from tests.test_analytics import _make_init_data
from tests.test_api_stats import _FakeRequest

@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None

@pytest.mark.asyncio
async def test_ask_single_ok(db, monkeypatch):
    async def fake_llm(messages, **kw):
        return "Тени говорят одно: подожди до четверга. ```\nс мусором\n``` 🌙"
    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    body = {"init_data": _make_init_data(2001), "question": "ждать?",
            "card": {"name": "Луна", "position": "совет"},
            "spread_name": "карта дня", "spread_question": None,
            "reading_summary": "кратко", "character_id": "shadow_walker"}
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    data = json.loads(resp.body)
    assert resp.status == 200 and data["fallback"] is False
    assert "```" not in data["answer"] and "🌙" not in data["answer"]

@pytest.mark.asyncio
async def test_ask_pair_validation(db):
    body = {"init_data": _make_init_data(2001), "question": "q",
            "cards": [{"name": "Луна"}], "spread_name": "s", "spread_question": None,
            "reading_summary": "r", "character_id": "shadow_walker"}
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    assert resp.status == 400 and "две" in json.loads(resp.body)["error"]
    body["cards"] = [{"name": "Луна"}, {"name": "Единорог"}]
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    assert resp.status == 400 and "не опознаны" in json.loads(resp.body)["error"]

@pytest.mark.asyncio
async def test_ask_fallback_on_llm_garbage(db, monkeypatch):
    async def garbage(messages, **kw):
        return "ок"  # < 20 символов → фолбэк
    monkeypatch.setattr(app_module, "_ask_llm", garbage)
    body = {"init_data": _make_init_data(2001), "question": "q",
            "card": {"name": "Луна", "position": "совет"}, "spread_name": "s",
            "spread_question": None, "reading_summary": "r", "character_id": "shadow_walker"}
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    data = json.loads(resp.body)
    assert data["fallback"] is True and len(data["answer"]) >= 20

@pytest.mark.asyncio
async def test_forecast_clamps(db, monkeypatch):
    async def fake_llm(messages, **kw):
        return json.dumps({"лозунг": "Держи курс", "утро": "у", "день": "д", "вечер": "в",
                           "фокус": "ф", "тонус": 99, "удача": -3, "общение": 5, "глоток": "г"},
                          ensure_ascii=False)
    monkeypatch.setattr(app_module, "_forecast_llm", fake_llm)
    resp = await app_module.handle_forecast(_FakeRequest({}, {
        "init_data": _make_init_data(2001), "card": {"name": "Солнце"},
        "character_id": "spark_of_chaos"}))
    f = json.loads(resp.body)["forecast"]
    assert f["тонус"] == 10 and f["удача"] == 0

def test_sanitize_strips_fences_and_emoji():
    assert "```" not in fb.sanitize_llm_text("```x\nтекст\n```")
    assert "🌙" not in fb.sanitize_llm_text("текст 🌙")
```

- [ ] **Step 2: Запуск — падение** (`pytest tests/test_ask_forecast.py -v` → core.fallbacks/handle_ask не существуют).

- [ ] **Step 3: Реализация core/fallbacks.py** — порт локальных фолбэков SNAP3 (`src/app/api/ask/route.ts::localFallback/localPairFallback`, `src/app/api/forecast/route.ts::localDayForecast`):

```python
# core/fallbacks.py — детерминированные фолбэки ask/pair/forecast.
# Тексты строятся из data/cards.json значений + голосовых полей characters.json.
def sanitize_llm_text(text: str) -> str:
    ...  # срезать ```-заборы (в т.ч. ```json), strip_emojis, collapse \n{3,}, trim

def local_followup_fallback(card: dict, ctx: dict) -> str: ...
    # значения карты + голос персонажа
def local_pair_fallback(card_a: dict, card_b: dict, ctx: dict) -> str: ...
    # формула связи + pairBridgePhrase
def local_day_forecast(card: dict) -> dict: ...
    # числа от номера аркана (порт SNAP3)
```

- [ ] **Step 4: Реализация app.py::handle_ask** (каркас; `load_cards_index` — lru_cache name→карта из `core/tarot`):

```python
async def _ask_llm(messages, **kw):  # тонкая обёртка для тестируемости
    return await call_llm_with_fallback(messages, **kw)

async def handle_ask(request):
    body = await request.json()
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    question = _clean_str(body.get("question"), 500)
    spread_name = _clean_str(body.get("spread_name"), 100)
    spread_question = _clean_str(body.get("spread_question"), 500) if body.get("spread_question") else None
    summary = _clean_str(body.get("reading_summary"), 1000)
    character_id = body.get("character_id") if body.get("character_id") in CHARACTER_IDS else "shadow_walker"
    deck = load_cards_index()  # name -> card dict
    pair = card_entry = None
    if isinstance(body.get("cards"), list):
        if len(body["cards"]) != 2:
            return web.json_response({"error": "нужны ровно две карты"}, status=400)
        pair = []
        for c in body["cards"]:
            entry = deck.get(_clean_str(c.get("name"), 100))
            if not entry:
                return web.json_response({"error": "карты не опознаны"}, status=400)
            pair.append({**entry, "position": _clean_str(c.get("position"), 100) or None,
                         "is_reversed": bool(c.get("is_reversed"))})
    elif isinstance(body.get("card"), dict):
        entry = deck.get(_clean_str(body["card"].get("name"), 100))
        if not entry:
            return web.json_response({"error": "карты не опознаны"}, status=400)
        card_entry = {**entry, "position": _clean_str(body["card"].get("position"), 100) or None,
                      "is_reversed": bool(body["card"].get("is_reversed"))}
    else:
        return web.json_response({"error": "карта не указана"}, status=400)

    ctx = {"question": question, "spread_name": spread_name,
           "spread_question": spread_question, "reading_summary": summary}
    system = get_system_prompt(character_id)
    user_prompt = build_pair_prompt(pair, ctx) if pair else build_follow_up_prompt(card_entry, ctx)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}]
    answer = ""
    for _ in range(2):
        raw = sanitize_llm_text(await _ask_llm(messages, max_tokens=900, temperature=0.85))
        if len(raw) >= 20:
            answer = raw
            break
    fallback = not answer
    if fallback:
        answer = local_pair_fallback(pair[0], pair[1], ctx) if pair else local_followup_fallback(card_entry, ctx)
    return web.json_response({"answer": answer, "fallback": fallback})
```

- [ ] **Step 5: Реализация handle_forecast** — аналогично: резолв карты, `build_day_forecast_prompt`, парс через `_extract_json` (вынести JSON-экстрактор из llm.py в переиспользуемую функцию), clamp int-полей 0–10, обязательные строки; 2 попытки → `local_day_forecast`; ответ `{"forecast": {...}, "fallback": bool}`. Обёртка `_forecast_llm` (monkeypatch-точка).

- [ ] **Step 6: Роуты + зелёные тесты + регресс**

```python
app.router.add_post('/api/ask', handle_ask)
app.router.add_post('/api/forecast', handle_forecast)
```

```bash
pytest tests/test_ask_forecast.py tests/ -x -q
```

- [ ] **Step 7: Commit**

```bash
git add core/fallbacks.py app.py tests/test_ask_forecast.py
git commit -m "feat: /api/ask (single+pair) and /api/forecast with deterministic fallbacks"
```

---

### Task 9: Python — /api/week + /api/month

**Files:**
- Modify: `core/prompts.py` (`build_week_prompt`, `build_month_prompt` — если не закрыты Task 7)
- Modify: `app.py` (`handle_week`, `handle_month`, роуты)
- Test: `tests/test_week_month.py`

**Interfaces:**
- Consumes: Task 7/8 (`get_system_prompt`, `_ask_llm`, `sanitize_llm_text`).
- Produces:
  - `POST /api/week` body `{init_data, digest: WeekDigestPayload, character_id}` → `{"answer": str, "fallback": bool}`. Валидация: `total > 0` иначе 400 «за неделю не было чтений»; `days_active ≤ 7`; `card_counts`: ключи ≤60 симв, значения clamp 0–999, сортировка по убыванию, топ-8; `questions`: строки ≤80 симв, максимум 5; `date_from/date_to` строки ≤40.
  - `POST /api/month` — аналогично (MonthDigestPayload: `days` массив ≤62 `{day, count}`, `majors` int, `suit_counts` map; total==0 → 400).
  - Промпт: ОДИН абзац 3–5 предложений, связывать числа (не пересчитывать), тон проводника, финал — короткий вопрос оператору от колоды; 2 попытки → детерминированный фолбэк из топ-карты («неделя прошла под знаком «X» — она выпала N раз…» / месячный аналог).

- [ ] **Step 1: Падающие тесты** — валидация без LLM (clamp/truncate/top-N/400), happy-path с monkeypatched `_ask_llm` → `{"answer": ..., "fallback": False}`, мусорный digest → 400. Структура — как Task 8.
- [ ] **Step 2: Запуск — падение**
- [ ] **Step 3: Реализация** — `_validate_counts(raw, max_items=8)` и `_clean_questions(raw, max=5, max_len=80)` в `core/fallbacks.py`; хендлеры по образцу `handle_ask`; роуты `/api/week`, `/api/month`; фолбэки `local_week_reflection(digest)` / `local_month_reflection(digest)` из топ-карты `digest["card_counts"]`.
- [ ] **Step 4: Тесты зелёные + регресс** — `pytest tests/test_week_month.py tests/ -x -q`
- [ ] **Step 5: Commit**

```bash
git add core/prompts.py core/fallbacks.py app.py tests/test_week_month.py
git commit -m "feat: /api/week and /api/month reflections with validation and fallbacks"
```

---

### Task 10: Python — /api/share (отправка расклада в ТГ через нашего бота)

**Files:**
- Create: `core/tg_share.py`
- Modify: `app.py` (`handle_share`, роут; `create_webapp(bot)` — прокинуть Bot; `main()` — передать bot)
- Modify: `storage/db.py` (`get_reading_by_id`, если нет)
- Test: `tests/test_tg_share.py`

**Interfaces:**
- Consumes: `verify_telegram_init_data` (user.id → chat_id), существующий `get_reading_by_token`, новый `get_reading_by_id(db, reading_id)`, `data/cards.json` (`filename`), `static/webapp/cards/*.png`, aiogram `Bot` (`send_photo`, `send_media_group`, `send_message`), `config.settings`.
- Produces:
  - `POST /api/share` body `{init_data, token?: str, reading_id?: int}` → `{"ok": true}`; 400 если не передан ни token, ни reading_id; 404 если строка не найдена/чужая/не `completed`; 502 `{"error": "телеграм не принял сообщение"}` при ошибке Telegram API.
  - `core/tg_share.py::resolve_reading(db, tg_id, token=None, reading_id=None) -> Reading | None` — по client_token И user, либо по id И user; статус обязательно `completed`.
  - `core/tg_share.py::build_share_message(reading_row, deck_index) -> tuple[list[dict] | None, list[str]]` — `(media, text_parts)`: media = список `{"type": "photo", "media": <bytes/path>, "caption": html≤1024}` (1 карта → sendPhoto, 2–10 → sendMediaGroup); text_parts — куски ≤3800. Guard путей: `filename` обязан матчить `^[a-z0-9-]+\.png$` и резолвиться внутрь `static/webapp/cards/` (без `..`).
  - `core/tg_share.py::send_share(bot, chat_id, media, text_parts) -> None` — sendPhoto/sendMediaGroup (caption на первом фото) + sendMessage частями, `parse_mode="HTML"`, `disable_web_page_preview=True`. HTML-эскейп ОБЯЗАТЕЛЕН для вопросов/карт/проводника (`html.escape`).

- [ ] **Step 1: Падающие тесты** — `tests/test_tg_share.py` (FakeBot — запись вызовов):

```python
import html
import json
import pytest
import app as app_module
from core.tg_share import build_share_message, resolve_reading

class FakeBot:
    def __init__(self):
        self.calls = []

    async def send_photo(self, chat_id, photo, caption=None, parse_mode=None, **kw):
        self.calls.append(("photo", chat_id, caption, parse_mode))

    async def send_media_group(self, chat_id, media, **kw):
        self.calls.append(("group", chat_id, media))

    async def send_message(self, chat_id, text, parse_mode=None, **kw):
        self.calls.append(("msg", chat_id, text, parse_mode))

# Тесты (в стиле Task 6/8):
# 1) resolve_reading по токену (seed reading с client_token + STATUS_COMPLETED) → найден;
#    чужой user → None; не-completed → None.
# 2) resolve_reading по reading_id + владелец; чужой id → None.
# 3) handle_share: нет token/reading_id → 400; невалидный initData → 401;
#    чужая строка → 404.
# 4) build_share_message: caption с html.escape(question); text_parts ≤3800;
#    filename-guard: "../evil.png" → часть без фото (только текст).
# 5) send_share с FakeBot: 1 карта → ("photo", ...); 3 карты → ("group", ...) + ("msg", ...).
# 6) Монkeypatch FakeBot в app['bot'] → handle_share → {"ok": true}.
```

- [ ] **Step 2: Запуск — падение** (`pytest tests/test_tg_share.py -v`).
- [ ] **Step 3: Реализация core/tg_share.py** — `resolve_reading`, `build_share_message` (deck_index: id→filename из cards.json), `send_share` (aiogram-вызовы, `FSInputFile`/`BufferedInputFile` для PNG; guard путей через `pathlib` resolve + проверка родителя).
- [ ] **Step 4: Реализация app.py** — `create_webapp(bot)` сохраняет `app["bot"] = bot`; в `main()` вызов обновить (`create_webapp(bot)`); `handle_share`:

```python
async def handle_share(request):
    body = await request.json()
    user = verify_telegram_init_data(body.get("init_data", ""))
    if not user:
        return web.json_response({"error": "unauthorized"}, status=401)
    token = _clean_str(body.get("token"), 64) or None
    reading_id = body.get("reading_id")
    if not token and not reading_id:
        return web.json_response({"error": "нечем поделиться"}, status=400)
    db = await get_db()
    row = await resolve_reading(db, user["id"], token=token, reading_id=reading_id)
    if row is None:
        return web.json_response({"error": "чтение не найдено"}, status=404)
    media, text_parts = build_share_message(row, load_deck_filenames())
    try:
        await send_share(request.app["bot"], user["id"], media, text_parts)
    except TelegramAPIError:
        return web.json_response({"error": "телеграм не принял сообщение"}, status=502)
    return web.json_response({"ok": True})
```

Роут: `app.router.add_post('/api/share', handle_share)`.

- [ ] **Step 5: Тесты зелёные + регресс** — `pytest tests/test_tg_share.py tests/ -x -q`
- [ ] **Step 6: Commit**

```bash
git add core/tg_share.py app.py storage/db.py tests/test_tg_share.py
git commit -m "feat: /api/share — send spread card images + caption via our bot"
```

---

### Task 11: Фронт — проводка новых API (stats/ритуал/forecast/week/month/ask/share)

**Files:**
- Modify: `web/src/lib/api.ts` (новые функции `getStats` уже есть — добавить `shareReading`, `dayForecast` уже есть; сверить сигнатуры с Python-контрактом)
- Modify: `web/src/components/ArcanumApp.tsx` (джойн daily_ritual из begin-ответа в state; хендлеры недели/месяца/прогноза/поделиться)
- Modify: `web/src/components/StatsPanel.tsx` (серии «рассветов»/карт дня из /api/stats)
- Modify: `web/src/components/MoonPhasePanel.tsx` (прогноз дня через /api/forecast)
- Modify: `web/src/components/WeekPanel.tsx`, `MonthPanel.tsx` (отправка digest → `answer` от бэкенда)
- Modify: `web/src/components/ScrollView.tsx` / `TuiMenu.tsx` (кнопка «отправить в терминал» → /api/share + фолбэк .txt)

**Interfaces:**
- Consumes: Tasks 6, 8, 9, 10 (Python-контракты выше).
- Produces: живая связка фронта с Python-бэкендом; все телеметрические панели работают на реальных данных.

- [ ] **Step 1: api.ts — недостающие функции**

```ts
// /api/share — «отправить в терминал»
export interface ShareResponse { ok: boolean; error?: string }
export async function shareReading(initData: string, payload: { token?: string; reading_id?: number }): Promise<ShareResponse> {
  const r = await fetch('/api/share', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData, ...payload }),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error((b as { error?: string }).error ?? 'не удалось отправить');
  }
  return (await r.json()) as ShareResponse;
}
```

(Сигнатуры `getStats`/`dayForecast`/`askWeek`/`askMonth`/`askFollowup` сверить с контрактом Python — они уже есть в api.ts SNAP3; поменять только путь/поля, если расходятся.)

- [ ] **Step 2: ArcanumApp.tsx — daily_ritual**

В хендлере `spreadBegin`: из ответа begin достать `daily_ritual` (опционально) → `setStats(prev => ({...prev, streakDays: dr.streakDays, morningStreak: dr.morningStreak, ...}))` или обновить локальный state ритуала. Семантика SNAP3: counted=false → тост «уже отмечено» не показываем (тишина).

- [ ] **Step 3: Статистика** — `StatsPanel.tsx` грузит `/api/stats` при маунте (или по колбэку из ArcanumApp): серии карт дня и рассветов, распределение по проводникам и раскладам (guideReadings/spreadCounts).

- [ ] **Step 4: Панели неделю/месяц/прогноз** — WeekPanel/MonthPanel строят digest локально (buildWeekDigest/buildMonthDigest уже в lib) и шлют на бэкенд; ответ `answer` рендерится как ответ проводника, `fallback: true` — со строкой «отражение от колоды (без связи с эфиром)». MoonPhasePanel: кнопка «прогноз дня» → `/api/forecast` с картой дня.

- [ ] **Step 5: Шара** — в ScrollView/меню чтения: кнопка «отправить в терминал» → `shareReading(init_data, {token, reading_id})`; при ошибке (502/сеть) — фолбэк: скачивание .txt через `buildScrollText` (уже есть). Токен живого чтения берём из state сеанса; для записей журнала — `reading_id`.

- [ ] **Step 6: Верификация**

```bash
cd web && npx tsc --noEmit && npm test && npm run build
```

Плюс ручной прогон: `python app.py`, Telegram WebApp локально (dev-мок initData) — begin с daily возвращает ритуал, статистика заполняется.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat: wire frontend to Python backend (stats, ritual, forecast, week/month, share)"
```

---

### Task 12: Чери-пики из SNAP4 (фикс-ветка) + удаление TG-гейтвея

**Files:**
- Modify (порт вручную, файлы копировать НЕ целиком): `web/src/components/CrtOverlay.tsx`, `web/src/components/AmbientSigil.tsx`, `web/src/components/MoonGlyph.tsx`, `web/src/components/CommandBar.tsx`, `web/src/components/ArcanumApp.tsx`, `web/src/lib/sound.ts`, `web/src/app/globals.css`
- Delete (не переносить из SNAP4): `web/src/components/TgSetupBlock.tsx`, `web/src/lib/tg.ts`, `web/src/app/api/tg/**`

**Interfaces:**
- Consumes: SNAP4-версии перечисленных компонентов (diff-основа), SNAP3-архитектура (initData-клиент вместо TG-гейтвея).
- Produces: фронт SNAP3 + все визуальные/поведенческие фиксы SNAP4, без z.ai-костылей.

- [ ] **Step 1: Инвентаризация diff**

```bash
SNAP4="/Users/omr/Library/Application Support/JetBrains/DataSpell2026.1/projects/workspace/temp_files/workspace-b1fbe2d0-cee9-4243-bbad-7bf11dc9d650 (4)"
diff -rq "$SNAP4/src" web/src | sort
```

Составить список расхождений и портировать вручную в `web/src` (наш клиент уже с initData — не перетирать Task 2!).

- [ ] **Step 2: Портировать из SNAP4**

- `CrtOverlay.tsx` + `globals.css`: фикс баннера (lore-эффект триггерится на `kind === 'json' || kind === 'daily'`, не на любой ответ), слои `.crt-grain` и `.crt-retrace`.
- `AmbientSigil.tsx`: perf-гейты (deviceMemory < 2 → упрощение, rAF-defer, dim при наборе/скролле).
- `MoonGlyph.tsx` — векторная луна (фаза рисуется по `illum`).
- `CommandBar.tsx`: чипы `flex: 1 1 0` (высота ~40px, равная ширина), иконки CircleHelp/Sparkles/Compass/Send; **чипы «луна», «пергамент», «день» удалить** (утверждено; доступ к функциям — через status-line глифы `sl-moon`/`sl-theme` + help, см. Task 15).
- `ArcanumApp.tsx`: чего не хватает относительно SNAP4 (boot-лого АРКАНУМ на загрузке, letterpress-стиль окна чтения) — перенести аккуратно.
- `sound.ts`: `sSent` (звук отправки share).

- [ ] **Step 3: НЕ переносить** — `TgSetupBlock`, `lib/tg.ts`, `app/api/tg/**` (z.ai-гейтвей с ручным токеном; у нас initData через нашего бота). Если SNAP4-компоненты импортируют `lib/tg` — выпилить импорты при порте.

- [ ] **Step 4: Верификация**

```bash
cd web && npx tsc --noEmit && npm test && npm run build
grep -rn "lib/tg\|TgSetupBlock" web/src && echo "FAIL: гейтвей протёк" || echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat: cherry-pick SNAP4 fixes (banner, grain, MoonGlyph, perf gates, chips) without TG gateway"
```

---

### Task 13: Редизайн — векторный сигил-гримуар (AmbientSigil)

**Files:**
- Modify: `web/src/components/AmbientSigil.tsx` (новая векторная форма)
- Modify: `web/src/app/globals.css` (переменные, свечения, reduced-motion)

**Interfaces:**
- Consumes: perf-гейты из Task 12 (уже в AmbientSigil).
- Produces: фоновый сигил — не «магический круг из stock-кругов», а авторский гримуар-глиф: асимметричная композиция из ломаных/дуг, сшитая из ходов карты дня + буквы проводника; лёгкое вращение/дыхание под perf-гейтами; `prefers-reduced-motion` → статика.

- [ ] **Step 1: Эскиз в коде** — сгенерировать SVG-path программно: seed = хэш(карта дня + проводник); набор примитивов (дуга, засечка, узел-точка, штрих), соединённых в замкнутый псевдо-глиф; уровни прозрачности 0.04–0.10; цвет — от активного проводника (CSS-переменная).
- [ ] **Step 2: Дыхание/вращение** — CSS-анимация (не JS-rAF, где возможно); rAF остаётся только для параллакса; под `prefers-reduced-motion` и dim-гейтами — `animation: none`.
- [ ] **Step 3: Визуальная проверка** — скриншоты 390px и 1440px на трёх проводниках; сигил не спорит с текстом (контраст не проседает), нет горизонтального скролла.
- [ ] **Step 4: Commit**

```bash
git add web/src/components/AmbientSigil.tsx web/src/app/globals.css
git commit -m "feat: bespoke vector grimoire sigil (seeded by reading context)"
```

---

### Task 14: Редизайн — векторный лунный блок (MoonPhasePanel)

**Files:**
- Modify: `web/src/components/MoonPhasePanel.tsx`
- Modify: `web/src/lib/moon.ts` (если нужны доп. расчёты — не менять контракт `moonPhase`)

**Interfaces:**
- Produces: луна — SVG, рисуемая по `illum`/`phaseIndex` (терминатор — эллиптическая дуга, не CSS-маска): тёмный диск с тонкой кромкой, освещённая часть — градиент; подписи фазы и `до полнолуния/новолуния N д.` — терминальным шрифтом; блок встроен в сетку (не плавает поверх).

- [ ] **Step 1: SVG-луна** — компонент `<MoonDisc illum={number} size={number} />`: два `<path>` (тёмный + светлый сегмент через дугу-эллипс); аккуратные кромки (stroke 1px, opacity по illum).
- [ ] **Step 2: Верстка блока** — заголовок «лунный канал», фаза словами (как в lib/moon), счётчики до полнолуния/новолуния; кнопка «прогноз дня» (из Task 11).
- [ ] **Step 3: Проверка** — все 8 фаз (цикл дат) рисуются корректно; скриншоты; reduced-motion.
- [ ] **Step 4: Commit**

```bash
git add web/src/components/MoonPhasePanel.tsx web/src/lib/moon.ts
git commit -m "feat: vector moon disc drawn from illum/phase"
```

---

### Task 15: Редизайн — статус-глифы (обнаруживаемость луны/пергамента/дня) + тюнинг шума

**Files:**
- Modify: `web/src/components/StatusLine.tsx` (или где рендерятся `sl-moon`/`sl-theme`)
- Modify: `web/src/app/globals.css` (`.crt-grain`)

**Interfaces:**
- Produces: яркие кликабельные глифы `sl-moon` (луна) и `sl-theme` (пергамент/тема) в статус-строке с всплывающими подписями; «день» — из панели дня; шум `.crt-grain` приглушён (не мерцает и не забивает текст на дешёвых экранах).

- [ ] **Step 1: Глифы** — увеличить контраст (opacity ≥ 0.85), hover/tap-зона ≥ 32px, tooltip-строка «луна», «пергамент»; tap открывает те же панели, что удалённые чипы.
- [ ] **Step 2: Шум** — `.crt-grain`: снизить плотность/амплитуду (opacity ≤ 0.05, шаг анимации реже), под perf-гейтами — статичный слой.
- [ ] **Step 3: Проверка** — с чипами «луна/пергамент/день» удалёнными функции достижимы за 1 тап; скриншот до/после.
- [ ] **Step 4: Commit**

```bash
git add web/src/components/StatusLine.tsx web/src/app/globals.css
git commit -m "feat: discoverable status glyphs (moon/parchment) + calmer crt grain"
```

---

### Task 16: Регресс, CI, деплой + финальная ручная проверка

**Files:**
- Verify/Modify: `web/next.config.ts` (уже ок), `.github/workflows/ci-frontend.yml` (если ссылки на `web/next.config.mjs` — заменить на `.ts`), `.github/workflows/deploy.yml` (та же замена, если есть)
- Run-only: вся тестовая база

**Interfaces:** Produces: зелёный CI, задеплоенный арканум, закрытые пины Review Focus.

- [ ] **Step 1: Полный бэк-регресс**

```bash
pytest tests/ -q
```

- [ ] **Step 2: Полный фронт-пайплайн**

```bash
cd web && npx tsc --noEmit && npm test && npm run build && ls ../static/webapp/index.html
```

- [ ] **Step 3: Локальный прод-прогон** — `python app.py` (если BOT_TOKEN недоступен — минимальный ран с заглушкой логов): `/` отдаёт арканум, ассеты по хэшам с вечным кэшем, gzip работает; POST begin на daily возвращает daily_ritual; share реально уходит в ТГ.

- [ ] **Step 4: Ручные чеки по пинам Review Focus**

- initData 401: подменить init_data на мусор → терминальная строка ошибки, приложение живо.
- Легаси-журнал: поднять копию старой БД (или INSERT старого шейпа) → журнал/эхо/хроника рендерятся.
- Share после рестарта: share по токену существующей строки → ок или фолбэк .txt, без 500.
- Часовые пояса: streak при local_hour 9/21 в разные дни — тест C уже покрывает; глазами глянуть UI-числа.
- Мобайл 390px: полный проход без горизонтального скролла.

- [ ] **Step 5: CI-пути**

```bash
grep -rn "next.config.mjs" .github/workflows/ && sed -i '' 's/next\.config\.mjs/next.config.ts/g' .github/workflows/*.yml
git add .github/workflows && git commit -m "chore: CI path web/next.config.ts"
```

(Если ссылок нет — шаг пропустить.)

- [ ] **Step 6: Финальный коммит + пуш-кандидат**

```bash
git add -A && git commit -m "chore: ARCANUM port complete — frontend swap, python backend parity, redesign round" || echo "нечего коммитить"
```

- [ ] **Step 7: Отчёт** — сводка: что перенесено, что изменено относительно снапшотов, известные ограничения (initData-24h, легаси-шейпы, фолбэки).

---

## Порядок и параллель

- **Строгая последовательность:** 1 → 2 → 4 → 5 → 6 (Python-контракт должен существовать до проводки фронта).
- **Параллельно после Task 1:** Task 3 (vitest) и Task 4+ (Python) независимы.
- **Зависимости:** Task 7 → 8 → 9; Task 10 после 5 (нужен `create_webapp(bot)`); Task 11 после 6+8+9+10; Task 12 после 2; Tasks 13–15 после 12; Task 16 — последним.
- **SDD:** каждый таск — отдельный subagent с полным текстом таска из этого плана; после каждого — code-review подагентом; коммит — после зелёных тестов.

*Конец плана.*
