"""POST /api/character: UI-выбор проводника доезжает до БД.

Регрессия прод-бага: смена проводника в вебаппе жила только в localStorage,
а шёпот читал user.character_id из БД — расклады приходили голосом старого.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import quote, urlencode

import pytest
import pytest_asyncio

import app as app_module
import storage.db as sdb


def _make_init_data(tg_id: int) -> str:
    user = json.dumps({"id": tg_id, "first_name": "Test"}, separators=(",", ":"))
    pairs = {"auth_date": str(int(time.time())), "user": user}
    check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", app_module.settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({"auth_date": pairs["auth_date"], "user": user, "hash": sig}, quote_via=quote)


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "test.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


@pytest.mark.asyncio
async def test_character_set_syncs_db(db):
    """Валидный POST меняет character_id юзера — следующий шёпот новым голосом."""
    from aiohttp.test_utils import TestClient, TestServer

    await sdb.get_or_create_user(db, tg_id=4242)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/character",
            json={"init_data": _make_init_data(4242), "character_id": "ruin_keeper"},
        )
        assert resp.status == 200
        assert (await resp.json())["character_id"] == "ruin_keeper"
    user = await sdb.get_user_by_tg_id(db, 4242)
    assert user is not None and user.character_id == "ruin_keeper"


@pytest.mark.asyncio
async def test_character_set_rejects_unknown_id(db):
    """Неизвестный id — 400, БД не тронута (проверка до auth)."""
    from aiohttp.test_utils import TestClient, TestServer

    await sdb.get_or_create_user(db, tg_id=4243)
    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/character",
            json={"init_data": "junk", "character_id": "nope"},
        )
        assert resp.status == 400
    user = await sdb.get_user_by_tg_id(db, 4243)
    assert user is not None and user.character_id == "shadow_walker"


@pytest.mark.asyncio
async def test_character_set_rejects_bad_auth(db):
    """Битый initData — 403."""
    from aiohttp.test_utils import TestClient, TestServer

    async with TestClient(TestServer(app_module.create_webapp())) as client:
        resp = await client.post(
            "/api/character",
            json={"init_data": "junk", "character_id": "spark_of_chaos"},
        )
        assert resp.status == 403
