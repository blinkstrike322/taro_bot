# core/tg_share.py
"""Шеринг расклада в личку Telegram через нашего бота (/api/share).

resolve_reading → build_share_message → send_share: владелец и статус
проверяются по БД, медиа — чистые PNG карт без подписей (guard пути:
regex + resolve внутрь каталога), шапка и толкование уходят текстом
частями ≤3800 с parse_mode="HTML"; терминальные глифы вместо эмодзи,
весь пользовательский текст экранирован html.escape.
"""
import html
import json
import re
from functools import lru_cache
from pathlib import Path

import aiohttp
from aiogram.exceptions import AiogramError
from aiogram.types import FSInputFile, InputMediaPhoto

from core.spreads import get_spread
from core.tarot import load_cards
from storage.db import STATUS_COMPLETED, get_reading_by_id, get_reading_by_token

PROJECT_ROOT = Path(__file__).parent.parent
CARDS_DIR = PROJECT_ROOT / "static" / "webapp" / "cards"

MAX_TEXT_PART = 3800


class TelegramAPIError(Exception):
    """Единая ошибка отправки расклада: aiogram 3.30 не даёт кинуть свой
    TelegramAPIError без TelegramMethod, поэтому оборачиваем AiogramError
    (базовый корень всех его исключений) и транспортные сбои в свой тип —
    обработчик /api/share ловит ровно его и отдаёт 502."""

# Guard путей: только маленькие латинские буквы/цифры/дефис + .png.
# '..' и слэши невозможны по самому regex'у, resolve-проверка — вторая линия.
_FILENAME_RE = re.compile(r"^[a-z0-9-]+\.png$")


@lru_cache(maxsize=1)
def load_deck_filenames() -> dict[str, str]:
    """deck_index: id карты (cards.json) → имя PNG-файла."""
    return {str(c.get("id")): str(c.get("filename") or "") for c in load_cards()}


@lru_cache(maxsize=1)
def _guide_names() -> dict[str, str]:
    """character_id → человеческое имя проводника (data/characters.json)."""
    try:
        with open(PROJECT_ROOT / "data" / "characters.json", encoding="utf-8") as f:
            chars = json.load(f)
    except Exception:
        return {}
    if not isinstance(chars, list):
        return {}
    return {str(c.get("id")): str(c.get("name") or "") for c in chars if isinstance(c, dict)}


def _safe_card_path(filename: str) -> Path | None:
    """filename → существующий PNG внутри static/webapp/cards/ либо None (guard)."""
    if not filename or not _FILENAME_RE.fullmatch(filename):
        return None
    try:
        root = CARDS_DIR.resolve()
        resolved = (CARDS_DIR / filename).resolve()
        resolved.relative_to(root)
    except (OSError, ValueError):
        return None
    if not resolved.is_file():
        return None
    return resolved


def _orientation_suffix(card: dict) -> str:
    if card.get("is_reversed") or card.get("orientation") == "reversed":
        return " ↳ реверс"
    return ""


def _interpretation_text(interpretation: object) -> str:
    """Толкование (dict из БД) → связный текст; мусор → пустая строка."""
    if not isinstance(interpretation, dict):
        return ""
    lines: list[str] = []
    for key in ("intro", "short_answer"):
        value = interpretation.get(key)
        if isinstance(value, str) and value.strip():
            lines.append(value.strip())
    meanings = interpretation.get("card_meaning")
    if isinstance(meanings, list):
        lines += [str(m).strip() for m in meanings if str(m).strip()]
    advice = interpretation.get("advice")
    if isinstance(advice, str) and advice.strip():
        lines.append(advice.strip())
    return "\n".join(lines)


def _chunk_text(text: str, limit: int = MAX_TEXT_PART) -> list[str]:
    """Текст → куски ≤limit: рез по строкам, гигантские строки — жёстко."""
    if len(text) <= limit:
        return [text] if text else []
    parts: list[str] = []
    current = ""
    for line in text.split("\n"):
        while len(line) > limit:  # одна строка длиннее лимита
            if current:
                parts.append(current)
                current = ""
            parts.append(line[:limit])
            line = line[limit:]
        if not current:
            current = line
        elif len(current) + 1 + len(line) <= limit:
            current += "\n" + line
        else:
            parts.append(current)
            current = line
    if current:
        parts.append(current)
    return parts


def _spread_label(raw_type: object, count: int) -> str:
    """Человеческое имя расклада: каталог (со срезом префикса spread_ и
    легаси-числами), уже-человеческий текст как есть, иначе счётчик карт."""
    raw = str(raw_type or "").strip()
    short = raw[len("spread_"):] if raw.startswith("spread_") else raw
    legacy = {"1": "single", "3": "three", "daily": "daily"}
    spread = get_spread(legacy.get(short, short))
    name = spread.get("name") if isinstance(spread, dict) else None
    if isinstance(name, str) and name.strip():
        return name.strip()
    if raw and (" " in raw or re.search(r"[а-яё]", raw, re.IGNORECASE)):
        return raw
    if count == 1:
        return "карта"
    if 2 <= count <= 4:
        return f"{count} карты"
    return f"{count} карт"


def _format_share_date(created_at: object) -> str:
    """'2026-10-09 18:16:19' → '09.10.2026 18:16'; мусор — как есть (≤16)."""
    text = str(created_at or "")
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})", text)
    if m:
        return f"{m.group(3)}.{m.group(2)}.{m.group(1)} {m.group(4)}:{m.group(5)}"
    return text[:16]


