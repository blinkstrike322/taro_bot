# Архитектура taro_bot

> Telegram-бот для гадания на картах Таро с интеграцией LLM и WebApp.

---

## 1. Обзор

Проект представляет собой Telegram-бота (@amotaro_bot), который позволяет пользователям получать толкования карт Таро через три персонажа-проводника. Бот использует LLM (OpenRouter) для генерации интерпретаций, Next.js WebApp для интерактивного интерфейса и aiosqlite для хранения данных.

Система состоит из двух одновременно работающих серверов: aiogram (поллинг Telegram API) и aiohttp (веб-сервер для WebApp и API).

---

## 2. Структура проекта

```
taro_bot/
├── app.py                  # Точка входа: запуск двух серверов + напоминания
├── config.py               # Настройки из .env (Pydantic Settings)
├── requirements.txt        # Зависимости Python
├── start.sh               # Скрипт запуска с autossh-туннелем
├── run_web_only.py        # Запуск только веб-сервера (без бота)
├── DESIGN.md              # Дизайн-спецификация WebApp
│
├── bot/                    # Telegram Bot Layer (aiogram 3.x)
│   ├── handlers.py         #  CommandStart, выбор персонажа, меню
│   ├── router.py           #  Маршрутизация хендлеров
│   └── webapp_handler.py   #  Обработка WebApp данных из Telegram
│
├── core/                   # Бизнес-логика
│   ├── tarot.py            #  Загрузка карт, выбор случайных, ориентация
│   ├── llm.py              #  Интеграция с OpenRouter API, fallback
│   ├── prompts.py          #  Системные промпты и сборка запросов
│   └── reminder.py         #  Цикл напоминаний неактивным пользователям
│
├── storage/                # Слой данных
│   ├── db.py               #  SQL-запросы, CRUD для users и readings
│   └── models.py           #  Pydantic-модели User и Reading
│
├── data/                   # Статические данные
│   ├── cards.json          #  78 карт Таро (названия, значения, файлы)
│   └── characters.json     #  3 персонажа-проводника
│
├── web/                    # Next.js WebApp (Telegram Mini App)
│   ├── next.config.mjs     #  Static export в static/webapp/
│   ├── package.json        #  next 15, react 19, tailwind 4
│   └── src/
│       ├── pages/
│       │   ├── index.tsx   #  Главная страница (вся логика WebApp)
│       │   ├── _app.tsx    #  Обёртка приложения
│       │   └── _document.tsx
│       ├── components/     #  15 React-компонентов
│       │   ├── Layout.tsx, Card.tsx, CardBack.tsx
│       │   ├── Spread1Card.tsx, Spread3Cards.tsx
│       │   ├── WelcomeAnimation.tsx, ReadingResult.tsx
│       │   ├── CatalogModal.tsx, SettingsModal.tsx, CalendarModal.tsx
│       │   ├── QuestionInput.tsx, Button.tsx, Toast.tsx
│       │   ├── CrtOverlay.tsx, CursedFooter.tsx
│       │   └── ...
│       ├── lib/
│       │   └── api.ts      #  Клиент для API (spread, card_pick, readings)
│       └── styles/         #  Tailwind CSS, глобальные стили
│
├── static/                 # Статические файлы
│   ├── pixel/              #  Основные изображения карт (3.7 MB, 78 png)
│   ├── webapp/             #  Сборка Next.js (static export)
│   └── default/            #  Оригиналы карт (229 MB, не используются)
│
├── tests/
│   └── test_tarot.py       #  Тесты для core/tarot.py
│
└── scripts/
    └── convert_cards.py    #  Конвертация изображений карт
```

---

## 3. Технологический стек

| Компонент | Технология |
|-----------|-----------|
| Bot framework | aiogram 3.x |
| Web server | aiohttp |
| База данных | SQLite (aiosqlite, raw SQL) |
| LLM API | OpenRouter (httpx) |
| Frontend | Next.js 15, React 19, TypeScript |
| Стилизация | Tailwind CSS 4 |
| Сборка WebApp | Static export (next build) |
| Валидация | Pydantic Settings / Pydantic models |
| Туннель | localhost.run (autossh) |
| Тестирование | pytest, pytest-asyncio |

Зависимости Python: aiogram, aiohttp, aiosqlite, httpx, pydantic-settings, Pillow, pytest.

---

## 4. Архитектура запуска (два сервера)

`app.py` -- единственная точка входа. Функция `main()` запускает три корутины параллельно через `asyncio.gather`:

