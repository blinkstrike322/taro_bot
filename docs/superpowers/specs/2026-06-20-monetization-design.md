# Monetization & Quota System — Design

## TL;DR
Telegram Stars подписка с квотами. Free: 3 не-daily расклада/день. Paid: 100/мес за 600 Stars (первый месяц 100). Daily card — бесплатно всем без лимита.

---

## 1. Database

### Путь
- На Amvera: `/data/taro_bot.db` (persistenceMount)
- Локально: `./taro_bot.db` (через .env)

config.py:
```python
DB_PATH: str = "/data/taro_bot.db"  # может быть переопределён через .env
```

### Новые колонки в `users`
```sql
ALTER TABLE users ADD COLUMN subscription_end TEXT;       -- NULL или ISO-дата
ALTER TABLE users ADD COLUMN first_month_done INTEGER DEFAULT 0;  -- 0/1
```

### Квоты считаются через READINGS TABLE (не через счётчики)
```sql
-- ежедневный лимит (не-daily расклады сегодня)
SELECT COUNT(*) FROM readings
WHERE user_id = ? AND type != 'daily'
AND date(created_at) = date('now');

-- месячный лимит (для подписчиков)
SELECT COUNT(*) FROM readings
WHERE user_id = ? AND type != 'daily'
AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now');
```

---

## 2. Telegram Stars Payments

### Поток

```
User → /subscribe
  Bot → sendInvoice(currency="XTR", prices=[{amount=100, label="Первый месяц"}])
         или sendInvoice(currency="XTR", prices=[{amount=600, label="Подписка на месяц"}])
         (в зависимости от first_month_done)
  Telegram → pre_checkout_query → Bot → answerPreCheckoutQuery(ok)
  Telegram → successful_payment → Bot → subscription_end = now + 30 days
```

### Хендлеры

| Handler | Trigger | Действие |
|---|---|---|
| `cmd_subscribe` | /subscribe | Выставить счёт (100 или 600 Stars) |
| `pre_checkout_handler` | pre_checkout_query | Подтвердить платёж |
| `successful_payment_handler` | successful_payment | Активировать подписку |
| `cmd_my_status` | /my | Статус: подписка до, осталось раскладов сегодня/месяц |

### Главное меню — добавить кнопку
```
[РАСКЛАД 1 КАРТА]  [РАСКЛАД 3 КАРТЫ]
[КАРТА ДНЯ]        [МОЯ ПОДПИСКА]
[СМЕНИТЬ ПРОВОДНИКА]
```

---

## 3. Quota Enforcement

### Где проверять

Два места, где генерируется расклад:
1. `app.py → handle_spread()` — расклад через WebApp
2. `bot/webapp_handler.py → handle_webapp_data()` — daily card через кнопку

### Логика

```python
async def check_quota(db, user, spread_type) -> dict:
    """
    Returns {"ok": True} or {"ok": False, "reason": "...", "button": "..."}
    """
    if spread_type == "daily":
        return {"ok": True}  # daily card всегда бесплатно

    # daily limit
    daily_count = await get_daily_non_daily_count(db, user.id)
    if daily_count >= 3 and not is_subscribed(user):
        return {"ok": False, "reason": "Лимит 3 расклада в день", "button": "subscribe"}

    if is_subscribed(user):
        monthly_count = await get_monthly_count(db, user.id)
        if monthly_count >= 100:
            return {"ok": False, "reason": "Лимит 100 раскладов в месяц", "button": "topup"}
        return {"ok": True}

    return {"ok": True}
```

### При превышении — ответ

WebApp: возвращать JSON с `{"error": "quota_exceeded", "reason": "...", "subscribe_url": "...грамотно сформированная ссылка на бота..."}`
Bot (handlers.py / webapp_handler.py): отвечать сообщением + кнопка "Оформить подписку"

---

## 4. Daily Card — без лимитов

`handle_webapp_data` для `action == "card_picked"`:
- Уже проверяет `has_daily_reading()` — одну в день
- **Не проверяет quota** — daily card free всегда
- Не инкрементит счётчик daily/monthly

---

## 5. Telegram Stars Economics

| Параметр | Значение |
|---|---|
| Цена подписки | 600 Stars/мес (~600р) |
| Первый месяц | 100 Stars (~100р) |
| Free лимит | 3 не-daily расклада/день |
| Paid лимит | 100 раскладов/мес |
| Комиссия Telegram | ~30% (на покупке Stars) + ~2.5% (на выводе) |
| Доход на руки | ~400р/мес с платящего юзера |

---

## 6. User Flow

### Новый пользователь
1. /start → выбирает проводника → главное меню
2. Делает карту дня (бесплатно)
3. Делает 1-2 расклада
4. На 4-м раскладе в день: "Лимит исчерпан. Оформи подписку за 100 Stars на первый месяц"
5. /subscribe → платит → подписка активна

### Возвращающийся пользователь
1. /start → главное меню (счётчик раскладов где-нибудь)
2. Карта дня — всегда доступна
3. Расклады — пока не кончились
4. /my — статус подписки, остаток

---

## 7. Files to change/create

| File | Действие |
|---|---|
| `config.py` | DB_PATH → `/data/taro_bot.db` |
| `storage/db.py` | Добавить миграцию колонок, функции `is_subscribed()`, `get_daily_count()`, `get_monthly_count()` |
| `storage/models.py` | `User.subscription_end`, `User.first_month_done` |
| `bot/handlers.py` | Хендлеры `/subscribe`, `/my`; pre_checkout, successful_payment; кнопка подписки в меню |
| `bot/webapp_handler.py` | Проверять quota перед daily card (не нужно — daily free) |
| `app.py` | Проверять quota в `handle_spread()`, возвращать ошибку |
| `core/quota.py` | (NEW) Функция `check_quota()` |
| `core/payments.py` | (NEW) Логика Stars платежей |
