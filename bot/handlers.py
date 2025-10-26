# bot/handlers.py
from aiogram import Router
from aiogram.types import Message, FSInputFile, ReplyKeyboardMarkup, KeyboardButton
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.filters import Command
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext

import json
import asyncio

from core.tarot import draw_cards
from core.utils import is_valid_question
from core.emotion import detect_emotion, generate_mirror
from core.tarot_interpreter import interpret_spread

from bot.animations import (
  show_magic_ball_once,
  show_mirror_once,
  send_media_group_quiet,
  send_interpretations_compact,
)

router = Router()

class TarotStates(StatesGroup):
  waiting_for_question_one = State()
  waiting_for_question_three = State()
  waiting_for_question_celtic = State()
  waiting_for_question_period = State()

start_kb = ReplyKeyboardMarkup(
  keyboard=[
    [KeyboardButton(text="🎴 1 карта"), KeyboardButton(text="🎴 3 карты")],
    [KeyboardButton(text="🌀 Кельтский крест"), KeyboardButton(text="📅 День/Неделя/Месяц")]
  ],
  resize_keyboard=True,
  one_time_keyboard=True
)

# Inline keyboard после показа карт
def make_after_cards_kb() -> InlineKeyboardMarkup:
  kb = InlineKeyboardMarkup(
    inline_keyboard=[
      [InlineKeyboardButton(text="🔍 Расшифровать", callback_data="tarot:interpret")],
      [InlineKeyboardButton(text="🔁 Новый расклад", callback_data="tarot:new")]
    ]
  )
  return kb

# Старт
@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext):
  await state.clear()
  await message.answer(
    "🔮 Привет! Выбери вариант расклада:",
    reply_markup=start_kb
  )

# Выбор раскладов
@router.message(lambda msg: msg.text == "🎴 1 карта")
async def choose_one_card(message: Message, state: FSMContext):
  await state.set_state(TarotStates.waiting_for_question_one)
  await message.answer("Задай свой вопрос для расклада из одной карты:")

@router.message(lambda msg: msg.text == "🎴 3 карты")
async def choose_three_cards(message: Message, state: FSMContext):
  await state.set_state(TarotStates.waiting_for_question_three)
  await message.answer("Задай свой вопрос для расклада из трёх карт:")

@router.message(lambda msg: msg.text == "🌀 Кельтский крест")
async def choose_celtic(message: Message, state: FSMContext):
  await state.set_state(TarotStates.waiting_for_question_celtic)
  await message.answer("Задай вопрос для расклада 'Кельтский крест':")

@router.message(lambda msg: msg.text == "📅 День/Неделя/Месяц")
async def choose_period(message: Message, state: FSMContext):
  await state.set_state(TarotStates.waiting_for_question_period)
  await message.answer("Задай вопрос для временного расклада:")


async def process_card_message(message: Message, state: FSMContext, n_cards: int, positions: list | None = None):
  """
  Pipeline:
  1) validate question
  2) emotion mirror
  3) magic ball
  4) draw & send media group
  5) show inline buttons (расшифровать / новый расклад)
  """

  question = (message.text or "").strip()
  if not is_valid_question(question):
    await message.answer("Пожалуйста, задай осмысленный вопрос.")
    return

  emotion_label, emotion_score = detect_emotion(question)
  mirror_text = generate_mirror(question, emotion_label, emotion_score)
  await show_mirror_once(message, mirror_text, delay=0.45)

  await show_magic_ball_once(message)

  cards = draw_cards(n_cards)

  if positions is None:
    positions = [f"Карта {i+1}" for i in range(n_cards)]

  # prepare simplified card data to store in state for interpreter
  simple_cards = []
  for c in cards:
    try:
      name = c.get("name") or c.get("title") or str(c.get("id", "unknown"))
    except Exception:
      name = str(c)
    try:
      orientation = c.get("orientation", "upright")
    except Exception:
      orientation = "upright"
    simple_cards.append({"name": name, "orientation": orientation})

  # send images as media_group
  await send_media_group_quiet(message, cards)

  # store context in state for callback handlers
  await state.update_data(
    last_question=question,
    last_positions=positions,
    last_cards=simple_cards
  )

  # send compact placeholder (existing behavior) OR we can skip if prefer only LLM
  try:
    await send_interpretations_compact(message, cards, positions)
  except Exception:
    pass

  # show inline buttons for "расшифровать" / "новый расклад"
  await message.answer("Выберите действие:", reply_markup=make_after_cards_kb())

