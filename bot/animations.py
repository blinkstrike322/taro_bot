# bot/animations.py
import asyncio
from typing import List, Dict
from aiogram.types import Message, InputMediaPhoto, FSInputFile
from aiogram.enums import ChatAction

# Конфиг — легко подстроить
MAGIC_DELAY = 0.9          # время "думает" шар (сек)
PHOTO_UPLOAD_DELAY = 0.08  # имитация загрузки фото (сек)
FINAL_PAUSE = 0.12         # пауза между операциями (сек)

async def show_mirror_once(message: Message, mirror_text: str, delay: float = 0.6):
    """
    Отправляет одно сообщение-«зеркало» с короткой имитацией typing.
    Нежная, немногословная реализация — не создает лишних сообщений.
    """
    try:
        await message.bot.send_chat_action(chat_id=message.chat.id, action=ChatAction.TYPING)
    except Exception:
        pass
    # небольшая пауза для эффекта «бот думает/сопереживает»
    await asyncio.sleep(delay)
    # отправляем зеркало как одно сообщение
    await message.answer(mirror_text)


async def show_magic_ball_once(message: Message, text: str = "Магический шар думает… 🔮", delay: float = MAGIC_DELAY):
    """
    Простая, надёжная индикатор-анимация: отправляем одно сообщение с шаром,
    ждем короткую паузу и удаляем (или оставляем — опция).
    Никакого edit_text в цикле.
    """
    anim_msg = await message.answer(text)
    try:
        await asyncio.sleep(delay)
        # можно удалить индикатор — в некоторых UX его лучше оставить, поэтому опционально:
        await anim_msg.delete()
    except Exception:
        # не фатально, если не можем удалить
        pass


async def send_media_group_quiet(message: Message, cards: List[Dict]) -> None:
    """
    Отправляет список карт как media_group (альбом).
    cards: список dict с ключами: 'image_path', 'name', 'is_reversed'
    Не включает интерпретации — только изображения/заголовки.
    """
    media: List[InputMediaPhoto] = []
    for c in cards:
        media.append(
            InputMediaPhoto(
                media=FSInputFile(c["image_path"]),
                caption=c.get("name")  # короткий заголовок в альбоме (опц.)
            )
        )
    # имитируем upload action, краткая пауза
    try:
        await message.bot.send_chat_action(chat_id=message.chat.id, action=ChatAction.UPLOAD_PHOTO)
    except Exception:
        pass
    await asyncio.sleep(PHOTO_UPLOAD_DELAY)
    # отправляем альбом — aiogram/Telegram сгруппирует фото
    await message.answer_media_group(media=media)
    await asyncio.sleep(FINAL_PAUSE)


async def send_interpretations_compact(message: Message, cards: List[Dict], positions: List[str], max_block_chars: int = 2000):
    """
    Формирует компактную текстовую сводку по всем картам и отправляет её.
    Если итоговый текст длиннее лимита, разбивает по логическим блокам (по картам).
    """
    parts: List[str] = []
    for i, c in enumerate(cards):
        pos = positions[i] if i < len(positions) else f"Карта {i+1}"
        orientation = "🔄 Перевёрнута" if c.get("is_reversed") else "⬆️ Прямо"
        interp = c.get("reversed") if c.get("is_reversed") else c.get("upright")
        parts.append(f"🔹 {pos} — {c.get('name')} ({orientation})\n{interp}")

    full_text = "\n\n".join(parts)
    # Если укладывается в лимит — отправляем единым сообщением
    if len(full_text) <= max_block_chars:
        await message.answer(full_text)
        return

    # Иначе отправляем по одной карте (корректно и предсказуемо)
    for p in parts:
        await message.answer(p)
        await asyncio.sleep(FINAL_PAUSE)

