# ARCANUM → taro_bot: перенос Mini App + редизайн · дизайн-спека

Дата: 2026-10-08 · Статус: черновик на ревью
Источники: z.ai-снапшоты `workspace-...650 (3)` (база, раунды 1–9) и `workspace-...650 (4)` (ветка-фикс + TG-шлюз + перф-сигил)

---

## 1. Цель

Заменить текущий фронт Telegram Mini App (Next.js 15 pages-router в `taro_bot/web/`) на ARCANUM
(Next.js 16 App Router, «оккультный таро-терминал»), перенеся всю серверную логику из z.ai-сэндбокса
в Python-бэкенд, и провести финальный редизайн-раунд (сигил, шум, луна, кнопки).

**Критерии успеха**
1. Mini App открывается из бота, полный ARCANUM-флоу работает против Python-бэка с нашим LLM-роутером (Zen + OpenRouter).
2. Все 19 команд терминала работают (daily/ask/ask1/yesno/mfd/shadow/pentagram/horseshoe/catalog/guides/library/history/stats/arcana/moon/week/month/theme/card).
3. Чип «Отправить в ТГ» шлёт альбом карт + оформление в чат юзера через нашего бота, без настроек.
4. Редизайн-раунд принят юзером визуально (сигил, шум, луна, кнопки, boot-лого).
5. CI зелёный (tsc, vitest, build; pytest), деплой на Amvera без изменений инфраструктуры.

## 2. Исходное состояние

- **taro_bot**: aiohttp-монолит `app.py` (порт 8080: бот aiogram + API + статика), фронт — Next.js 15
  `output:'export'` → `static/webapp/` (собирается GH Actions, коммитится в git), initData-верификация
  на каждом запросе (`verify_telegram_init_data`), LLM — OpenAI-совместимый роутер `core/llm.py`
  (Zen primary + OpenRouter fallback, circuit breaker, 3 попытки, JSON-валидация), SQLite `/data/taro_bot.db`
  (users/readings/payments/events), квота через Telegram Stars (`needs_subscription`).
- **ARCANUM (3)**: fullstack Next.js 16 (API-роуты TS, Prisma SQLite, z-ai-web-dev-sdk, cookie-анонимная
  идентификация). Полный функционал раундов 1–9.
- **ARCANUM (4)**: ветка от состояния до раунда 8-c. Потеряла: month-дайджест, «рассветы» (morningStreak),
  boot-лого АРКАНУМ, lucide в Shell/TuiMenu/RestoreOffer/Stats/Week/Horoscope, редизайн окна чтения,
  чипы «спросить снова»/«переписать в свиток». Добавила: фикс баннера ритуала, `.crt-grain`/`.crt-retrace`,
  `MoonGlyph`, оптимизированный `AmbientSigil` (гейты, dim), чипы `flex:1 1 0`, TG-шлюз с ручным токеном.

## 3. Архитектурное решение

**Подход A (принят): static export + серверная логика в Python.**
- Фронт собирается в `static/webapp/` (тот же пайплайн), aiohttp раздаёт статику и API.
- Один сервис, одна БД, initData-авторизация, Stars-квота срастаются естественно.
- Отклонено: второй Node-сервис на Amvera (расщепление БД по `/data`-маунтам, `BOT_TOKEN` в двух местах, два домена).

Контракт фронт↔бэк: источником правды по именам полей является клиентский `src/lib/api.ts` версии (3)
(+ правки настоящего пункта 4). При расхождении — правим клиент под контракт Python, не наоборот.

## 4. Фронтенд

### 4.1 Расположение и сборка
- Исходники ARCANUM (база (3) + cherry-picks (4), п.7) кладутся в `taro_bot/web/`; старый Next 15 фронт
  удаляется (остаётся в git-истории).
- `next.config.ts`: `output:'export'`, `distDir:'../static/webapp'`, `images.unoptimized:true`,
  `trailingSlash:true` — по образцу текущего `web/next.config.mjs`.
- GH Actions `deploy.yml` / `ci-frontend.yml`: правка путей (build из `web/`, артефакт `static/webapp/`,
  tsc + vitest + build). Amvera (`amvera.yaml`) не меняется.
- Ассеты: `public/cards` (78 PNG + рубашки), `public/guides` (3 портрета) едут в билд автоматически; пути
  `/cards/*.png` совпадают с текущей статикой.

### 4.2 Идентификация
- Убрать cookie-механику `taro_uid`/`op-*` (server/user.ts не переносится — его заменяет Python).
- Клиент шлёт `window.Telegram.WebApp.initData` в каждом запросе (query `init_data` или body) — паттерн
  текущего `web/src/lib/api.ts`.
