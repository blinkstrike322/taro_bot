# bot/handlers.py
import asyncio
import logging
from aiogram import Router
from aiogram.types import Message, FSInputFile, ReplyKeyboardMarkup, KeyboardButton, InputMediaPhoto
from aiogram.filters import Command, Text
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext

from core.tarot import draw_card, draw_three_cards
from core.emotion import detect_emotion, generate_mirror

logger = logging.getLogger(__name__)
router = Router()

class TarotStates(StatesGroup):
  waiting_for_question_one = State()
  waiting_for_question_three = State()

start_kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="🎴 Одна карта"), KeyboardButton(text="🎴 Три карты")]
    ],
    resize_keyboard=True,
    one_time_keyboard=False
)

@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext):
  await state.clear()
  await message.answer(
    "🔮 Привет! Сделаем небольшой ритуал перед раскладом. Выбери расклад — или просто задай вопрос:",
    reply_markup=start_kb
  )

@router.message(Text("🎴 Одна карта"))
async def choose_one_card(message: Message, state: FSMContext):
  await state.set_state(TarotStates.waiting_for_question_one)
  await message.answer("Сосредоточься на вопросе и напиши его в чате:")

@router.message(Text("🎴 Три карты"))
async def choose_three_cards(message: Message, state: FSMContext):
  await state.set_state(TarotStates.waiting_for_question_three)
  await message.answer("Подумай о ситуации и задай вопрос для трёх карт:")

async def _ritual_shuffle(message: Message):
  info = await message.answer("🔮 Перемешиваю колоду...")
  await asyncio.sleep(1.2)
  try:
    await info.delete()
  except Exception:
    pass

@router.message(TarotStates.waiting_for_question_one)
async def process_one_card(message: Message, state: FSMContext):
  question = (message.text or "").strip()
  if not question:
    await message.answer("Пожалуйста, напиши вопрос текстом.")
    return
  emotion_label, emotion_score = detect_emotion(question)
  await state.update_data(last_emotion=emotion_label)
  mirror = generate_mirror(question, emotion_label, emotion_score)
  await message.answer(mirror)
  await _ritual_shuffle(message)
  try:
    card = draw_card()
    interpretation = card["reversed"] if card["is_reversed"] else card["upright"]
    caption = f"Вопрос: {question}\n\nКарта: {card['name']}\n\n{interpretation}"
    photo = FSInputFile(card["image_path"])
    await message.answer_photo(photo=photo, caption=caption, reply_markup=start_kb)
  except FileNotFoundError as e:
    logger.exception("Image missing for card: %s", e)
    await message.answer(f"Карта выпадла, но изображение не найдено. Вот толкование:\n\n{card['name']}\n{interpretation}", reply_markup=start_kb)
  except Exception:
    logger.exception("Ошибка при выдаче карты")
    await message.answer("Произошла ошибка при формировании расклада. Попробуй ещё раз.", reply_markup=start_kb)
  finally:
    await state.clear()

@router.message(TarotStates.waiting_for_question_three)
async def process_three_cards(message: Message, state: FSMContext):
  question = (message.text or "").strip()
  if not question:
    await message.answer("Пожалуйста, напиши вопрос текстом.")
    return
  emotion_label, emotion_score = detect_emotion(question)
  await state.update_data(last_emotion=emotion_label)
  mirror = generate_mirror(question, emotion_label, emotion_score)
  await message.answer(mirror)
  await _ritual_shuffle(message)
  try:
    cards = draw_three_cards()
    positions = ["Прошлое", "Настоящее", "Будущее"]
    media = []
    interpretations = []
    for i, card in enumerate(cards):
      media.append(InputMediaPhoto(media=FSInputFile(card["image_path"])))
      interp = card["reversed"] if card["is_reversed"] else card["upright"]
      interpretations.append(f"🔹 {positions[i]} — {card['name']}\n{interp}")
    await message.answer_media_group(media=media)
    caption = f"Вопрос: {question}\n\n" + "\n\n".join(interpretations)
    await message.answer(caption, reply_markup=start_kb)
  except FileNotFoundError as e:
    logger.exception("Missing image in three-card draw: %s", e)
    await message.answer("Одна из карт не имеет изображения, отправляю только текстовое толкование.", reply_markup=start_kb)
    for i, card in enumerate(cards):
      interp = card["reversed"] if card["is_reversed"] else card["upright"]
      await message.answer(f"🔹 {positions[i]} — {card['name']}\n{interp}")
  except Exception:
    logger.exception("Error drawing three cards")
    await message.answer("Ошибка при формировании расклада. Попробуй снова.", reply_markup=start_kb)
  finally:
    await state.clear()

def register_handlers(dp):
  dp.include_router(router)
