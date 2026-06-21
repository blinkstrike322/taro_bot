# Monetization & Quota System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task.

**Goal:** Добавить Telegram Stars подписку, квоты (3 расклада/день free, 100/мес paid) и миграцию БД на persistent volume.

**Architecture:** SQLite в `/data/`, миграции через try/except ALTER TABLE, квоты считаются через SQL COUNT из таблицы readings, платежи через Telegram Bot API sendInvoice с XTR.

**Tech Stack:** Python 3.12, aiogram, aiosqlite, Telegram Stars (XTR)

## Global Constraints

- DB_PATH: `/data/taro_bot.db` на Amvera (persistence mount), `./taro_bot.db` локально (через .env)
- Миграции БД — идиоматические SQLite (ALTER TABLE в try/except OperationalError)
- Daily card — без квот всегда
- Free users: 3 не-daily расклада/день (сбрасывается каждый день)
- Paid users: 100 раскладов/мес (сбрасывается каждый месяц)
- Цена: первый месяц 100 Stars, далее 600 Stars/мес
- Telegram проверка initData через HMAC-SHA256 (уже есть в app.py)
- Все изменения пушатся в main → авто-деплой на Amvera

---

### Task 1: DB path + миграция колонок

**Files:**
- Modify: `config.py` (DB_PATH default)
- Modify: `storage/db.py` (миграция колонок в init_db, новые функции)

**Interfaces:**
- Consumes: существующая схема users(id, tg_id, character_id, created_at, last_active_at, last_reminder_sent_at)
- Produces: колонки `subscription_end TEXT`, `first_month_done INTEGER DEFAULT 0`

- [ ] **Step 1: Сменить DB_PATH по умолчанию**

```python
# config.py — меняем дефолт
DB_PATH: str = "/data/taro_bot.db"  # переопределяется через .env: DB_PATH=./taro_bot.db
```

- [ ] **Step 2: Добавить миграцию колонок в init_db**

```python
# storage/db.py — добавить после CREATE TABLE
async def _migrate_schema(db: aiosqlite.Connection) -> None:
    """Idiomatic SQLite migrations — try ALTER, ignore if exists."""
    migrations = [
        "ALTER TABLE users ADD COLUMN subscription_end TEXT",
        "ALTER TABLE users ADD COLUMN first_month_done INTEGER DEFAULT 0",
    ]
    for sql in migrations:
        try:
            await db.execute(sql)
            await db.commit()
        except aiosqlite.OperationalError:
            pass  # колонка уже существует

# Вызвать в init_db после CREATE TABLE
await _migrate_schema(conn)
```

- [ ] **Step 3: Добавить функции для работы с подпиской**

```python
# storage/db.py — новые функции

async def is_subscribed(db: aiosqlite.Connection, tg_id: int) -> bool:
    """Check if user has active subscription (not expired)."""
    cursor = await db.execute(
        "SELECT subscription_end FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    if row is None or row[0] is None:
        return False
    return row[0] > datetime.utcnow().isoformat()[:19]

async def get_daily_non_daily_count(db: aiosqlite.Connection, user_id: int) -> int:
    """Count non-daily readings today for a user."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' AND date(created_at) = date('now')",
        (user_id,),
    )
    row = await cursor.fetchone()
    return row[0]

async def get_monthly_non_daily_count(db: aiosqlite.Connection, user_id: int) -> int:
    """Count non-daily readings this month for a user."""
    cursor = await db.execute(
        "SELECT COUNT(*) FROM readings WHERE user_id = ? AND type != 'daily' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
        (user_id,),
    )
    row = await cursor.fetchone()
    return row[0]

async def get_user_by_tg_id(db: aiosqlite.Connection, tg_id: int) -> Optional[User]:
    """Get full user row by tg_id."""
    cursor = await db.execute(
        "SELECT id, tg_id, character_id, created_at, last_active_at, last_reminder_sent_at, subscription_end, first_month_done FROM users WHERE tg_id = ?",
        (tg_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return User(
        id=row[0], tg_id=row[1], character_id=row[2],
        created_at=row[3], last_active_at=row[4],
        last_reminder_sent_at=row[5],
        subscription_end=row[6], first_month_done=row[7],
    )

async def activate_subscription(db: aiosqlite.Connection, tg_id: int, first_month: bool = False) -> None:
    """Set subscription_end to 30 days from now."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days'), first_month_done = ? WHERE tg_id = ?",
        (1 if first_month else 0, tg_id),
    )
    await db.commit()

async def update_first_month_done(db: aiosqlite.Connection, tg_id: int) -> None:
    """Mark that user has used their first-month discount."""
    await db.execute(
        "UPDATE users SET first_month_done = 1 WHERE tg_id = ?",
        (tg_id,),
    )
    await db.commit()
```

