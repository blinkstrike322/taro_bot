"""Quick E2E check of the new API endpoints (spread daily + followup).

Signs init_data with the real BOT_TOKEN, runs the aiohttp app on a temp port
and a temp SQLite DB. Makes real LLM calls (with cards-db fallback).
"""
import asyncio
import hashlib
import hmac
import json
import tempfile
import os

import httpx

TMP_DB = os.path.join(tempfile.mkdtemp(), "e2e.db")


def sign_init_data(token: str, tg_id: int = 999999123) -> str:
    from urllib.parse import quote
    user = json.dumps({"id": tg_id, "first_name": "E2E"}, separators=(",", ":"))
    # Telegram: data_check_string строится из отсортированных пар БЕЗ hash
    check_string = f"auth_date=1755700000\nuser={user}"
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return f"auth_date=1755700000&user={quote(user)}&hash={sig}"


async def main():
    from config import settings
    from app import create_webapp, verify_telegram_init_data
    from storage.db import init_db

    await init_db(TMP_DB)
    app = create_webapp()

    from aiohttp import web
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 8901)
    await site.start()
    print("server on 8901")

    init_data = sign_init_data(settings.BOT_TOKEN)
    assert verify_telegram_init_data(init_data), "init_data signature FAILED"
    print("init_data signature OK")

    base = "http://127.0.0.1:8901"
    async with httpx.AsyncClient(timeout=240.0) as client:
        # 1) daily spread
        r = await client.post(f"{base}/api/spread", json={
            "init_data": init_data,
            "spread_type": "daily",
            "question": None,
            "character_id": "shadow_walker",
        })
        print("spread daily:", r.status_code)
        data = r.json()
        assert r.status_code == 200, data
        assert "reading_id" in data and isinstance(data["reading_id"], int)
        assert len(data["cards"]) == 3, f"expected 3 daily cards, got {len(data['cards'])}"
        interp = data["interpretation"]
        print("  cards:", [c["name"] for c in data["cards"]])
        print("  intro:", interp.get("intro", "")[:100])
        print("  advice:", interp.get("advice", "")[:100])
        reading_id = data["reading_id"]

        # 2) followup on that reading
        r2 = await client.post(f"{base}/api/followup", json={
            "init_data": init_data,
            "reading_id": reading_id,
            "question": "А что мне сделать сегодня вечером?",
        })
        print("followup:", r2.status_code)
        d2 = r2.json()
        assert r2.status_code == 200, d2
        print("  answer:", d2.get("answer", "")[:200])
        assert d2.get("answer")

        # 3) second followup (history path)
        r3 = await client.post(f"{base}/api/followup", json={
            "init_data": init_data,
            "reading_id": reading_id,
            "question": "Расскажи подробнее про вторую карту",
        })
        print("followup#2:", r3.status_code, "remaining:", r3.json().get("remaining"))
        assert r3.status_code == 200

        # 4) access control: another reading id must 404
        r4 = await client.post(f"{base}/api/followup", json={
            "init_data": init_data,
            "reading_id": 999999,
            "question": "тест",
        })
        assert r4.status_code == 404, r4.status_code
        print("followup access control OK (404)")

        # 5) 1-card spread with question (love category)
        r5 = await client.post(f"{base}/api/spread", json={
            "init_data": init_data,
            "spread_type": 1,
            "question": "Вернётся ли он ко мне?",
            "character_id": "spark_of_chaos",
        })
        print("spread 1:", r5.status_code)
        d5 = r5.json()
        assert r5.status_code == 200 and len(d5["cards"]) == 1
        print("  short_answer:", d5["interpretation"].get("short_answer", "")[:150])

    await runner.cleanup()
    print("\nALL E2E CHECKS PASSED")


asyncio.run(main())
