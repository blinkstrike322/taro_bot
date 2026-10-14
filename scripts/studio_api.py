"""Explicit loopback studio entrypoint. Production never imports this module."""

import asyncio
import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def prepare_environment(mode, path, source):
    env = dict(source)
    env.update(
        BOT_TOKEN="123456:arcanum-studio-only",
        DB_PATH=str(path),
        ADMIN_IDS="919191",
        TESTER_IDS="",
        OPENCODE_ZEN_ENABLED="false",
        OPENCODE_ZEN_KEY="",
        OPENCODE_ZEN_SESSION="",
        OPENROUTER_MODELS="inclusionai/ling-3.0-flash",
    )
    if mode == "fixture":
        env["OPENROUTER_API_KEY"] = "fixture-disabled"
    elif mode != "live" or not env.get("OPENROUTER_API_KEY"):
        raise ValueError("Live mode requires explicit server key file.")
    return env


def database_namespace(path, reset=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    marker = path.with_suffix(".namespace")
    if reset or not marker.exists():
        marker.write_text(uuid.uuid4().hex)
    return marker.read_text().strip()


def signed_identity(token):
    fields = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": 919191, "first_name": "Студия"}, separators=(",", ":")),
    }
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(
        secret, "\n".join(f"{k}={fields[k]}" for k in sorted(fields)).encode(), hashlib.sha256
    ).hexdigest()
    return urlencode(fields)


async def serve(args):
    path = Path(args.db or ROOT / ".local" / f"studio-{args.mode}.sqlite3").resolve()
    source = dict(os.environ)
    if args.mode == "live":
        if not args.key_file:
            raise ValueError("--mode live requires --key-file; environment alone never enables it")
        from dotenv import dotenv_values

        source["OPENROUTER_API_KEY"] = dotenv_values(args.key_file).get("OPENROUTER_API_KEY", "")
    os.environ.update(prepare_environment(args.mode, path, source))
    if args.reset_db:
        for suffix in ("", "-wal", "-shm"):
            Path(str(path) + suffix).unlink(missing_ok=True)
    namespace = database_namespace(path, reset=args.reset_db)
    from aiohttp import web
    import app as api
    import core.llm as llm
    from storage.db import init_db, get_db
    from core.session_api import FOLLOWUP_TASKS
    from scripts.studio_fixtures import Fixtures

    db = await init_db(str(path))
    # This DB belongs to one local runner. Production multi-worker recovery is
    # deliberately not inferred from this lifecycle.
    await db.execute(
        "UPDATE readings SET status='failed',error='Студия перезапущена. Карты сохранены; чтение можно повторить.' WHERE status IN ('reserved','processing')"
    )
    await db.execute(
        "UPDATE reading_followups SET status='failed',error='Ответ прерван перезапуском студии.' WHERE status='processing'"
    )
    await db.commit()
    fixtures = Fixtures()
    budget = None
    if args.mode == "fixture":
        api.interpret_reading = fixtures.reading
        api._ask_llm = fixtures.ask
        api._forecast_llm = fixtures.ask

        async def forbidden(*a, **k):
            raise RuntimeError("Provider calls disabled in fixture studio")

        llm.call_llm = forbidden
    else:
        from scripts.studio_budget import Budget

        budget = Budget(ROOT / ".local" / "studio-budget.sqlite3", args.max_calls, args.max_usd)
        original = llm.call_llm

        async def limited(messages, model, base_url, api_key, max_tokens=2000, **kw):
            if model != "inclusionai/ling-3.0-flash" or base_url != llm.OPENROUTER_URL:
                raise RuntimeError("Unbudgeted provider disabled")
            # UTF8 bytes are a conservative input token upper bound; include
            # message framing. Routing already pins provider and max_price.
            input_bound = len(json.dumps(messages, ensure_ascii=False).encode()) + 1024
            bound = (input_bound * 0.06 + max_tokens * 0.18) / 1_000_000
            budget.reserve(bound)
            return await original(messages, model, base_url, api_key, max_tokens=max_tokens, **kw)

        llm.call_llm = limited
    application = api.create_webapp()

    async def bootstrap(request):
        return web.json_response(
            {
                "init_data": signed_identity(os.environ["BOT_TOKEN"]),
                "user_id": 919191,
                "namespace": namespace,
                "mode": args.mode,
                "budget": budget.totals() if budget else None,
            },
            headers={"Cache-Control": "no-store"},
        )

    async def control(request):
        if args.mode != "fixture":
            raise web.HTTPForbidden()
        origin = request.headers.get("Origin", "")
        if origin and origin not in ("http://localhost:3210", "http://127.0.0.1:3210"):
            raise web.HTTPForbidden()
        body = await request.json()
        fixtures.failure_next = body.get("failure_next") is True
        fixtures.delay_next = min(15, max(0, float(body.get("delay_next", 0))))
        return web.json_response({"ok": True})

    application.router.add_get("/__studio/bootstrap", bootstrap)
    application.router.add_post("/__studio/control", control)
    runner = web.AppRunner(application)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", args.port).start()
    print(f"ARCANUM API127.0.0.1:{args.port} · {args.mode} · persistent isolated DB", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
        tasks = list(api._whisper_tasks | FOLLOWUP_TASKS)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await (await get_db()).close()


def parser():
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=["fixture", "live"], default="fixture")
    p.add_argument("--port", type=int, default=8097)
    p.add_argument("--db")
    p.add_argument("--reset-db", action="store_true")
    p.add_argument("--key-file")
    p.add_argument("--max-calls", type=int, default=10)
    p.add_argument("--max-usd", type=float, default=0.05)
    return p


if __name__ == "__main__":
    asyncio.run(serve(parser().parse_args()))