- [ ] **Step 4: Обновить модель User**

```python
# storage/models.py
class User(BaseModel):
    id: int
    tg_id: int
    character_id: str = "shadow_walker"
    created_at: str
    last_active_at: str
    last_reminder_sent_at: Optional[str] = None
    subscription_end: Optional[str] = None  # NEW
    first_month_done: int = 0               # NEW
```

- [ ] **Step 5: Проверить синтаксис**

```bash
python3 -m py_compile config.py storage/db.py storage/models.py && echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: db migration for subscription columns + path"
```

---

### Task 2: core/quota.py — система проверки лимитов

**Files:**
- Create: `core/quota.py`
- Test: `tests/test_quota.py`

**Interfaces:**
- Consumes: `is_subscribed()`, `get_daily_non_daily_count()`, `get_monthly_non_daily_count()` из storage/db.py
- Produces: `check_quota(db, user_id: int, tg_id: int, spread_type: str) -> dict`

- [ ] **Step 1: Написать quota.py**

```python
# core/quota.py
import logging
from typing import Optional
import aiosqlite
from storage.db import is_subscribed, get_daily_non_daily_count, get_monthly_non_daily_count

logger = logging.getLogger(__name__)

DAILY_LIMIT_FREE = 3
MONTHLY_LIMIT_PAID = 100

async def check_quota(
    db: aiosqlite.Connection,
    user_id: int,
    tg_id: int,
    spread_type: str,
) -> dict:
    """
    Check if user can do a spread.
    Returns {"ok": True} or {"ok": False, "reason": str, "needs_subscription": bool}
    
    - daily card: always ok
    - non-daily: free users limited to DAILY_LIMIT_FREE/day
    - paid users: limited to MONTHLY_LIMIT_PAID/month
    """
    if spread_type == "daily":
        return {"ok": True}
    
    subscribed = await is_subscribed(db, tg_id)
    
    if not subscribed:
        daily_count = await get_daily_non_daily_count(db, user_id)
        if daily_count >= DAILY_LIMIT_FREE:
            return {
                "ok": False,
                "reason": f"Лимит {DAILY_LIMIT_FREE} расклада в день. Оформи подписку — 100 раскладов в месяц.",
                "needs_subscription": True,
            }
        return {"ok": True}
    
    # Paid user
    monthly_count = await get_monthly_non_daily_count(db, user_id)
    if monthly_count >= MONTHLY_LIMIT_PAID:
        return {
            "ok": False,
            "reason": f"Лимит {MONTHLY_LIMIT_PAID} раскладов в месяц. Жди следующего месяца или продли подписку.",
            "needs_subscription": True,
        }
    return {"ok": True}
```

- [ ] **Step 2: Написать тесты**

