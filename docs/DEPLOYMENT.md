# Deployment & Setup Audit

> Полная картина как настроен проект, деплой и инфраструктура.
> Дата: 2026-06-14

---

## 1. Архитектура

```
[Telegram] ← polling → [aiogram] ─┬─ [aiohttp :8080] ─── [Static WebApp]
                                    │                           │
                                    └─ [OpenRouter LLM]         │
                                        (chat/completions)      │
                                                                ▼
                                                      Next.js (static)
```

- **Бот**: Python 3.12, aiogram (polling, НЕ webhook)
- **Веб-сервер**: aiohttp, порт 8080 (один процесс — и бот, и API, и WebApp)
- **Фронтенд**: Next.js (статический экспорт в `static/webapp/`)
- **LLM**: OpenRouter API (chat/completions)
- **БД**: SQLite (`/data/taro_bot.db` — на сервере, или `taro_bot.db` — локально)
- **Хранилище карт**: PNG в `static/webapp/cards/` (78 карт + рубашка)

### Структура проекта

```
taro_bot/
├── app.py                    # Точка входа (aiohttp + aiogram)
├── amvera.yaml               # Конфиг деплоя на Amvera
├── config.py                 # Pydantic Settings (читает .env / env vars)
├── requirements.txt          # Python зависимости
├── .gitignore
├── bot/
│   ├── handlers.py           # /start, выбор персонажа, WebApp кнопки
│   └── webapp_handler.py     # Обработка WEB_APP_DATA
├── core/
│   ├── llm.py                # OpenRouter интеграция, парсинг ответов, fallback
│   ├── prompts.py            # Сборка промптов (spread_type, позиции)
│   └── tarot.py              # Логика вытягивания карт
├── storage/
│   ├── db.py                 # SQLite (users, readings)
│   └── models.py             # Pydantic модели
├── data/
│   └── characters.json       # 3 персонажа с унифицированными промптами
├── tests/
│   └── test_tarot.py         # 17 тестов (pytest + pytest-asyncio)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROCESSES.md
│   ├── DESIGN.md
│   └── DEPLOYMENT.md         # ← этот файл
├── static/
│   ├── webapp/               # Собранный Next.js (index.html, _next/, cards/)
│   └── default/              # 229MB tarot png (gitignored, только локально)
├── web/                      # Исходники Next.js (node_modules gitignored)
│   └── src/
│       ├── components/       # React компоненты
│       └── pages/            # Next.js страницы
└── scripts/                  # Вспомогательные скрипты
```

---

## 2. Локальный запуск

```bash
git clone https://github.com/blinkstrike322/taro_bot.git
cd taro_bot

# Создать .env:
echo "BOT_TOKEN=ваш_токен" >> .env
echo "OPENROUTER_API_KEY=ваш_ключ" >> .env
echo "DB_PATH=taro_bot.db" >> .env
echo "WEBAPP_URL=http://localhost:8080" >> .env

# Установить зависимости:
pip install -r requirements.txt

# Запустить:
python app.py
# → aiohttp server started on port 8080
# → Start polling for bot @amotaro_bot
```

### Фронтенд (если нужно пересобрать WebApp)

```bash
cd web
npm install
npm run build
# Результат в static/webapp/
```

---

## 3. Amvera Cloud Deployment

### Платформа

