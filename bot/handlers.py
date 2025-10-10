# bot/handlers.py
from aiogram import Router
from aiogram.types import Message, FSInputFile, ReplyKeyboardMarkup, KeyboardButton
from aiogram.filters import Command
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext

from core.tarot import draw_cards
from core.utils import is_valid_question
from core.emotion import detect_emotion, generate_mirror

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
    Orchestration pipeline:
    1) validate question
    2) quick emotion mirror (one short message)
    3) magic-ball indicator (one short message)
    4) send album of cards (one media_group)
    5) send compact interpretations (one message or logical blocks)
    """

    question = (message.text or "").strip()
    if not is_valid_question(question):
        await message.answer("Пожалуйста, задай осмысленный вопрос.")
        return

    # --- 1) Emotion mirror (one short message) ---
    emotion_label, emotion_score = detect_emotion(question)
    mirror_text = generate_mirror(question, emotion_label, emotion_score)
    # show_mirror_once handles a small typing action and sends a single message
    await show_mirror_once(message, mirror_text, delay=0.45)

    # --- 2) Magic ball indicator (one short message) ---
    await show_magic_ball_once(message)

    # --- 3) Draw cards and prepare positions ---
    cards = draw_cards(n_cards)
    if positions is None:
        positions = [f"Карта {i+1}" for i in range(n_cards)]

    # --- 4) Send images as a single media_group (efficient, one API call) ---
    await send_media_group_quiet(message, cards)

    # --- 5) Send compact interpretations (single message if fits, else logical blocks) ---
    await send_interpretations_compact(message, cards, positions)

    # --- 6) Final hint and reset UI state ---
    await message.answer("🔮 Расклад завершён!", reply_markup=start_kb)
    await state.clear()


# Обработка вопросов
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


# Регистрация роутера
def register_handlers(dp):
    dp.include_router(router)
