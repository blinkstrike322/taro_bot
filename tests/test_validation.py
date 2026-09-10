# tests/test_validation.py
# Валидация + ремонт ответа LLM против фактических карт расклада.
from core.llm import validate_interpretation

CARDS = [
    {"id": "the-moon", "name": "Луна", "is_reversed": False, "orientation": "upright"},
    {"id": "death", "name": "Смерть", "is_reversed": True, "orientation": "reversed"},
    {"id": "the-star", "name": "Звезда", "is_reversed": False, "orientation": "upright"},
]

QUESTION = "что будет в отношениях?"


def _base():
    return {
        "intro": "шёпот",
        "short_answer": "связный ответ",
        "позиции": [
            {"позиция": "Твоя позиция и энергия", "карта": "Луна", "реверс": False, "трактовка": "текст 1"},
            {"позиция": "Динамика между вами", "карта": "Смерть", "реверс": False, "трактовка": "текст 2"},
            {"позиция": "Главный вектор развития", "карта": "Звезда", "реверс": True, "трактовка": "текст 3"},
        ],
        "связь_карт": "связь",
        "advice": "совет",
    }


def test_valid_three_passes():
    parsed = validate_interpretation(_base(), CARDS, QUESTION, 3)
    assert parsed is not None
    assert parsed["short_answer"] == "связный ответ"


def test_reversed_flags_repaired():
    """Реверсы в ответе модели исправляются на фактические."""
    parsed = validate_interpretation(_base(), CARDS, QUESTION, 3)
    assert [p["реверс"] for p in parsed["позиции"]] == [False, True, False]


def test_swapped_cards_reordered():
    """Модель перепутала порядок карт — ремонт сопоставляет по именам."""
    base = _base()
    base["позиции"][0]["карта"] = "Звезда"
    base["позиции"][2]["карта"] = "Луна"
    parsed = validate_interpretation(base, CARDS, QUESTION, 3)
    assert parsed is not None
    names = [p["карта"] for p in parsed["позиции"]]
    assert names == ["Луна", "Смерть", "Звезда"]


def test_wrong_position_labels_replaced_with_backend():
    """Позиции из ответа заменяются на авторитетные позиции бэкенда."""
    base = _base()
    base["позиции"][0]["позиция"] = "прошлое"
    base["позиции"][1]["позиция"] = "настоящее"
    base["позиций"] = None  # лишний ключ не мешает
    parsed = validate_interpretation(base, CARDS, QUESTION, 3)
    assert parsed is not None
    labels = [p["позиция"] for p in parsed["позиции"]]
    assert labels == ["Твоя позиция и энергия", "Динамика между вами", "Главный вектор развития"]


def test_unknown_card_names_fall_back_positional():
    """Несуществующие имена карт → позиционное сопоставление (порядок промпта)."""
    base = _base()
    for p in base["позиции"]:
        p["карта"] = "Выдуманная карта"
    parsed = validate_interpretation(base, CARDS, QUESTION, 3)
    assert parsed is not None
    assert [p["карта"] for p in parsed["позиции"]] == ["Луна", "Смерть", "Звезда"]


def test_missing_short_answer_rejected():
    base = _base()
    del base["short_answer"]
    assert validate_interpretation(base, CARDS, QUESTION, 3) is None


def test_wrong_positions_count_rejected():
    base = _base()
    base["позиции"] = base["позиции"][:2]
    assert validate_interpretation(base, CARDS, QUESTION, 3) is None


def test_empty_treatment_rejected():
    base = _base()
    base["позиции"][1]["трактовка"] = "   "
    assert validate_interpretation(base, CARDS, QUESTION, 3) is None


def test_single_card_meaning_normalized():
    parsed = validate_interpretation(
        {"intro": "i", "short_answer": "a", "card_meaning": ["  ", "значение"]},
        CARDS[:1], "вопрос?", 1,
    )
    assert parsed["card_meaning"] == ["значение"]


def test_non_dict_rejected():
    assert validate_interpretation("строка", CARDS, QUESTION, 3) is None
    assert validate_interpretation(None, CARDS, QUESTION, 3) is None


def test_daily_minimal_passes():
    parsed = validate_interpretation(
        {"short_answer": "сигнал дня", "проявление": "форма", "advice": "совет"},
        CARDS[:1], None, 1,
    )
    assert parsed is not None
    assert parsed["intro"] == ""
