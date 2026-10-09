# tests/test_static_headers.py
# Regression к smoke Task 16: заголовки статики вебаппа.
# 1) /_next/static/** — вечный кэш (immutable) + gzip. Python ≥3.12 mimetypes
#    отдаёт .js как text/javascript; без этой записи в COMPRESSIBLE_TYPES gzip
#    молча не включался на главных чанках (главный payload вебаппа).
# 2) / (index.html) — no-cache + gzip (анти-stale-index защита iOS).
from pathlib import Path

import pytest
import pytest_asyncio
from aiohttp.test_utils import TestClient, TestServer

import app as app_module

WEBAPP_DIR = Path(app_module.__file__).parent / "static" / "webapp"
PROBE_CHUNK = "_next/static/chunks/__gzip_probe__.js"


@pytest_asyncio.fixture
async def js_chunk():
    """Временный .js-чанк в статике: детерминированное имя вместо хэша сборки."""
    chunk = WEBAPP_DIR / PROBE_CHUNK
    chunk.parent.mkdir(parents=True, exist_ok=True)
    chunk.write_text("// gzip probe\n" * 64, encoding="utf-8")
    yield chunk
    chunk.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_js_chunk_immutable_and_gzipped(js_chunk):
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.get(f"/{PROBE_CHUNK}", headers={"Accept-Encoding": "gzip"})
        assert resp.status == 200
        assert resp.headers["Cache-Control"] == "public, max-age=31536000, immutable"
        assert resp.headers.get("Content-Encoding") == "gzip"


@pytest.mark.asyncio
async def test_index_no_cache_and_gzipped():
    if not (WEBAPP_DIR / "index.html").exists():
        pytest.skip("static/webapp не собран")
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.get("/", headers={"Accept-Encoding": "gzip"})
        assert resp.status == 200
        assert resp.headers["Cache-Control"] == "no-cache"
        assert resp.headers.get("Content-Encoding") == "gzip"