# Обработка вопросов (создаёт расклад и предлагает опции)
@router.message(TarotStates.waiting_for_question_one)
async def handle_one_card(message: Message, state: FSMContext):
  await process_card_message(message, state, 1)

@router.message(TarotStates.waiting_for_question_three)
async def handle_three_cards(message: Message, state: FSMContext):
  await process_card_message(message, state, 3, positions=["Прошлое", "Настоящее", "Будущее"])

@router.message(TarotStates.waiting_for_question_celtic)
async def handle_celtic(message: Message, state: FSMContext):
  celtic_positions = [
    "Ситуация", "Перекрестие", "Основа", "Прошлое", "Настоящее",
    "Будущее", "Совет", "Влияние окружения", "Надежды/Страхи", "Итог"
  ]
  await process_card_message(message, state, 10, positions=celtic_positions)

@router.message(TarotStates.waiting_for_question_period)
async def handle_period(message: Message, state: FSMContext):
  await process_card_message(message, state, 3, positions=["Сегодня", "Эта неделя", "Этот месяц"])


# Callback: пользователь нажал "Расшифровать"
@router.callback_query(lambda cq: cq.data == "tarot:interpret")
async def callback_interpret(callback: CallbackQuery, state: FSMContext):
  await callback.answer()  # убирает "часики" у пользователя
  data = await state.get_data()
  question = data.get("last_question")
  positions = data.get("last_positions") or []
  cards = data.get("last_cards") or []

  if not question or not cards:
    await callback.message.answer("Контекст расклада не найден. Попробуй сделать расклад ещё раз.")
    return

  # отправляем "печатает..." индикатор
  typing_task = asyncio.create_task(
    callback.bot.send_chat_action(
      chat_id=callback.message.chat.id,
      action="typing"
    )
  )

  loop = asyncio.get_event_loop()
  try:
    # вызов блокирующего интерпретатора в пуле
    result = await loop.run_in_executor(
      None,
      lambda: interpret_spread(question=question, spread_labels=positions, cards=cards, use_async=False)
    )
  finally:
    typing_task.cancel()

  # Обработка результата и отправка пользователю
  short_answer = result.get("short_answer", "")
  cards_block = result.get("cards", [])
  conclusion = result.get("conclusion", "")
  tone = result.get("tone", "")
  confidence = result.get("confidence", None)

  # Форматируем вывод
  header_lines = []
  if short_answer:
    header_lines.append(f"🔮 {short_answer}")
  if conclusion:
    header_lines.append(f"\n{conclusion}")
  if tone:
    header_lines.append(f"\nТон: {tone}")
  if confidence is not None:
    header_lines.append(f"\nУверенность: {round(float(confidence) * 100)}%")
  header_text = "\n".join(header_lines).strip()

  await callback.message.answer(header_text)

  # Отдельно — разбор по картам (компактно)
  for card_info in cards_block:
    pos = card_info.get("position", "")
    label = card_info.get("label", "")
    card_name = card_info.get("card", "")
    interp = card_info.get("interpretation", "")
    advice = card_info.get("advice", "")
    text_lines = []
    if label:
      text_lines.append(f"— {label}")
    if card_name:
      text_lines.append(f"Карта: «{card_name}»")
    if interp:
      text_lines.append(f"Значение: {interp}")
    if advice:
      text_lines.append(f"Совет: {advice}")
    text = "\n".join(text_lines)
    await callback.message.answer(text)

  # финальная подсказка и кнопки снова
  await callback.message.answer("🔮 Расшифровка завершена. Хотите новый расклад?", reply_markup=make_after_cards_kb())

# Callback: пользователь нажал "Новый расклад"
@router.callback_query(lambda cq: cq.data == "tarot:new")
async def callback_new(callback: CallbackQuery, state: FSMContext):
  await callback.answer()
  await state.clear()
  await callback.message.answer("Выберите расклад:", reply_markup=start_kb)


# Регистрация роутера
def register_handlers(dp):
  dp.include_router(router)

