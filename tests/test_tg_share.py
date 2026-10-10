# tests/test_tg_share.py
# /api/share: отправка расклада в ТГ через нашего бота.
# resolve_reading (владелец/статус), build_share_message (escape/чанки/guard путей),
# send_share (FakeBot — запись вызовов), handle_share end-to-end.
import hashlib
import hmac
import json
import time
from urllib.parse import quote, urlencode

import pytest
import pytest_asyncio
from aiogram.exceptions import AiogramError
from aiohttp.test_utils import TestClient, TestServer

import app as app_module
import storage.db as sdb
from core.tg_share import (
    TelegramAPIError,
    _build_header,
    build_share_message,
    resolve_reading,
    send_share,
)
from storage.db import (
    STATUS_COMPLETED,
    STATUS_RESERVED,
    complete_reading,
    get_or_create_user,
    init_db,
    reserve_reading,
)

CARDS_DIR = app_module.Path(app_module.__file__).parent / "static" / "webapp" / "cards"

CARD_1 = {"id": "the-moon", "name": "Луна", "is_reversed": False, "orientation": "upright"}
CARD_2 = {"id": "the-sun", "name": "Солнце", "is_reversed": True, "orientation": "reversed"}
CARD_3 = {"id": "the-star", "name": "Звезда", "is_reversed": False, "orientation": "upright"}

DECK_OK = {
    "the-moon": "the-moon.png",
    "the-sun": "the-sun.png",
    "the-star": "the-star.png",
}

INTERP = {
    "intro": "Ночь шепчет правду.",
    "short_answer": "Ответ внутри тебя.",
    "card_meaning": ["Луна: не всё видно при свете фонаря."],
    "advice": "Доверься тишине.",
}


