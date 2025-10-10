# bot/handlers.py
from aiogram import Router
from aiogram.types import Message, FSInputFile, ReplyKeyboardMarkup, KeyboardButton, InputMediaPhoto
from aiogram.filters import Command
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext

from core.tarot import draw_cards
from core.utils import is_valid_question

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

# Общая функция обработки карточек
async def process_card_message(message: Message, state: FSMContext, n_cards: int, positions: list = None):
    question = message.text.strip()
    if not is_valid_question(question):
        await message.answer("Пожалуйста, задай осмысленный вопрос.")
        return

    cards = draw_cards(n_cards)
    if positions is None:
        positions = [f"Карта {i+1}" for i in range(n_cards)]

    media = []
    interpretations = []
    for i, card in enumerate(cards):
        media.append(InputMediaPhoto(media=FSInputFile(card["image_path"])))
        orientation = "🔄 Перевёрнута" if card["is_reversed"] else "⬆️ Прямо"
        interp = card["reversed"] if card["is_reversed"] else card["upright"]
        interpretations.append(f"🔹 {positions[i]} — {card['name']} ({orientation})\n{interp}")

    await message.answer_media_group(media=media)
    caption = f"Вопрос: {question}\n\n" + "\n\n".join(interpretations)
    await message.answer(caption, reply_markup=start_kb)
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