```python
# tests/test_quota.py
import pytest
import aiosqlite
from core.quota import check_quota, DAILY_LIMIT_FREE, MONTHLY_LIMIT_PAID

@pytest.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE NOT NULL,
            character_id TEXT DEFAULT 'shadow_walker',
            created_at TEXT DEFAULT (datetime('now')),
            last_active_at TEXT DEFAULT (datetime('now')),
            last_reminder_sent_at TEXT,
            subscription_end TEXT,
            first_month_done INTEGER DEFAULT 0
        )
    """)
    await conn.execute("""
        CREATE TABLE readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    await conn.execute("INSERT INTO users (tg_id) VALUES (1)")
    await conn.commit()
    yield conn
    await conn.close()

@pytest.mark.asyncio
async def test_daily_card_always_free(db):
    """Daily card не проверяет квоту."""
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="daily")
    assert result == {"ok": True}

@pytest.mark.asyncio
async def test_free_user_under_limit(db):
    """Free пользователь с 0 раскладами сегодня — может делать расклад."""
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result == {"ok": True}

@pytest.mark.asyncio
async def test_free_user_over_limit(db):
    """Free пользователь с DAILY_LIMIT_FREE раскладами сегодня — отказано."""
    for i in range(DAILY_LIMIT_FREE):
        await db.execute(
            "INSERT INTO readings (user_id, type, created_at) VALUES (?, 'spread_1', datetime('now'))",
            (1,),
        )
    await db.commit()
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result["ok"] is False
    assert result["needs_subscription"] is True

@pytest.mark.asyncio
async def test_paid_user_under_limit(db):
    """Paid пользователь с подпиской и 0 раскладами в месяце — может делать расклад."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days') WHERE tg_id = 1"
    )
    await db.commit()
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result == {"ok": True}

@pytest.mark.asyncio
async def test_paid_user_over_limit(db):
    """Paid пользователь превысил месячный лимит — отказано."""
    await db.execute(
        "UPDATE users SET subscription_end = datetime('now', '+30 days') WHERE tg_id = 1"
    )
    await db.commit()
    for i in range(MONTHLY_LIMIT_PAID):
        await db.execute(
            "INSERT INTO readings (user_id, type, created_at) VALUES (?, 'spread_1', datetime('now'))",
            (1,),
        )
    await db.commit()
    result = await check_quota(db, user_id=1, tg_id=1, spread_type="spread_1")
    assert result["ok"] is False
    assert result["needs_subscription"] is True
```

- [ ] **Step 3: Запустить тесты**

```bash
cd /Users/omr/Library/Application\ Support/JetBrains/DataSpell2026.1/projects/workspace/taro_bot
python3 -m pytest tests/test_quota.py -v
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: quota system with daily/monthly limits"
```

---

### Task 3: core/payments.py — Telegram Stars платежи

**Files:**
- Create: `core/payments.py`

**Interfaces:**
- Consumes: `activate_subscription()`, `get_user_by_tg_id()` из storage/db.py
- Produces: константы PRICES, функция расчета цены

- [ ] **Step 1: Написать payments.py**

```python
# core/payments.py
import logging
from aiogram.types import LabeledPrice

logger = logging.getLogger(__name__)

FIRST_MONTH_PRICE = 100   # Stars
REGULAR_PRICE = 600       # Stars

SUBSCRIPTION_TITLE = "Подписка на месяц"
SUBSCRIPTION_DESCRIPTION_FIRST = "100 раскладов в месяц. Первый месяц — скидка!"
SUBSCRIPTION_DESCRIPTION_REGULAR = "100 раскладов в месяц."

def get_subscription_price(first_month: bool = False) -> list[LabeledPrice]:
    """Return LabeledPrice for Telegram invoice."""
    amount = FIRST_MONTH_PRICE if first_month else REGULAR_PRICE
    return [LabeledPrice(label="Подписка", amount=amount)]
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: payments config for Telegram Stars"
```

---

### Task 4: bot/handlers.py — хендлеры подписки и кнопка в меню

**Files:**
- Modify: `bot/handlers.py`

**Interfaces:**
- Consumes: `core/payments.py`, `storage/db.py` функции
- Produces: `/subscribe`, `/my`, pre_checkout_query, successful_payment обработчики

- [ ] **Step 1: Добавить импорты и константы**

