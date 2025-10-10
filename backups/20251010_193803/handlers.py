# handlers.py
from aiogram import Router
from aiogram.types import Message, FSInputFile, ReplyKeyboardMarkup, KeyboardButton, InputMediaPhoto
from aiogram.filters import Command, StateFilter
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext


from core.tarot import draw_card, draw_three_cards

# Создаём роутер
router = Router()

# Состояния
class TarotStates(StatesGroup):
    waiting_for_question_one = State()
    waiting_for_question_three = State()

# Клавиатура
start_kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="🎴 Одна карта"), KeyboardButton(text="🎴 Три карты")]
    ],
    resize_keyboard=True,
    one_time_keyboard=False
)

# /start
@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "🔮 Привет! Задай вопрос или выбери расклад:",
        reply_markup=start_kb
    )

# Выбор одной карты
@router.message(lambda msg: msg.text == "🎴 Одна карта")
async def choose_one_card(message: Message, state: FSMContext):
    await state.set_state(TarotStates.waiting_for_question_one)
    await message.answer("Задай свой вопрос:")

# Выбор трёх карт
@router.message(lambda msg: msg.text == "🎴 Три карты")
async def choose_three_cards(message: Message, state: FSMContext):
    await state.set_state(TarotStates.waiting_for_question_three)
    await message.answer("Задай вопрос для расклада из трёх карт:")

# Обработка вопроса → одна карта
@router.message(TarotStates.waiting_for_question_one)
async def process_one_card(message: Message, state: FSMContext):
    question = message.text
    card = draw_card()
    interpretation = card["reversed"] if card["is_reversed"] else card["upright"]
    caption = f"Вопрос: {question}\n\nКарта: {card['name']}\n\n{interpretation}"
    photo = FSInputFile(card["image_path"])
    await message.answer_photo(photo=photo, caption=caption, reply_markup=start_kb)
    await state.clear()

# Обработка вопроса → три карты
@router.message(TarotStates.waiting_for_question_three)
async def process_three_cards(message: Message, state: FSMContext):
    question = message.text
    cards = draw_three_cards()
    positions = ["Прошлое", "Настоящее", "Будущее"]

    # Формируем альбом
    media = []
    interpretations = []
    for i, card in enumerate(cards):
        media.append(InputMediaPhoto(media=FSInputFile(card["image_path"])))
        interp = card["reversed"] if card["is_reversed"] else card["upright"]
        interpretations.append(f"🔹 {positions[i]} — {card['name']}\n{interp}")

    # Отправляем альбом
    await message.answer_media_group(media=media)

    # Отправляем толкование отдельно
    caption = f"Вопрос: {question}\n\n" + "\n\n".join(interpretations)
    await message.answer(caption, reply_markup=start_kb)
    await state.clear()

# Регистрация всех хендлеров
def register_handlers(dp):
    dp.include_router(router)