def _position_by_card(interpretation: object) -> dict[str, str]:
    """имя карты → позиция из interpretation['позиции'] (под срезом)."""
    if not isinstance(interpretation, dict):
        return {}
    positions = interpretation.get("позиции")
    if not isinstance(positions, list):
        return {}
    out: dict[str, str] = {}
    for entry in positions:
        if not isinstance(entry, dict):
            continue
        name = entry.get("карта")
        pos = entry.get("позиция")
        if isinstance(name, str) and name and isinstance(pos, str) and pos:
            out.setdefault(name, pos)
    return out


def _build_header(reading_row: dict, guide: str, cards: list[dict]) -> str:
    """Шапка отдельным сообщением: проводник/расклад/дата, вопрос цитатой,
    карты с позициями и реверсами. Терминальные глифы вместо эмодзи, всё
    пользовательское — через html.escape. Лимита 1024 здесь нет (обычный
    текст чанкуется на отправке), поэтому лесенка обрезки не нужна."""
    spread = _spread_label(reading_row.get("type"), len(cards))
    date = _format_share_date(reading_row.get("created_at"))
    lines = [f"<b>{html.escape(guide)}</b> · {html.escape(spread)} · <i>{html.escape(date)}</i>"]
    question = str(reading_row.get("question") or "").strip()
    if question:
        lines += ["", f"<blockquote>{html.escape(question)}</blockquote>"]
    if cards:
        by_card = _position_by_card(reading_row.get("interpretation"))
        lines.append("")
        for c in cards:
            name = str(c.get("name") or "Карта")
            line = f"— {html.escape(name)}{_orientation_suffix(c)}"
            pos = by_card.get(name)
            if pos:
                line += f" · <i>{html.escape(pos)}</i>"
            lines.append(line)
    return "\n".join(lines)


async def resolve_reading(
    db,
    tg_id: int,
    token: str | None = None,
    reading_id: int | None = None,
) -> dict | None:
    """Чтение для шаринга: по client_token ИЛИ по id, строго своего владельца.

    Статус обязан быть completed — шеринг недоделанного/сгоревшего расклада
    не имеет смысла. Чужая строка и любой другой статус → None (→ 404).
    """
    if not tg_id:
        return None
    full: dict | None = None
    if token:
        base = await get_reading_by_token(db, token)
        if base is None or base["tg_id"] != tg_id:
            return None
        full = await get_reading_by_id(db, base["reading_id"])
    elif reading_id is not None:
        full = await get_reading_by_id(db, reading_id)
    if full is None or full["tg_id"] != tg_id or full["status"] != STATUS_COMPLETED:
        return None
    return full


def build_share_message(
    reading_row: dict,
    deck_index: dict[str, str],
) -> tuple[list[dict] | None, list[str]]:
    """(media, text_parts): media — чисто фото (sendPhoto / sendMediaGroup
    2–10) БЕЗ подписей; text_parts[0] — всегда шапка (_build_header),
    дальше чанки толкования. Хоть один невалидный/чужеродный filename →
    медиа нет вовсе, шапка несёт всю информацию (частями ≤3800)."""
    cards_data = reading_row.get("cards_data")
    cards = cards_data.get("cards") if isinstance(cards_data, dict) else None
    cards = [c for c in cards if isinstance(c, dict)] if isinstance(cards, list) else []

    guide = _guide_names().get(str(reading_row.get("character_id") or "")) or str(
        reading_row.get("character_id") or ""
    )
    header = _build_header(reading_row, guide, cards)

    paths = [_safe_card_path(deck_index.get(str(c.get("id")), "")) for c in cards]
    media: list[dict] | None = None
    if cards and all(p is not None for p in paths):
        media = [{"type": "photo", "media": str(p)} for p in paths]

    interp = _interpretation_text(reading_row.get("interpretation"))
    parts = [header] if not interp else [header, *_chunk_text(interp)]
    return media, parts


async def send_share(bot, chat_id: int, media: list[dict] | None, text_parts: list[str]) -> None:
    """Отправить расклад ботом: фото/группа + текст частями, parse_mode="HTML".

    Ошибка Telegram API (и транспорта под ней) → TelegramAPIError, чтобы
    обработчик отдал единый 502; прочие исключения (баги кода) летят наружу
    как есть — не маскируются под 502.
    """
    try:
        if media:
            if len(media) == 1:
                item = media[0]
                await bot.send_photo(
                    chat_id,
                    FSInputFile(item["media"]),
                    caption=item.get("caption") or None,
                    parse_mode="HTML",
                )
            else:
                group = [
                    InputMediaPhoto(
                        media=FSInputFile(item["media"]),
                        caption=item.get("caption") or None,
                        parse_mode="HTML" if item.get("caption") else None,
                    )
                    for item in media
                ]
                await bot.send_media_group(chat_id, group)
        for part in text_parts:
            await bot.send_message(
                chat_id, part, parse_mode="HTML", disable_web_page_preview=True
            )
    except AiogramError as e:
        raise TelegramAPIError(f"telegram: {e}") from e
    except aiohttp.ClientError as e:  # транспорт под aiogram
        raise TelegramAPIError(f"share send failed: {e}") from e