- Dev-режим без бота: env-флаг `NEXT_PUBLIC_DEV_MOCK_INITDATA` (только dev-сборка) подставляет мок-initData;
  Python в проде моки не принимает (проверка settings-флага, по умолчанию выключена).

### 4.3 Вызовы
- Переименовать в клиенте пути под Python: `/api/history` → `/api/readings` (централизовано в `api.ts`),
  остальные совпадают (`/api/spread/begin`, `/api/spread/poll`, `/api/character`).
- Джоб-стор шёпотов не нужен: поллинг `spread/poll` по токену уже реализован Python-ом (статус в БД,
  переживает рестарт — лучше, чем globalThis z.ai).

## 5. Бэкенд (Python)

### 5.1 Эндпоинты
Существующие (адаптация):
- `POST /api/spread/begin` — +`local_hour` (0–23, clamp) в body; ответ +`daily_ritual`:
  `{counted, morning, streak_days, morning_streak}` (логика п.5.4). `needs_subscription` — как есть.
- `GET /api/spread/poll` — без изменений (2-фазный шёпот уже есть).
- `GET/POST /api/character` — без изменений.
- `GET /api/readings` — новые ветки: `?days=N` (int 1–62, приоритет над year/month, take 400) и
  `?all=1` (весь журнал, take 500). Общий маппинг строк в одну функцию.
- `/api/events`, `/api/log`, `/api/disk` — без изменений.

Новые:
- `GET /api/stats` → `{streak_days, total_readings, last_daily_at, guide_readings:{char_id:n},
  spread_counts:{type:n}, morning_streak, last_morning_at}`. `total_readings` = `COUNT(readings)`,
  не счётчик (урок z.ai бага 6-b: транзакция + count как истина).
- `POST /api/ask` — body `{init_data, question, card|cards[2], spread_name, spread_question,
  reading_summary, character_id}` → `{answer, fallback?}`. Ровно 2 карты для пары (400 иначе),
  резолв в колоде (400 «карты не опознаны»). 2 попытки LLM → локальный фолбэк (одиночный — из значений
  карты + голос; парный — `pairBridgePhrase` + формула связи).
- `POST /api/forecast` — `{init_data, card_name}` → `DayForecast {slogan, morning, day, evening, focus,
  tone 0-10, luck 0-10, social 0-10, sip, fallback?}`. Strict-JSON от LLM + валидатор (clamp, строки) +
  локальный фолбэк из значений карты.
- `POST /api/week` / `POST /api/month` — `{init_data, digest, character_id}` → `{reflection, fallback?}`.
  Валидация дайджеста (clamp counts, чистка ключей ≤60 симв, вопросы ≤80×5). Промпт: один абзац 3–5
  предложений, связать числа (не пересчитать), финальный вопрос оператору. Детерминированный фолбэк
  из топ-карты.
- `POST /api/share` — `{init_data, reading_id}` → `{ok}`. Python: верифицирует initData → tg_id,
  читает строку `readings` (404 если нет/не completed), собирает из `cards_data` + `interpretation`
  сообщение и шлёт через aiogram Bot (п.5.5). Клиент при `!ok`/ошибке — фолбэк «скачать .txt».

### 5.2 Промпты (перенос из (3) в `core/prompts.py`)
ARCANUM-контент вытесняет текущие тексты (это и есть «новая магия» чтений), структура функций Python — сохраняется:
- `get_system_prompt(character_id)` — голоса проводников (shadow_walker/ruin_keeper/spark_of_chaos,
  источники: `src/server/guides.ts` + `prompts.ts`), блок «10 приёмов ремесла» (позиция фильтрует карту,
  пары карт, элементы Golden Dawn, повторы чисел/стихий, вес мажоров, придворные роли, реверс как
  блокировка, исход как траектория, один рассказ, вопрос меняет карту), анти-клише бан, скан-подсказка
  повторов, режимные правила по раскладам.
- `build_reading_prompt` — динамические позиции (уже есть в Python, адаптировать под новые правила).
- `build_follow_up_prompt` (одиночная карта) и `build_pair_prompt` (пара: стихии Golden Dawn,
  нумерология `FollowUpCard.number`, `pairBridgePhrase`, «отношение, не расшифровка»).
- `build_day_forecast_prompt` (strict JSON: лозунг 4–8 слов, утро/день/вечер 1–2 предл., фокус,
  тонус/удача/общение 0–10, глоток; «тяжёлая карта — не сладить, но дать траекторию»).
- `build_week_prompt`, `build_month_prompt`.
- Санитизация: срез markdown-заборов, эмодзи-диапазоны, нормализация ключей, clamp чисел (порт из TS-роутов).