```python
# bot/handlers.py — добавить импорты
from aiogram.filters import Command, CommandObject
from aiogram.types import LabeledPrice, PreCheckoutQuery, SuccessfulPayment
from core.payments import get_subscription_price, FIRST_MONTH_PRICE, REGULAR_PRICE
from core.quota import check_quota
from storage.db import (
    get_user_by_tg_id, activate_subscription,
    get_daily_non_daily_count, get_monthly_non_daily_count,
    is_subscribed,
)
```

- [ ] **Step 2: Добавить кнопку подписки в меню**

```python
# bot/handlers.py — _main_menu_keyboard добавить кнопку
def _main_menu_keyboard() -> InlineKeyboardMarkup:
    url = settings.WEBAPP_URL
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="РАСКЛАД 1 КАРТА", web_app=WebAppInfo(url=f"{url}?type=1"))],
        [InlineKeyboardButton(text="РАСКЛАД 3 КАРТЫ", web_app=WebAppInfo(url=f"{url}?type=3"))],
        [InlineKeyboardButton(text="КАРТА ДНЯ", web_app=WebAppInfo(url=f"{url}?type=daily"))],
        [InlineKeyboardButton(text="МОЯ ПОДПИСКА", callback_data="subscribe")],
        [InlineKeyboardButton(text="СМЕНИТЬ ПРОВОДНИКА", callback_data="char:select")],
    ])
```

- [ ] **Step 3: Хендлер /subscribe**

```python
@start_router.message(Command("subscribe"))
async def cmd_subscribe(message: types.Message) -> None:
    """Send invoice for subscription."""
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, message.from_user.id)
        first_month = user is not None and user.first_month_done == 0
        prices = get_subscription_price(first_month=first_month)
        
        await message.answer_invoice(
            title=SUBSCRIPTION_TITLE,
            description=SUBSCRIPTION_DESCRIPTION_FIRST if first_month else SUBSCRIPTION_DESCRIPTION_REGULAR,
            payload=f"sub:{message.from_user.id}",
            currency="XTR",
            prices=prices,
            start_parameter="subscribe",
        )
    finally:
        await db.close()
```

- [ ] **Step 4: Хендлер /my — статус подписки**

```python
@start_router.message(Command("my"))
async def cmd_my_status(message: types.Message) -> None:
    """Show subscription status and remaining spreads."""
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, message.from_user.id)
        if user is None:
            await message.answer("Ты ещё не начал. Напиши /start")
            return
        
        subscribed = await is_subscribed(db, message.from_user.id)
        
        if subscribed:
            daily = await get_daily_non_daily_count(db, user.id)
            monthly = await get_monthly_non_daily_count(db, user.id)
            remaining_monthly = max(0, 100 - monthly)
            sub_end = user.subscription_end or "?"
            await message.answer(
                f"⭐ Подписка активна до {sub_end[:10]}\n"
                f"Осталось раскладов в месяце: {remaining_monthly}\n"
                f"Сегодня использовано: {daily} из 3 (бесплатные не считаются)",
            )
        else:
            await message.answer(
                "У тебя пока нет подписки.\n"
                "Бесплатно: 3 расклада в день.\n"
                "Подписка: 100 раскладов в месяц.\n"
                "Первый месяц — 100 ⭐, далее — 600 ⭐ в месяц.\n"
                "/subscribe — оформить",
            )
    finally:
        await db.close()
```

- [ ] **Step 5: Pre-checkout query (подтверждение платежа)**

```python
@start_router.pre_checkout_query()
async def pre_checkout_handler(pre_checkout_q: PreCheckoutQuery) -> None:
    """Always approve pre-checkout (можно добавить валидацию позже)."""
    await pre_checkout_q.answer(ok=True)
```

- [ ] **Step 6: Successful payment (активация подписки)**

