"""Local integration harness: real API/storage, explicit canned LLM, no credentials.

Bind to loopback only. Never polls Telegram, sends messages or calls providers.
Use alongside Next dev with Playwright routing /api to this server. Test identity
is signed with a dummy key and is only useful against this disposable server.
"""
import asyncio
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Override every credential before config import. The worktree's .env is never read
# for a usable secret: these values take precedence through BaseSettings.
os.environ.update({
    "BOT_TOKEN": "123456:premium-local-test",
    "OPENROUTER_API_KEY": "local-test-disabled",
    "OPENCODE_ZEN_KEY": "",
    "OPENCODE_ZEN_SESSION": "",
    "OPENCODE_ZEN_ENABLED": "false",
    "ADMIN_IDS": "",
    "TESTER_IDS": "",
    "DB_PATH": str(Path(tempfile.mkdtemp(prefix="arcanum-test-")) / "test.db"),
})

from aiohttp import web  # noqa: E402

import app as app_module  # noqa: E402
from core.tarot import load_cards  # noqa: E402
from storage.db import get_db, init_db  # noqa: E402


def test_identity() -> str:
    fields = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": 919191, "first_name": "Local test"}, separators=(",", ":")),
    }
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", os.environ["BOT_TOKEN"].encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def fixed_cards(count: int) -> list[dict]:
    deck = {c["id"]: c for c in load_cards()}
    ids = ["the-moon", "the-fool", "the-hermit"]
    ids.extend(k for k in deck if k not in ids)
    return [{**deck[k], "image_url": f"/cards/{k}.png", "is_reversed": False,
             "orientation": "upright"} for k in ids[:count]]


async def fixture_reading(question=None, cards=None, positions=None, **kwargs):
    await asyncio.sleep(0.25)
    return {
        "intro": "Тестовое чтение для проверки интерфейса и сохранения сеанса.",
        "short_answer": "Проясни, что уже известно, и выбери небольшой следующий шаг.",
        "позиции": [
            {"позиция": (positions or [])[i] if i < len(positions or []) else f"Позиция {i + 1}",
             "карта": c["name"], "реверс": c.get("is_reversed", False),
             "трактовка": "Это фиксированный тестовый текст. Он позволяет проверить чтение, возврат в сеанс и журнал без обращения к модели."}
            for i, c in enumerate(cards or [])
        ],
        "связь_карт": "Все позиции относятся к одному сохранённому вопросу. Обновление страницы не меняет карты.",
        "advice": "Назови одно действие, которое поможет получить больше ясности.",
    }


async def fixture_ask(*args, **kwargs):
    return "Фиксированный ответ тестового сервера: уточнение относится к исходной карте и вопросу, без новой тяги."


async def main():
    await init_db(os.environ["DB_PATH"])
    app_module.interpret_reading = fixture_reading
    app_module._ask_llm = fixture_ask
    app_module.draw_cards = fixed_cards
    application = app_module.create_webapp()
    async def identity_handler(request):
        return web.json_response({"init_data": test_identity()})
    application.router.add_get("/__test_identity", identity_handler)
    runner = web.AppRunner(application)
    await runner.setup()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8097
    await web.TCPSite(runner, "127.0.0.1", port).start()
    print(f"Local test API: http://127.0.0.1:{port}; canned LLM; temporary DB; no provider calls", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
        tasks = list(app_module._whisper_tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await (await get_db()).close()


if __name__ == "__main__":
    asyncio.run(main())