def _make_init_data(tg_id: int) -> str:
    """Валидный Telegram initData (подпись тем же алгоритмом, что бэкенд)."""
    user = json.dumps({"id": tg_id, "first_name": "Test"}, separators=(",", ":"))
    pairs = {"auth_date": str(int(time.time())), "user": user}
    check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", app_module.settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    sig = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({"auth_date": pairs["auth_date"], "user": user, "hash": sig}, quote_via=quote)


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await init_db(str(tmp_path / "test.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


async def _seed_reading(db, tg_id: int, token: str, cards: list[dict], *, completed: bool = True,
                        question: str | None = "Мой вопрос?") -> int:
    """Пользователь + чтение с токеном; completed=True → статус completed."""
    user = await get_or_create_user(db, tg_id)
    rid = await reserve_reading(
        db, user_id=user.id, type="daily", question=question,
        cards_data={"cards": cards, "spread_type": "daily"},
        character_id="shadow_walker", unlimited=True, client_token=token,
    )
    assert rid is not None
    if completed:
        await complete_reading(db, rid, INTERP)
    return rid


def _row(cards: list[dict], question: str = "Вопрос?", interp: object = INTERP) -> dict:
    return {
        "reading_id": 1,
        "user_id": 1,
        "tg_id": 100,
        "status": STATUS_COMPLETED,
        "type": "daily",
        "question": question,
        "cards_data": {"cards": cards, "spread_type": "daily"},
        "interpretation": interp,
        "character_id": "shadow_walker",
        "created_at": "2026-10-08 12:00:00",
    }


class FakeBot:
    def __init__(self, fail: bool = False, bug: bool = False):
        self.calls: list[tuple] = []
        self.fail = fail
        self.bug = bug

    async def send_photo(self, chat_id, photo, caption=None, parse_mode=None, **kw):
        if self.bug:
            raise TypeError("programming error in bot layer")
        if self.fail:
            raise AiogramError("telegram rejected")
        self.calls.append(("photo", chat_id, caption, parse_mode))

    async def send_media_group(self, chat_id, media, **kw):
        if self.bug:
            raise TypeError("programming error in bot layer")
        if self.fail:
            raise AiogramError("telegram rejected")
        self.calls.append(("group", chat_id, media))

    async def send_message(self, chat_id, text, parse_mode=None, **kw):
        if self.bug:
            raise TypeError("programming error in bot layer")
        if self.fail:
            raise AiogramError("telegram rejected")
        self.calls.append(("msg", chat_id, text, parse_mode))


# ── resolve_reading ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_reading_by_token(db):
    await _seed_reading(db, 111, "tok-ok", [CARD_1])
    row = await resolve_reading(db, 111, token="tok-ok")
    assert row is not None
    assert row["tg_id"] == 111
    assert row["status"] == STATUS_COMPLETED
    assert row["cards_data"]["cards"][0]["id"] == "the-moon"
    assert row["question"] == "Мой вопрос?"


@pytest.mark.asyncio
async def test_resolve_reading_by_token_foreign_user(db):
    await _seed_reading(db, 111, "tok-foreign", [CARD_1])
    assert await resolve_reading(db, 222, token="tok-foreign") is None


@pytest.mark.asyncio
async def test_resolve_reading_by_token_not_completed(db):
    await _seed_reading(db, 111, "tok-pending", [CARD_1], completed=False)
    row = await resolve_reading(db, 111, token="tok-pending")
    assert row is None or row["status"] != STATUS_COMPLETED
    # контракт: не-completed → None
    assert row is None


@pytest.mark.asyncio
async def test_resolve_reading_by_id_and_owner(db):
    rid = await _seed_reading(db, 111, None, [CARD_1, CARD_2])
    row = await resolve_reading(db, 111, reading_id=rid)
    assert row is not None
    assert row["reading_id"] == rid
    assert len(row["cards_data"]["cards"]) == 2
    # чужой id → None
    assert await resolve_reading(db, 999, reading_id=rid) is None
    # несуществующий id → None
    assert await resolve_reading(db, 111, reading_id=10**9) is None


@pytest.mark.asyncio
async def test_resolve_reading_requires_something(db):
    assert await resolve_reading(db, 111) is None


@pytest.mark.asyncio
async def test_reserved_status_row_is_status_reserved(db):
    """Санити сида: незавершённое чтение реально имеет status=reserved."""
    rid = await _seed_reading(db, 111, "tok-res", [CARD_1], completed=False)
    row = await resolve_reading(db, 111, reading_id=rid)
    assert row is None
    from storage.db import get_reading_by_id
    raw = await get_reading_by_id(db, rid)
    assert raw["status"] == STATUS_RESERVED


# ── build_share_message ──────────────────────────────────────────────

def test_build_one_card_media_no_caption_header_escape():
    evil = '<script>alert("x")</script>'
    row = _row([CARD_1], question=evil)
    media, parts = build_share_message(row, DECK_OK)
    assert media is not None and len(media) == 1
    assert media[0]["type"] == "photo"
    assert "caption" not in media[0], "фото чистые, без подписей"
    header = parts[0]
    assert "<script>" not in header
    assert "&lt;script&gt;" in header
    assert "Луна" in header
    assert all(len(p) <= 3800 for p in parts)
    assert any("Доверься тишине" in p for p in parts)


def test_build_three_cards_no_captions_anywhere():
    row = _row([CARD_1, CARD_2, CARD_3])
    media, parts = build_share_message(row, DECK_OK)
    assert media is not None and len(media) == 3
    assert all("caption" not in item for item in media)
    header = parts[0]
    assert "Луна" in header and "Солнце" in header and "Звезда" in header
    assert parts and all(len(p) <= 3800 for p in parts)


def test_build_text_parts_chunked_le_3800():
    long_interp = {
        "intro": "НАЧАЛО " + "слово " * 2500,
        "advice": "КОНЕЦ " + "тишина " * 2500,
    }
    row = _row([CARD_1], interp=long_interp)
    media, parts = build_share_message(row, DECK_OK)
    assert media is not None
    assert len(parts) >= 2
    assert all(len(p) <= 3800 for p in parts)
    joined = "\n".join(parts)
    assert "НАЧАЛО" in joined and "КОНЕЦ" in joined


def test_build_filename_guard_bad_path_text_only():
    row = _row([CARD_1], question="Вопрос с <b>тегом</b>")
    media, parts = build_share_message(row, {"the-moon": "../evil.png"})
    assert not media, "плохой filename → часть без фото"
    joined = "\n".join(parts)
    assert "Луна" in joined
    assert "&lt;b&gt;" in joined, "question экранируется и в текстовой части"


def test_build_filename_guard_regex():
    row = _row([CARD_1])
    media, _ = build_share_message(row, {"the-moon": "Evil_Thing.PNG"})
    assert not media, "заглавные/подчёркивания не проходят regex"
    media, _ = build_share_message(row, {"the-moon": "the-moon.png.png"})
    assert not media


def test_build_no_cards_text_only():
    row = _row([])
    media, parts = build_share_message(row, DECK_OK)
    assert not media
    assert parts


def test_build_media_paths_resolve_inside_cards_dir():
    row = _row([CARD_1])
    media, _ = build_share_message(row, DECK_OK)
    assert media is not None
    p = app_module.Path(str(media[0]["media"]))
    assert p.is_file()
    assert CARDS_DIR.resolve() in p.resolve().parents


# ── _build_header: терминальная шапка без эмодзи ───

def test_header_no_emoji_terminal_glyphs():
    row = _row([CARD_1, CARD_2])
    header = _build_header(row, "Искра Хаоса", [CARD_1, CARD_2])
    assert "🔮" not in header and "❓" not in header and "🃏" not in header
    assert "<b>Искра Хаоса</b>" in header
    assert "<blockquote>Вопрос?</blockquote>" in header
    assert "— Луна" in header and "— Солнце ↳ реверс" in header


def test_header_positions_joined_from_interpretation():
    interp = {
        "intro": "и",
        "short_answer": "с",
        "позиции": [
            {"позиция": "За", "карта": "Луна", "реверс": False, "трактовка": "т"},
            {"позиция": "Против", "карта": "Солнце", "реверс": True, "трактовка": "т"},
        ],
    }
    row = _row([CARD_1, CARD_2], interp=interp)
    header = _build_header(row, "г", [CARD_1, CARD_2])
    assert "· <i>За</i>" in header
    assert "· <i>Против</i>" in header


def test_header_spread_label_mapping():
    assert "карта дня" in _build_header(_row([], question=""), "г", [])
    row = dict(_row([], question=""), type="spread_yesno")
    assert "да / нет" in _build_header(row, "г", [])
    row3 = dict(_row([], question=""), type="spread_3")
    assert "три карты" in _build_header(row3, "г", [])
    human = dict(_row([], question=""), type="мои мысли")
    assert "мои мысли" in _build_header(human, "г", [])
    unknown = dict(_row([CARD_1], question=""), type="xyz")
    assert "карта" in _build_header(unknown, "г", [CARD_1])


def test_header_date_format():
    row = _row([CARD_1])
    header = _build_header(row, "г", [CARD_1])
    assert "08.10.2026 12:00" in header
    assert "2026-10-08" not in header


# ── send_share (FakeBot) ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_share_one_card_uses_send_photo():
    bot = FakeBot()
    media, parts = build_share_message(_row([CARD_1], question="О нём"), DECK_OK)
    await send_share(bot, 555, media, parts)
    assert [c[0] for c in bot.calls] == ["photo"] + ["msg"] * len(parts)
    kind, chat_id, caption, parse_mode = bot.calls[0]
    assert kind == "photo" and chat_id == 555 and parse_mode == "HTML"
    assert caption is None, "фото чистые, шапка — первым msg"
    msg = bot.calls[1]
    assert msg[0] == "msg" and msg[3] == "HTML"
    assert "О нём" in msg[2], "шапка идёт первым текстовым сообщением"


@pytest.mark.asyncio
async def test_send_share_three_cards_group_plus_message():
    bot = FakeBot()
    media, parts = build_share_message(_row([CARD_1, CARD_2, CARD_3]), DECK_OK)
    await send_share(bot, 555, media, parts)
    kinds = [c[0] for c in bot.calls]
    assert kinds[0] == "group"
    assert kinds[1] == "msg"
    # фото без подписей вовсе
    group_media = bot.calls[0][2]
    assert not any(getattr(m, "caption", None) for m in group_media)


@pytest.mark.asyncio
async def test_send_share_text_only_when_no_media():
    bot = FakeBot()
    media, parts = build_share_message(_row([CARD_1]), {"the-moon": "../evil.png"})
    await send_share(bot, 555, media, parts)
    assert all(c[0] == "msg" for c in bot.calls)
    assert all(c[3] == "HTML" for c in bot.calls)


@pytest.mark.asyncio
async def test_send_share_aiogram_failure_wrapped():
    bot = FakeBot(fail=True)
    media, parts = build_share_message(_row([CARD_1]), DECK_OK)
    with pytest.raises(TelegramAPIError):
        await send_share(bot, 555, media, parts)


# ── handle_share end-to-end ──────────────────────────────────────────

def _client(bot=None) -> TestClient:
    app = app_module.create_webapp(bot)
    return TestClient(TestServer(app))


@pytest.mark.asyncio
async def test_handle_share_requires_token_or_reading_id(db):
    init_data = _make_init_data(111)
    async with _client() as client:
        resp = await client.post("/api/share", json={"init_data": init_data})
        assert resp.status == 400
        assert (await resp.json())["error"] == "нечем поделиться"


@pytest.mark.asyncio
async def test_handle_share_unauthorized(db):
    async with _client() as client:
        resp = await client.post("/api/share", json={"init_data": "bad", "token": "x"})
        assert resp.status == 401


@pytest.mark.asyncio
async def test_handle_share_foreign_row_404(db):
    await _seed_reading(db, 111, "tok-mine", [CARD_1])
    async with _client() as client:
        resp = await client.post(
            "/api/share",
            json={"init_data": _make_init_data(222), "token": "tok-mine"},
        )
        assert resp.status == 404


@pytest.mark.asyncio
async def test_handle_share_ok_with_fake_bot(db):
    await _seed_reading(db, 111, "tok-share", [CARD_1, CARD_2, CARD_3])
    bot = FakeBot()
    async with _client(bot) as client:
        assert client.app["bot"] is bot
        resp = await client.post(
            "/api/share",
            json={"init_data": _make_init_data(111), "token": "tok-share"},
        )
        assert resp.status == 200
        assert (await resp.json()) == {"ok": True}
    kinds = [c[0] for c in bot.calls]
    assert kinds[0] == "group" and "msg" in kinds


@pytest.mark.asyncio
async def test_handle_share_by_reading_id(db):
    rid = await _seed_reading(db, 111, None, [CARD_1])
    bot = FakeBot()
    async with _client(bot) as client:
        resp = await client.post(
            "/api/share",
            json={"init_data": _make_init_data(111), "reading_id": rid},
        )
        assert resp.status == 200
    assert bot.calls and bot.calls[0][0] == "photo"


@pytest.mark.asyncio
async def test_handle_share_telegram_failure_502(db):
    await _seed_reading(db, 111, "tok-502", [CARD_1])
    async with _client(FakeBot(fail=True)) as client:
        resp = await client.post(
            "/api/share",
            json={"init_data": _make_init_data(111), "token": "tok-502"},
        )
        assert resp.status == 502
        assert (await resp.json())["error"] == "телеграм не принял сообщение"


@pytest.mark.asyncio
async def test_handle_share_programming_error_500(db):
    """TypeError из бота — не telegram-домен: летит из send_share → 500, не 502."""
    await _seed_reading(db, 111, "tok-bug", [CARD_1])
    # send_share не оборачивает чужие исключения в TelegramAPIError
    media, parts = build_share_message(_row([CARD_1]), DECK_OK)
    with pytest.raises(TypeError):
        await send_share(FakeBot(bug=True), 555, media, parts)
    async with _client(FakeBot(bug=True)) as client:
        resp = await client.post(
            "/api/share",
            json={"init_data": _make_init_data(111), "token": "tok-bug"},
        )
        assert resp.status == 500, "баг кода → 500, а не 502 «телеграм не принял»"