- **Провайдер**: Amvera Cloud (https://cloud.amvera.ru)
- **Регион**: Варшава (`waw0`)
- **Модель**: Container-as-a-Service, деплой через Git push

### Домены

| Тип | URL |
|---|---|
| Внешний (HTTPS) | `https://taro-bot-blinkstrike.waw0.amvera.tech` |
| Внутренний | `run-taro-bot` |

### Конфиг (`amvera.yaml`)

```yaml
meta:
  environment: python
  toolchain:
    name: pip
    version: 3.12
build:
  requirementsPath: requirements.txt
run:
  command: python app.py
  containerPort: 8080
  persistenceMount: /data    # для SQLite
```

### Переменные окружения (дашборд Amvera → «Переменные»)

| Имя | Значение | Тип |
|---|---|---|
| `BOT_TOKEN` | `8435052557:AAFymH7akwoB6sEm_mLzRiHmxARovqW0PGw` | 🔒 Секрет |
| `OPENROUTER_API_KEY` | `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` | 🔒 Секрет |
| `DB_PATH` | `/data/taro_bot.db` | Обычная |
| `WEBAPP_URL` | `https://taro-bot-blinkstrike.waw0.amvera.tech` | Обычная |

> Переменные применяются на этапе **запуска** (run), не сборки (build).
> Секреты хранятся в отдельном хранилище, не в БД.

### GitHub интеграция

- **Репозиторий**: `github.com/blinkstrike322/taro_bot.git`
- **Триггер деплоя**: `git push origin main` → GitHub webhook → Amvera авто-сборка
- **Время деплоя**: ~2-3 минуты (pip install + запуск)

### Процесс деплоя

```
git add -A
git commit -m "описание"
git push origin main
# → GitHub → webhook → Amvera:
#   1. git pull
#   2. pip install -r requirements.txt
#   3. python app.py (на порту 8080)
```

---

## 4. Git Remotes

```
origin  https://github.com/blinkstrike322/taro_bot.git (fetch)
origin  https://github.com/blinkstrike322/taro_bot.git (push)
```

(Прямой Amvera remote не используется — деплой через GitHub webhook)

---

## 5. .gitignore (ключевые моменты)

```
/webapp/              # Игнорировать ТОЛЬКО корневой webapp/, НЕ static/webapp/
static/default/       # 229MB png, оставлен локально, не в git
.env                  # Локальные токены (на сервере — env vars из дашборда)
web/node_modules/     # Node.js зависимости (не в git)
web/.next/            # Next.js build cache
*.db                  # SQLite (на сервере — persistence mount)
```

> **Важно**: `/webapp/` (с leading slash) — иначе git игнорирует и `static/webapp/`

---

## 6. API Endpoints

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/api/spread` | Получить расклад (1 или 3 карты) |
| `GET` | `/api/readings` | История раскладов |
| `GET` | `/` | WebApp (Next.js static) |

### Пример curl

```bash
# 1 карта
curl -X POST https://taro-bot-blinkstrike.waw0.amvera.tech/api/spread \
  -H "Content-Type: application/json" \
  -d '{"tg_id":1,"spread_type":1,"character_id":"shadow_walker"}'

# 3 карты
curl -X POST https://taro-bot-blinkstrike.waw0.amvera.tech/api/spread \
  -H "Content-Type: application/json" \
  -d '{"tg_id":1,"spread_type":3,"character_id":"spark_of_chaos","question":"Что ждёт?"}'

# Проверка здоровья
curl https://taro-bot-blinkstrike.waw0.amvera.tech/api/readings?tg_id=1
```

---

## 7. LLM Pipeline

1. `core/tarot.py` тянет 1 или 3 карты
2. `core/prompts.py` собирает промпт с `spread_type` и позициями
3. `core/llm.py`:
   - Отправляет POST в OpenRouter (`/v1/chat/completions`)
   - Парсит JSON-ответ (поля: `intro`, `short_answer`, `card_meaning`, `advice`)
   - Если LLM не JSON — fallback через regex-парсер
   - Если LLM не отвечает — fallback из БД карт
4. Персонажи (`data/characters.json`): `shadow_walker`, `spark_of_chaos`, `ruin_keeper`

---

## 8. Персонажи

| ID | Тон | Промпт |
|---|---|---|
| `shadow_walker` | Поэтичный, мистический | Таинственный голос из тени |
| `spark_of_chaos` | Дерзкий, энергичный | Искра хаоса, огонь |
| `ruin_keeper` | Спокойный, мудрый | Хранитель руин, древний |

---

## 9. Ссылки

| Ресурс | URL |
|---|---|
| Бот в Telegram | `@amotaro_bot` |
| WebApp | `https://taro-bot-blinkstrike.waw0.amvera.tech` |
| Дашборд Amvera | `https://cloud.amvera.ru/projects/applications/taro-bot` |
| GitHub | `https://github.com/blinkstrike322/taro_bot` |
| OpenRouter | `https://openrouter.ai` |
| Локальный туннель | `localhost.run` (если надо протестировать без деплоя) |

---

## 10. Диагностика

### Проверить что бот жив

```bash
# API отвечает?
curl -s -o /dev/null -w "%{http_code}" \
  https://taro-bot-blinkstrike.waw0.amvera.tech/api/readings?tg_id=1
# → 200

# WebApp грузится?
curl -s -o /dev/null -w "%{http_code}" \
  https://taro-bot-blinkstrike.waw0.amvera.tech/
# → 200

# Бот получает апдейты?
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=1"
```

### Логи на Amvera
Дашборд Amvera → проект → раздел «Логи»:
- **Build log**: установка зависимостей, ошибки сборки
- **Run log**: вывод `app.py`, ошибки времени выполнения

### Типичные проблемы

| Симптом | Причина | Решение |
|---|---|---|
| `400: Only HTTPS links allowed` | В WEBAPP_URL нет `https://` | Добавить `https://` в начало |
| `404` на корне | WebApp не собран или не в git | `git ls-files static/webapp/` — проверить |
| Бот не отвечает | Не те переменные env | Проверить BOT_TOKEN в дашборде |
| `502/503` после деплоя | Идёт сборка | Подождать 2-3 минуты |

---

## 11. История изменений

| Дата | Коммит | Изменение |
|---|---|---|
| 2026-06-14 | `baaa3c0` | Move docs to docs/, удалены .env.example и run_web_only.py |
| 2026-06-14 | `3fa75f8` | Добавлен built webapp в git, фикс gitignore |
| 2026-06-14 | `e23d2da` | Rename amvera.yml → amvera.yaml, удалён static/default/ из git |
| 2026-06-14 | `8d8a4f0` | Add amvera.yml config, include built webapp in repo |
| 2026-06-14 | `eb5ac84` | LLM: JSON парсинг, 3-card позиции, intro поле |
