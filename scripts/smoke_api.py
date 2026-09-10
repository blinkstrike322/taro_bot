#!/usr/bin/env python3
# scripts/smoke_api.py
# Смоук-тест вебаппа без Telegram: валидный initData (HMAC от тестового
# BOT_TOKEN), полный цикл /api/spread/begin → poll, проверка позиций,
# авторитетного character_id, квоты и paywall-флага.
import asyncio
import hashlib
import hmac
import json
import os
import sys
import tempfile
from urllib.parse import quote

os.environ.setdefault("BOT_TOKEN", "smoke-test-token")
os.environ.setdefault("OPENROUTER_API_KEY", "smoke-test-key")
os.environ.setdefault("ADMIN_IDS", "999")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import app as app_mod
from config import settings
from storage.db import init_db
from core.quota import MONTHLY_LIMIT_FREE
from storage.db import get_db


async def fake_interpret_reading(question, cards, character_id="shadow_walker", spread_type=1):
    """Стаб LLM: мгновенный валидный ответ — смоук-тестируем API, не модели."""
    return {
        "intro": "шёпот дыма",
        "short_answer": "ответ стаба: канал жив",
        "card_meaning": [f"{c['name']}: значение" for c in cards],
        "advice": "возвращайся к тестам",
    }


app_mod.interpret_reading = fake_interpret_reading


def make_init_data(tg_id: int, token: str, age: int = 0) -> str:
    """Собрать валидный initData с правильной подписью."""
    import time
    from urllib.parse import urlencode
    data = {
        "auth_date": str(int(time.time()) - age),
        "query_id": "AAF...",
        "user": json.dumps({"id": tg_id, "first_name": "Smoke"}),
    }
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**data, "hash": sig})


async def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "taro.db")
        settings.DB_PATH = db_path
        await init_db(db_path)

        webapp = app_mod.create_webapp()
        client = TestClient(TestServer(webapp))
        await client.start_server()

        failures: list[str] = []

        def check(name: str, cond: bool, detail: str = ""):
            print(("  ✓ " if cond else "  ✗ ") + name + (f" — {detail}" if detail and not cond else ""))
            if not cond:
                failures.append(name)

        # ── авторизация ──
        init = make_init_data(101, settings.BOT_TOKEN)
        old_init = make_init_data(101, settings.BOT_TOKEN, age=48 * 3600)

        r = await client.post("/api/spread/begin", json={
            "init_data": old_init, "spread_type": 3, "question": "вопрос?"})
        check("initData старше 24ч отклоняется", r.status == 403, f"status={r.status}")

        r = await client.post("/api/spread/begin", json={
            "init_data": "hash=deadbeef", "spread_type": 3, "question": "q"})
        check("поддельная подпись отклоняется", r.status == 403, f"status={r.status}")

        # ── /begin: карты + токен + позиции ──
        r = await client.post("/api/spread/begin", json={
            "init_data": init,
            "spread_type": 3,
            "question": "что будет в отношениях?",
            "character_id": "spark_of_chaos",  # подделка — сервер должен игнорировать
        })
        body = await r.json()
        check("begin: 200 + 3 карты", r.status == 200 and len(body.get("cards", [])) == 3)
        check("begin: токен выдан", bool(body.get("token")))
        check("begin: позиции динамические (отношения)",
              body.get("positions") == ["Твоя позиция и энергия", "Динамика между вами", "Главный вектор развития"],
              str(body.get("positions")))
        check("begin: remaining = лимит-1", body.get("remaining") == MONTHLY_LIMIT_FREE - 1)

        token = body["token"]

        # ── /poll: шёпот (LLM недоступен → фолбэк, который всегда валиден) ──
        interp = None
        for _ in range(40):
            r = await client.get(f"/api/spread/poll?token={token}")
            pbody = await r.json()
            if pbody.get("ready"):
                interp = pbody.get("interpretation")
                break
            await asyncio.sleep(0.2)
        check("poll: толкование готово", interp is not None and bool(interp.get("short_answer")))

        # ── character_id авторитетен: из БД, а не из тела ──
        db = await get_db()
        from storage.db import get_user_by_tg_id
        user = await get_user_by_tg_id(db, 101)
        check("проводник из БД (shadow_walker), а не из запроса",
              user.character_id == "shadow_walker")
        # и в сохранённом чтении — тоже из БД
        from storage.db import get_user_readings_by_month
        import datetime
        now = datetime.datetime.utcnow()
        readings = await get_user_readings_by_month(db, 101, now.strftime("%Y"), now.strftime("%m"))
        check("чтение сохранено с авторитетным проводником",
              len(readings) == 1 and readings[0]["character_id"] == "shadow_walker")

        # ── квота: исчерпание → 429 + needs_subscription ──
        for _ in range(MONTHLY_LIMIT_FREE - 1):
            r = await client.post("/api/spread/begin", json={
                "init_data": init, "spread_type": 1, "question": "q"})
            assert r.status == 200
        r = await client.post("/api/spread/begin", json={
            "init_data": init, "spread_type": 1, "question": "q"})
        qbody = await r.json()
        check("квота исчерпана → 429", r.status == 429)
        check("429 содержит needs_subscription", qbody.get("needs_subscription") is True)

        # ── daily: 1 в день ──
        r = await client.post("/api/spread/begin", json={
            "init_data": make_init_data(202, settings.BOT_TOKEN), "spread_type": 1, "question": None})
        check("карта дня проходит", r.status == 200)
        r = await client.post("/api/spread/begin", json={
            "init_data": make_init_data(202, settings.BOT_TOKEN), "spread_type": 1, "question": None})
        check("вторая карта дня в тот же день → 429", r.status == 429)

        # ── /api/disk: только админ ──
        r = await client.get(f"/api/disk?init_data={quote(make_init_data(101, settings.BOT_TOKEN))}")
        check("/api/disk не-админу → 403", r.status == 403)
        r = await client.get(f"/api/disk?init_data={quote(make_init_data(999, settings.BOT_TOKEN))}")
        check("/api/disk админу → 200", r.status == 200, f"status={r.status}")

        # ── /api/spread (классический) больше не существует ──
        r = await client.post("/api/spread", json={"init_data": init, "spread_type": 1})
        check("легаси /api/spread удалён", r.status in (404, 405), f"status={r.status}")

        await client.close()

    print()
    if failures:
        print(f"ПРОВАЛЕНО: {failures}")
        return 1
    print("СМОУК-ТЕСТ: все проверки пройдены")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
