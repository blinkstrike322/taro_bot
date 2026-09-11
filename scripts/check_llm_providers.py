"""Проба LLM-провайдеров: кто жив прямо сейчас (статус + латентность).

Использование: .venv/bin/python scripts/check_llm_providers.py
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx

from config import settings
from core.llm import _build_provider_list, call_llm, ZEN_URL

TINY = [{"role": "user", "content": "Ответь одним словом: да"}]


async def probe(model, base_url, api_key, label):
    t0 = time.monotonic()
    try:
        text = await call_llm(TINY, model, base_url, api_key, max_tokens=20)
        dt = time.monotonic() - t0
        return {"model": model, "label": label, "ok": True,
                "s": round(dt, 1), "reply": text.strip()[:40]}
    except httpx.HTTPStatusError as e:
        return {"model": model, "label": label, "ok": False,
                "s": round(time.monotonic() - t0, 1),
                "err": f"HTTP {e.response.status_code}"}
    except Exception as e:  # noqa: BLE001
        return {"model": model, "label": label, "ok": False,
                "s": round(time.monotonic() - t0, 1),
                "err": f"{type(e).__name__}"}


async def main():
    for model, base_url, api_key, label in _build_provider_list():
        r = await probe(model, base_url, api_key, label)
        status = "OK " if r["ok"] else "FAIL"
        extra = r.get("reply", r.get("err"))
        print(f"{status} [{r['label']}] {r['model']} {r['s']}s {extra}")


asyncio.run(main())
