"""Dev-раннер: только веб-часть (aiohttp + static/webapp), без TG-поллинга и напоминаний.

Полный app.py при локальном запуске конфликтует с продакшеном за getUpdates
(409) и роняет весь процесс — здесь поллинга нет, прод-бот не затрагивается.

Запуск: python3 scripts/run_webapp_dev.py [порт]
БД по умолчанию — временная копия локальной taro_bot.db (записи не портят
боевую базу); переопределить: DB_PATH=... python3 scripts/run_webapp_dev.py

Для проверки в обычном браузере (без Telegram-обёртки) индекс отдаётся с
вшитым моком window.Telegram и валидной подписанной initData первого админа
(переопределить: DEV_TG_ID=123 python3 ...). Подпись считает тот же код, что
verify_telegram_init_data, поэтому бэкенд принимает запросы как из настоящего
WebApp.
"""
import asyncio
import hashlib
import hmac
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, quote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def sign_init_data(token: str, tg_id: int) -> str:
    user = json.dumps({"id": tg_id, "first_name": "Dev"}, separators=(",", ":"))
    check_string = "auth_date=1755700000\nuser=" + user
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return f"auth_date=1755700000&user={quote(user)}&hash={sig}"


def build_index_html(webapp_dir: Path, init_data: str) -> str | None:
    """index.html с вшитым до бандла моком Telegram WebApp."""
    html = (webapp_dir / "index.html").read_text(encoding="utf-8")
    boot = (
        "<script>window.Telegram={WebApp:{"
        f"initData:{json.dumps(init_data)},"
        "ready:function(){},expand:function(){},sendData:function(){},close:function(){},"
        "HapticFeedback:{notificationOccurred:function(){},impactOccurred:function(){},"
        "selectionChanged:function(){}}}};</script>"
    )
    if "<head>" in html:
        return html.replace("<head>", "<head>" + boot, 1)
    return boot + html


async def main() -> None:
    port = 8080
    args = [a for a in sys.argv[1:]]

    def arg_value(flag: str) -> str | None:
        return args[args.index(flag) + 1] if flag in args else None

    if arg_value("--init-data"):
        from config import settings
        print(sign_init_data(settings.BOT_TOKEN, int(arg_value("--init-data"))))
        return

    if args and args[0].isdigit():
        port = int(args[0])

    if "DB_PATH" not in os.environ:
        src = ROOT / "taro_bot.db"
        if src.exists():
            copy = Path(tempfile.mkdtemp(prefix="taro_dev_")) / "taro_bot.db"
            shutil.copy2(src, copy)
            os.environ["DB_PATH"] = str(copy)
            print(f"[dev] DB copy: {copy}")

    from aiohttp import web
    from config import settings
    from storage.db import init_db
    from app import (
        handle_readings, handle_disk_usage, handle_character,
        handle_spread, handle_followup, cache_control_middleware,
    )

    await init_db(settings.DB_PATH)

    tg_id = int(os.environ.get("DEV_TG_ID") or (settings.ADMIN_IDS.split(",")[0] if settings.ADMIN_IDS else 999999123))
    init_data = sign_init_data(settings.BOT_TOKEN, tg_id)
    print(f"[dev] mock Telegram WebApp initData for tg_id={tg_id}")

    app = web.Application(middlewares=[cache_control_middleware])
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_get('/api/disk', handle_disk_usage)
    app.router.add_get('/api/character', handle_character)
    app.router.add_post('/api/spread', handle_spread)
    app.router.add_post('/api/followup', handle_followup)

    webapp_dir = ROOT / "static" / "webapp"
    index_html = build_index_html(webapp_dir, init_data)

    async def index_handler(_):
        return web.Response(text=index_html, content_type="text/html", charset="utf-8")

    if index_html:
        app.router.add_get("/", index_handler)
    app.router.add_static("/", webapp_dir)

    offer_file = ROOT / "static" / "offer" / "index.html"
    if offer_file.exists():
        async def offer_handler(_):
            return web.FileResponse(offer_file)
        app.router.add_get("/offer", offer_handler)
        app.router.add_get("/offer/", offer_handler)

    async def _cleanup(app: web.Application) -> None:
        from core.llm import close_client
        await close_client()

    app.on_cleanup.append(_cleanup)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"[dev] webapp on http://localhost:{port}  (Ctrl+C to stop)")
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
