# core/tg_share.py
"""Шеринг расклада в личку Telegram через нашего бота (/api/share).

resolve_reading → build_share_message → send_share: владелец и статус
проверяются по БД, медиа — PNG карт из static/webapp/cards/ (путь guarded:
regex + resolve внутрь каталога), текст уходит частями ≤3800 с
parse_mode="HTML"; весь пользовательский текст экранирован html.escape.
"""
import html
import json
import re
from functools import lru_cache
from pathlib import Path

from aiogram.exceptions import AiogramError
from aiogram.types import FSInputFile, InputMediaPhoto

from core.tarot import load_cards
from storage.db import STATUS_COMPLETED, get_reading_by_id, get_reading_by_token

PROJECT_ROOT = Path(__file__).parent.parent
CARDS_DIR = PROJECT_ROOT / "static" / "webapp" / "cards"

MAX_CAPTION_LEN = 1024
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
        return " <i>(перевёрнутая)</i>"
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


def _build_caption(reading_row: dict, guide: str, cards: list[dict]) -> str:
    """HTML-подпись ≤1024: проводник/дата/вопрос/карты — всё экранировано.

    Варианты по убыванию детальности: полный вопрос → обрезанный вопрос →
    без вопроса → только счётчик карт. Все варианты — валидный HTML.
    """
    header = f"<b>🔮 {html.escape(guide)}</b>"
    date_line = f"<i>{html.escape(str(reading_row.get('created_at') or '')[:16])}</i>"
    base = f"{header}\n{date_line}"
    question = str(reading_row.get("question") or "").strip()
    card_lines = [
        f"🃏 <b>{html.escape(str(c.get('name') or 'Карта'))}</b>{_orientation_suffix(c)}"
        for c in cards
    ]
    cards_block = "\n".join(card_lines)

    variants: list[str] = []
    if cards_block:
        if question:
            variants.append(f"{base}\n\n❓ {html.escape(question)}\n\n{cards_block}")
            budget = MAX_CAPTION_LEN - len(f"{base}\n\n❓ \n\n{cards_block}") - 1
            if budget > 50 and len(question) > budget:
                variants.append(f"{base}\n\n❓ {html.escape(question[:budget])}…\n\n{cards_block}")
        variants.append(f"{base}\n\n{cards_block}")
    else:
        body = f"❓ {html.escape(question)}" if question else "🃏 карта"
        variants.append(f"{base}\n\n{body}")
        if question:
            q_budget = MAX_CAPTION_LEN - len(f"{base}\n\n❓ ") - 1
            if q_budget > 50 and len(question) > q_budget:
                variants.append(f"{base}\n\n❓ {html.escape(question[:q_budget])}…")
    for variant in variants:
        if len(variant) <= MAX_CAPTION_LEN:
            return variant
    return variants[-1]


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
    """(media, text_parts): media — фото-сообщение(я) с caption ≤1024, либо None.

    1 карта → один элемент (sendPhoto), 2–10 → группа (sendMediaGroup, caption
    на первом). Хоть один невалидный/чужеродный filename → медиа нет вовсе,
    весь контент уходит текстом (частями ≤3800).
    """
    cards_data = reading_row.get("cards_data")
    cards = cards_data.get("cards") if isinstance(cards_data, dict) else None
    cards = [c for c in cards if isinstance(c, dict)] if isinstance(cards, list) else []

    guide = _guide_names().get(str(reading_row.get("character_id") or "")) or str(
        reading_row.get("character_id") or ""
    )
    caption = _build_caption(reading_row, guide, cards)

    paths = [_safe_card_path(deck_index.get(str(c.get("id")), "")) for c in cards]
    media: list[dict] | None = None
    if cards and all(p is not None for p in paths):
        media = [
            ({"type": "photo", "media": str(p)} if i else
             {"type": "photo", "media": str(p), "caption": caption})
            for i, p in enumerate(paths)
        ]

    interp = _interpretation_text(reading_row.get("interpretation"))
    if media is not None:
        text = interp
    else:
        text = f"{caption}\n\n{interp}" if interp else caption
    return media, _chunk_text(text)


async def send_share(bot, chat_id: int, media: list[dict] | None, text_parts: list[str]) -> None:
    """Отправить расклад ботом: фото/группа + текст частями, parse_mode="HTML".

    Любая ошибка Telegram API (и транспорта под ней) → TelegramAPIError,
    чтобы обработчик отдал единый 502.
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
    except Exception as e:  # FileNotFoundError от FSInputFile, транспорт и пр.
        raise TelegramAPIError(f"share send failed: {e}") from e