```python
await asyncio.gather(
    run_webapp(webapp),       # aiohttp на порту 8080
    start_polling(bot, dp),   # aiogram поллинг Telegram API
    reminder_loop(bot),       # фоновый цикл напоминаний
)
```

Все три процесса работают в одном event loop. Завершение любого из них не прерывает остальные, но при остановке `main()` всё завершается.

### aiohttp (веб-сервер)

- Порт: 8080
- Раздаёт статику WebApp (Next.js сборка из `static/webapp/`)
- Раздаёт изображения карт из `static/pixel/`
- Обрабатывает API-запросы от WebApp: `/api/spread`, `/api/card_pick`, `/api/readings`

### aiogram (bot polling)

- Получает обновления от Telegram через long polling
- Обрабатывает команду `/start`
- Обрабатывает callback-запросы выбора персонажа
- Принимает WebApp данные через `message.web_app_data`

---

## 5. Слой бота (Telegram)

### Маршрутизация

`bot/router.py` собирает два роутера:

```python
router = Router()
router.include_router(start_router)    # /start, главное меню
router.include_router(character_router) # выбор персонажа
```

В `app.py` также подключается `webapp_router` из `bot/webapp_handler.py`.

### Команды и callback-запросы

1. **`/start`** -- проверяет, новый ли пользователь. Если новый -- предлагает выбрать персонажа. Если вернулся -- показывает приветствие выбранного персонажа и главное меню.

2. **Главное меню** (InlineKeyboard):
   - "1 карта" -- WebApp с type=1 (расклад на 1 карту)
   - "3 карты" -- WebApp с type=3 (расклад на 3 карты)
   - "Карта дня" -- WebApp с type=daily
   - "Сменить проводника" -- открывает выбор персонажа

3. **Выбор персонажа** -- callback-запросы вида `char:{id}`. Сохраняет выбор в БД.

### Обработка WebApp данных

Когда пользователь взаимодействует с WebApp и отправляет результат в Telegram, срабатывает `handle_webapp_data` в `bot/webapp_handler.py`:

- Принимает JSON-данные из `message.web_app_data.data`
- Проверяет поле `action`: `card_picked` или `spread_done`
- Для `card_picked`: проверяет, не было ли уже сегодня гадания (тип `daily`), выбирает карту, вызывает LLM, сохраняет результат, отправляет в Telegram
- Для `spread_done`: отправляет толкование в Telegram

---

## 6. Веб-сервер (aiohttp API)

Три эндпоинта, объявленных в `app.py` и `run_web_only.py`:

### `POST /api/spread`
- Принимает: `tg_id`, `spread_type` (1 или 3), `question` (опционально), `character_id`
- Возвращает: массив карт с интерпретацией
- Логика: `draw_cards(count)` -> `interpret_reading()` -> сохранение в БД

### `POST /api/card_pick`
- Принимает: `tg_id`, `card_index` (0-2)
- Возвращает: выбранную карту с интерпретацией
- Логика: `draw_cards(3)` -> выбор одной -> `interpret_reading()` -> сохранение

### `GET /api/readings`
- Принимает: `tg_id`, `year`, `month`
- Возвращает: список чтений за месяц
- Используется календарём WebApp

---

## 7. WebApp (Next.js Frontend)

### Сборка

```js
// next.config.mjs
output: 'export',
distDir: '../static/webapp',   // экспорт в статику aiohttp
images: { unoptimized: true },
trailingSlash: true,
```

Next.js собирается в статические файлы в `static/webapp/`. aiohttp раздаёт их как обычную статику.

### Клиентская часть

`web/src/lib/api.ts` -- HTTP-клиент для вызовов API. Получает `tg_id` через `Telegram.WebApp.initDataUnsafe.user.id`.

### Экраны

- **Welcome** -- анимация приветствия
- **Daily pick** -- три карты рубашкой вверх, выбор одной
- **Spread** -- расклад на 1 или 3 карты с возможностью ввести вопрос
- **Daily result** -- результат карты дня
- **Модальные окна**: Catalog (все карты), Settings (выбор персонажа), Calendar (история чтений)

### Компоненты

15 React-компонентов в `web/src/components/`, включая `Card`, `CardBack`, `Spread1Card`, `Spread3Cards`, `ReadingResult`, `SettingsModal`, `CalendarModal`, `CatalogModal`, `WelcomeAnimation`, `CrtOverlay`, `CursedFooter`.

---