### 5.3 LLM-слой
- `core/llm.py` (`call_llm_with_fallback`) переиспользуется как есть. Важно: TS-код z.ai звал system
  как `role:'assistant'` и передавал `thinking:{type:'disabled'}` — это костыли их SDK; в Python обычный
  `role:'system'`, без thinking.
- Новые JSON-валидаторы: forecast-схема, ask/week/month — текстовая санитизация + длина.
- `/api/ask`, `/api/forecast`, `/api/week`, `/api/month` — синхронные (2 попытки, таймаут общего дедлайна
  уже в llm.py), с локальными фолбэками — UX не ломается при недоступности LLM.

### 5.4 Серии (streak) — порт `server/user.ts::touchDailyStreak`
Функция `touch_daily_streak(user_row, local_hour) -> DailyRitualResult` в Python (SQLite-транзакция):
- `counted` — только первая карта дня за локальный день (по `last_daily_at`).
- `morning = local_hour < 12`.
- `morning_streak` растёт только если `morning` И `last_morning_at` = вчера; после полудня — заморозка
  (не растёт, не рвётся); пропуск утреннего ритуала на следующий день — разрыв.
- `streak_days` — обычная серия дней по `last_daily_at`.
Час присылает клиент (`Date.getHours()`) — ритуал в timezone оператора (сервер доверяет, это игра с собой).
Тесты: 5 сценариев из worklog 8-d (A–E).

### 5.5 TG-шара (`/api/share`)
- chat_id = tg_id из верифицированного initData (Mini App открыт в чате с ботом; личный чат user.id == chat.id).
- Сообщение: `sendMediaGroup` из PNG карт (`static/webapp/cards/<file>.png`, путь валидируется —
  только `cards/<slug>.png`, без traversal): 1 карта → `sendPhoto` + caption; 2–10 → media group,
  HTML-caption (≤1024) на первом: `<b>ARCANUM · <расклад></b>`, штамп `<дата> · проводник: <имя>`, вопрос.
- Текст чтения: `sendMessage` частями ≤3800 (`splitParts` уважает лимит 4096), `parse_mode:HTML`,
  секции: интро (курсив) → `─ signal ─` → `// 01 · <позиция> — <b>карта</b> (прямая|перевёрнутая)` →
  `// нить` → `// совет` → `— закрытие —` + `<code>тег · arcanum terminal</code>`. HTML-эскейп обязателен.
- Форматирование собирает Python (единый источник); клиент шлёт только `reading_id`.
- Fallback при сбое: клиентская кнопка «скачать .txt» (текущий `buildScrollText` остаётся клиентским).
- TgSetupBlock / `lib/tg.ts` / `/api/tg` / токен в localStorage — НЕ переносятся.

## 6. БД (SQLite, `storage/db.py`)
- `users` + колонки (идемпотентная миграция try-ALTER, паттерн есть):
  `streak_days INTEGER DEFAULT 0`, `last_daily_at TEXT`, `morning_streak INTEGER DEFAULT 0`,
  `last_morning_at TEXT`.
- `readings` — без изменений схемы: `type/question/cards_data/interpretation/character_id/created_at/status/
  client_token` покрывают все новые фичи (эхо, хроника, дайджесты, share).
- Operator-концепция z.ai = строка `users` (ключ tg_id). Данных из `db/custom.db` z.ai не переносим.
- `total_readings` нигде не храним — всегда `COUNT(*)` по readings (урок 6-b).

## 7. Слияние (3) + (4)
База — (3) целиком (включая month, рассветы, boot-лого, lucide во всех блоках, letterpress-окно чтения,
чип «спросить снова»; scroll-инфраструктура `buildScrollText`/`ScrollLine` сохраняется как фолбэк-путь
экспорта — см. п.5.5).

Из (4) забрать:
- **Фикс баннера**: в эффекте-лориметре `ArcanumApp` следить за `kind==='json' || kind==='daily'`
  (карта дня пишется как `'daily'` — в (3) эффект её не видел, баннер не гас).
- **Шум**: слои `.crt-grain` + `.crt-retrace` в `CrtOverlay` и CSS (с тюнингом п.8).
- **MoonGlyph** — векторная иконочная луна (статус-лайн, будущий блок луны).
- **Перф-приёмы сигила**: deviceMemory-гейт, rAF-дефер, dim при раскладе на столе, пауза на
  typing/scrolling — геометрию сигила заменяем новой (п.8).
- **Чипы**: `flex:1 1 0` (равные плитки) + набор иконок (4) (CircleHelp/Sparkles/Compass/Send) —
  с правками п.8.