```python
@start_router.message(F.successful_payment)
async def successful_payment_handler(message: types.Message) -> None:
    """Activate subscription after successful payment."""
    payload = message.successful_payment.invoice_payload
    # payload format: "sub:{tg_id}"
    tg_id = int(payload.split(":")[1])
    
    db = await aiosqlite.connect(settings.DB_PATH)
    try:
        user = await get_user_by_tg_id(db, tg_id)
        is_first = user is not None and user.first_month_done == 0
        await activate_subscription(db, tg_id, first_month=is_first)
        
        await message.answer(
            "✅ Подписка активирована!\n"
            "Тебе доступно 100 раскладов в месяц.\n"
            "Возвращайся в любое время — карты ждут.",
            reply_markup=_main_menu_keyboard(),
        )
    finally:
        await db.close()
```

- [ ] **Step 7: Кнопка "Моя подписка" в callback**

```python
@start_router.callback_query(F.data == "subscribe")
async def subscribe_button(callback: types.CallbackQuery) -> None:
    """Handle subscribe button from menu."""
    await cmd_subscribe(callback.message)
    await callback.answer()
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: subscription handlers with Telegram Stars"
```

---

### Task 5: app.py — проверка quota в handle_spread

**Files:**
- Modify: `app.py`

**Interfaces:**
- Consumes: `check_quota()` из core/quota.py
- Produces: JSON ответ с ошибкой при превышении лимита

- [ ] **Step 1: Добавить проверку quota в handle_spread**

```python
# app.py — handle_spread, вставить после проверки init_data
from core.quota import check_quota

async def handle_spread(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    
    init_data = body.get('init_data', '')
    user = verify_telegram_init_data(init_data)
    if not user:
        return web.json_response({"error": "unauthorized"}, status=403)
    
    tg_id = user.get('id', 0)
    spread_type = body.get('spread_type', 1)
    question = body.get('question')
    character_id = body.get('character_id', 'shadow_walker')
    
    if not tg_id:
        return web.json_response({"error": "tg_id required"}, status=400)
    
    type_str = "daily" if spread_type == "daily" else f"spread_{spread_type}"
    
    # ── QUOTA CHECK ──
    db = await get_db()
    db_user = await get_or_create_user(db, tg_id)
    quota = await check_quota(db, db_user.id, tg_id, type_str)
    if not quota["ok"]:
        return web.json_response({
            "error": "quota_exceeded",
            "reason": quota["reason"],
            "needs_subscription": quota.get("needs_subscription", False),
        }, status=403)
    
    # ── continue with normal flow ──
    count = 3 if spread_type == 3 else 1
    cards = draw_cards(count)
    interpretation = await interpret_reading(
        question=question,
        cards=cards,
        character_id=character_id,
        spread_type=spread_type,
    )
    
    await save_reading(
        db=db,
        user_id=db_user.id,
        type=type_str,
        question=question,
        cards_data={"cards": cards, "spread_type": spread_type},
        interpretation=interpretation,
        character_id=character_id,
    )
    return web.json_response({"cards": cards, "interpretation": interpretation})
```

- [ ] **Step 2: Проверить синтаксис**

```bash
python3 -m py_compile app.py bot/handlers.py core/quota.py core/payments.py storage/db.py storage/models.py && echo "OK"
```

- [ ] **Step 3: Frontend — показать ошибку в WebApp** (опционально, если уже есть обработка ошибок)

WebApp уже должен уметь показывать ошибку, если приходит `{"error": "quota_exceeded", ...}`. Проверить существующий фронтенд.

- [ ] **Step 4: Commit и пуш**

```bash
git add -A && git commit -m "feat: quota check in spread API"
git push origin main
```

---

### Task 6: Проверка на Amvera

- [ ] **Step 1: Дождаться деплоя** (~2-3 минуты)
- [ ] **Step 2: Проверить логи** — дашборд Amvera → Run log, убедиться что нет ошибок
- [ ] **Step 3: Проверить API** — сделать тестовый запрос
- [ ] **Step 4: Проверить в боте** — /subscribe, /my