## 8. Интеграция с LLM

### Цепочка моделей (fallback)

```python
FALLBACK_MODELS = [
    "nvidia/nemotron-nano-12b-v2-vl:free",   # первая попытка
    "openrouter/free",                         # fallback
]
```

Если первая модель недоступна или возвращает ошибку, пробуется следующая. Если все модели отказали, используется локальный fallback на основе базы значений карт.

### Процесс генерации

1. `core/prompts.py` собирает системный промпт персонажа
2. Добавляет запрет на emoji в системный промпт
3. `core/prompts.py` собирает пользовательский запрос с картами
4. `core/llm.py` отправляет запрос через httpx к OpenRouter API
5. Ответ проходит через `strip_emojis()` -- удаление emoji
6. `parse_llm_response()` пытается распарсить JSON-ответ, затем text-формат
7. Если ничего не подошло -- возвращает сырой текст

### Парсинг ответа

LLM должна возвращать JSON в формате:
```json
{
  "short_answer": "...",
  "card_meaning": ["..."],
  "advice": "..."
}
```

Парсер сначала ищет JSON в ответе, затем пробует текстовый формат (`short_answer: ...`, `card_meaning: [...]`, `advice: ...`), и в крайнем случае возвращает весь текст как `short_answer`.

### Локальный fallback

Если все LLM модели отказали, `fallback_from_cards_db()` собирает интерпретацию из базы значений карт (`cards.json`) с характерной приставкой для каждого персонажа.

---

## 9. Персонажи-проводники

Три персонажа определены в `data/characters.json`:

| ID | Имя | Стиль |
|----|-----|-------|
| `shadow_walker` | Странница Теней | Поэтичная, мистическая, образы теней и лунного света |
| `ruin_keeper` | Хранитель Руин | Прямой, веский, мудрый, без украшений |
| `spark_of_chaos` | Искра Хаоса | Дерзкий, с юмором, трюкстер, но с глубиной |

Каждый персонаж имеет:
- `system_prompt` -- системный промпт для LLM (стиль, формат ответа, запрет emoji)
- `greeting` -- приветствие при возвращении пользователя
- `ascii_icon` -- ASCII-арт для отображения в Telegram

Пользователь выбирает персонажа при первом запуске и может сменить его в любой момент. Выбор сохраняется в БД в поле `users.character_id`.

---

## 10. База данных

### Схема

SQLite, файл `taro_bot.db` (путь задаётся в `DB_PATH` из `.env`).

#### Таблица `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id               INTEGER UNIQUE NOT NULL,
    character_id        TEXT NOT NULL DEFAULT 'shadow_walker',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_reminder_sent_at TEXT
);
```

#### Таблица `readings`

```sql
CREATE TABLE IF NOT EXISTS readings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    type            TEXT NOT NULL,          -- 'daily', 'spread_1', 'spread_3'
    question        TEXT,                    -- вопрос пользователя (может быть NULL)
    cards_data      TEXT NOT NULL,           -- JSON: выбранные карты
    interpretation  TEXT NOT NULL,           -- JSON: ответ LLM
    character_id    TEXT NOT NULL DEFAULT 'shadow_walker',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Pydantic-модели

Определены в `storage/models.py`:

- **User**: `id`, `tg_id`, `character_id`, `created_at`, `last_active_at`, `last_reminder_sent_at`
- **Reading**: `id`, `user_id`, `type`, `question`, `cards_data`, `interpretation`, `character_id`, `created_at`

Все поля с временными метками хранятся как строки ISO 8601.

### Операции

Реализованы в `storage/db.py`:

- `create_tables()` -- создание таблиц при запуске
- `get_or_create_user()` -- `INSERT OR IGNORE` + `SELECT`
- `save_reading()` -- вставка чтения с JSON-сериализацией
- `get_user_readings()` -- последние N чтений пользователя
- `get_user_readings_by_month()` -- чтения за месяц (для календаря)
- `update_character()` -- смена персонажа
- `update_last_active()` -- обновление активности
- `get_inactive_users()` -- пользователи, не проявлявшие активность N дней
- `update_reminder_sent()` -- отметка об отправке напоминания

---

## 11. Система напоминаний

Фоновый процесс в `core/reminder.py`. Запускается как третья корутина в `asyncio.gather`.

### Параметры

```python
REMINDER_INTERVAL_HOURS = 6    # проверка каждые 6 часов
INACTIVE_DAYS = 3              # пользователь неактивен 3+ дня
MIN_REMINDER_GAP_DAYS = 7      # минимум 7 дней между напоминаниями
```