- `LUNAR_ALPHABET` — оставить версию (3) (без ✦/✧: решение раунда 9 «чистка ИИ-штампов» в силе).

Выбросить из (4): `TgSetupBlock`, `TgLine` (заменяется простым результат-лайнером), `lib/tg.ts`,
`/api/tg`, упрощённый ReadingResult (4), отсутствие lucide в блоках.

## 8. Редизайн-раунд (Ф3)

1. **Сигил** — новый векторный гримуар (вместо пентаграммы (4)): тонкие штрихи, 2–3 медленных
   контр-вращающихся слоя (GPU transform only), opacity 0.06–0.09 с контрастом выше (4) (не сливается
   с фоном, но ниже «декора»), позиция как в (3) (верх-право). Перф-гейты из (4): deviceMemory<2 → нет,
   rAF-дефер, dim при картах на столе, пауза при typing/scrolling, reduced-motion → статичный кадр.
   Приёмка: скриншоты desktop+mobile, визуальное одобрение юзера.
2. **Шум**: grain+retrace как база, интенсивность лёгкая (читаемость прежде вайба), opacity по темам
   (silver ~0.04, ember ~0.07 — старт из (4), тюнинг на ревью).
3. **Луна**: пиксель-арт 9×9 в MoonBlock заменяется векторным блоком (развитие MoonGlyph: честный
   терминатор по фазе, кратеры, мягкое свечение; математика `lib/moon.ts` не меняется — фазы/заметки/
   next events те же). Приёмка визуальная.
4. **Кнопки**: быстрый ряд — равные full-width плитки `flex:1 1 0`, высота ~40px (было 44); чипы
   **луна, пергамент(тема), день из ряда убрать** (функции доступны через MOTD/меню/статус-лайн);
   обнаруживаемость: глифы `sl-moon`/`sl-theme` в статус-лайне чуть заметнее (opacity↑, tooltip),
   команды в help/man (уже есть). Остаток ряда: спроси, расклады, проводники, журнал.
5. **Boot-лого АРКАНУМ** — вернуть из (3) (`.boot-logo` + подстрока + анимация boot-logo-in).

## 9. Фазы (для имплементационного плана)

- **Ф1 — Скелет порта.** web/ ← ARCANUM (база (3)), static export, initData-клиент, подключение к
  текущим эндпоинтам; Python: миграция users, `/api/stats`, streak в begin. Выход: карта дня, расклады,
  журнал, проводники работают E2E через тест-бота; `next build` (export) зелёный в CI.
- **Ф2 — Python-фичи.** Промпты + `/api/ask`, `/api/forecast`, `/api/week`, `/api/month`, `/api/share`;
  вёрстка клиента на них (чипы, лорометр, баннер-фикс, рассветы). Выход: 19 команд работают.
- **Ф3 — Слияние+редизайн.** Cherry-picks (4) + сигил/шум/луна/кнопки/boot-лого. Выход: визуальное
  одобрение юзера.
- **Ф4 — Регресс и деплой.** Полный регресс-чеклист (mobile 390 без переполнений, restore, звуки,
  reduced-motion), CI зелёный, деплой Amvera, старый фронт удалён из пайплайна.

## 10. Тестирование
- **FE**: vitest на чистые функции (moon, arcana, echo, week/month digest, scroll builder, parser команд),
  `tsc --noEmit`, `next build` в CI.
- **PY**: pytest — билдеры промптов (смоук), валидаторы (forecast clamp, пары карт), `touch_daily_streak`
  (5 сценариев), сборщик share-сообщения (fake bot), идемпотентность миграции users.
- **E2E вручную**: тест-бот + Mini App; чеклист регресса из worklog (флипы, порядок вскрытия, чипы,
  restore, звук-тумблер, мобайл 390).

## 11. Вне скоупа
Новые фичи из бэклога worklog («год в картах», скины×темы, эмбиент библиотеки, PNG-экспорт свитков),
инлайн-кнопки под share-сообщением, поддержка чужих ботов/токенов, i18n, миграция Prisma→что-либо
(Prisma не переносится вовсе).

## 12. Риски
- Next.js 16 + React 19 в `output:'export'` — проверить первым же таском Ф1 (фолбэк: откат на Next 15
  App Router — API-поверхность клиента не меняется).
- Локальная разработка Mini App без прод-домена: WEBAPP_URL на тестового бота / ngrok; dev-мок initData
  только в dev-сборке.
- Использование aiogram Bot из aiohttp-хендлеров — один event loop, Bot шарится (ок в aiogram 3).
- Строгость LLM-JSON для forecast — валидатор + локальный фолбэк (уже паттерн).
- +10 МБ в репо (статика) — существующий паттерн CI-коммита, приемлемо.