### Алгоритм

1. Каждые 6 часов запускается `check_and_send_reminders()`
2. Запрашивает пользователей, у которых `last_active_at < now - 3 days`
3. Для каждого проверяет, не отправлялось ли напоминание за последние 7 дней
4. Отправляет сообщение: "Карты ждут тебя. Загляни -- возможно, сегодня они раскроют что-то важное."
5. Обновляет `last_reminder_sent_at`

---

## 12. Обработка emoji

LLM может генерировать emoji в ответах. Система фильтрует их на двух уровнях:

1. **Уровень промпта**: в системный промпт каждого персонажа добавляется запрет на emoji:
   ```
   Emoji СТРОГО ЗАПРЕЩЕНЫ. Никогда не используй эмодзи или Unicode-смайлы.
   ```
2. **Уровень ответа**: регулярное выражение `EMOJI_PATTERN` удаляет все символы Unicode из диапазонов emoji. Применяется в `strip_emojis()` после получения ответа от LLM.

---

## 13. Карты Таро

### Источник данных

`data/cards.json` -- 78 карт (22 старших аркана + 56 младших). Формат записи:

```json
{
  "id": "the-fool",
  "name": "Шут",
  "arcana": "major",
  "suit": null,
  "number": 0,
  "filename": "the-fool.png",
  "upright": "Новые начинания, свобода, спонтанность...",
  "reversed": "Безрассудство, нестабильность, риски без плана..."
}
```

### Логика выбора

`draw_cards(n)` в `core/tarot.py`:
1. Загружает все 78 карт (с кэшированием)
2. Выбирает n случайных без повторений
3. Для каждой карты случайно определяет ориентацию (upright/reversed)

Изображения карт хранятся в `static/pixel/` в формате PNG (дизеринг, чёрно-белые).

---

## 14. Поток данных

### Карта дня

```
Telegram (WebApp)
  │ нажатие "Карта дня"
  │ type=daily
  ▼
Next.js WebApp
  │ показ 3 карт рубашкой вверх
  │ пользователь выбирает одну (card_index)
  ▼
POST /api/card_pick
  │ draw_cards(3) + выбор одной
  │ interpret_reading() → OpenRouter → интерпретация
  │ save_reading() в БД
  ▼
WebApp → Telegram (web_app_data)
  │ обработка в bot/webapp_handler.py
  │ проверка has_daily_reading()
  ▼
Ответ в Telegram-чат
```

### Расклад 1 или 3 карты

```
Telegram (WebApp)
  │ нажатие "1 карта" или "3 карты"
  │ type=1 или type=3
  ▼
Next.js WebApp
  │ ввод вопроса (опционально)
  │ нажатие "Получить расклад"
  ▼
POST /api/spread
  │ draw_cards(count) → все сразу
  │ interpret_reading() → OpenRouter
  │ save_reading() в БД
  ▼
Показ карт + интерпретация в WebApp
  │ отправка результата в Telegram
  ▼
Ответ в Telegram-чат (опционально)
```

### Поток между серверами (запуск)

```
app.py
  │ asyncio.gather()
  ├── create_webapp()          → aiohttp на :8080
  ├── start_polling(bot, dp)   → aiogram поллинг Telegram
  └── reminder_loop(bot)       → фоновый цикл напоминаний
```

---

## 15. Запуск и деплой

### Development

```bash
python3 app.py
```

Бот запускается локально на порту 8080. Telegram API требует HTTPS для WebApp, поэтому используется `start.sh`, который:

1. Убивает старые процессы
2. Запускает HTTPS-туннель через `autossh` на `localhost.run`
3. Получает публичный URL туннеля
4. Обновляет `WEBAPP_URL` в `.env`
5. Запускает `python3 app.py`

### Production

- Никаких дополнительных шагов -- тот же `python3 app.py`
- WebApp собирается отдельно: `cd web && npm run build` (экспортируется в `static/webapp/`)

---

## 16. Дизайн WebApp

Дизайн-спецификация описана в `DESIGN.md`. Ключевые принципы:

- Чёрный фон (`#000000`), белый текст (`#FFFFFF`), серый для disabled (`#666666`)
- Никаких градиентов, теней, закруглений
- Моноширинный шрифт для интерфейса, Pixelify Sans для заголовков, Times New Roman для названий карт
- Изображения карт -- чёрно-белый дизеринг

---
