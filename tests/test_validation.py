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


# ── ужесточение карты дня ────────────────────────────────────────────────


def test_daily_without_daily_fields_rejected():
    """Карта дня обязана нести хотя бы одно дневное поле, иначе None (не-стаб)."""
    assert validate_interpretation(
        {"short_answer": "сигнал", "advice": "совет"},
        CARDS[:1], None, 1,
    ) is None


def test_daily_with_trajectory_passes():
    """Карта дня с «траектория» — допустимое дневное поле."""
    parsed = validate_interpretation(
        {"short_answer": "сигнал",
         "траектория": {"утро": "т", "день": "д", "вечер": "в"}},
        CARDS[:1], None, 1,
    )
    assert parsed is not None


def test_single_without_card_meaning_passes():
    """Одиночный расклад: short_answer обязателен, card_meaning опционален."""
    parsed = validate_interpretation(
        {"short_answer": "прямой ответ", "advice": "совет"},
        CARDS[:1], "вопрос?", 1,
    )
    assert parsed is not None
    assert parsed["card_meaning"] == []


# ── текстовый формат: кириллические ключи и русские алиасы ────────────────


def test_parse_text_format_cyrillic_positions():
    """text-формат: «позиции»/«связь_карт» распознаются как список и строка."""
    from core.llm import _parse_text_format

    parsed = _parse_text_format(
        'позиции: [{"позиция": "a", "карта": "Луна", "реверс": false, "трактовка": "текст"}]\n'
        "связь_карт: связь\n"
        "short_answer: ответ\n"
    )
    assert parsed is not None
    assert isinstance(parsed.get("позиции"), list) and parsed["позиции"]
    assert isinstance(parsed.get("связь_карт"), str) and parsed["связь_карт"].strip()
    assert isinstance(parsed.get("short_answer"), str) and parsed["short_answer"].strip()


def test_parse_text_format_cyrillic_daily_fields():
    """text-формат: дневные поля «проявление»/«на_что_смотреть»/«траектория»."""
    from core.llm import _parse_text_format

    parsed = _parse_text_format(
        "проявление: форма\n"
        "на_что_смотреть: зона\n"
        "траектория: путь\n"
        "short_answer: сигнал\n"
    )
    assert parsed is not None
    for key in ("проявление", "на_что_смотреть", "траектория", "short_answer"):
        assert parsed.get(key) not in (None, "")


def test_parse_text_format_aliases():
    """Русские алиасы ввод→intro, краткий_ответ→short_answer, совет→advice, значение→card_meaning."""
    from core.llm import _parse_text_format

    parsed = _parse_text_format(
        "ввод: шёпот\n"
        "краткий_ответ: ответ\n"
        "совет: совет\n"
        "значение: значение\n"
    )
    assert parsed is not None
    for key in ("intro", "short_answer", "advice"):
        assert isinstance(parsed.get(key), str) and parsed[key].strip()
    assert isinstance(parsed.get("card_meaning"), list) and parsed["card_meaning"]


def test_parse_text_format_short_answer_space_alias():
    """Алиас с пробелом «краткий ответ» также ведёт в short_answer."""
    from core.llm import _parse_text_format

    parsed = _parse_text_format("краткий ответ: ответ\n")
    assert parsed is not None
    assert isinstance(parsed.get("short_answer"), str) and parsed["short_answer"].strip()


# ── проза списком: склейка до схемных проверок (прод 2026-09-17) ──────────


def test_list_prose_joined_to_string():
    """Модель отдала short_answer/advice списком — склеивается в строку."""
    parsed = validate_interpretation(
        {"intro": "шёпот",
         "short_answer": ["первая мысль", "вторая мысль"],
         "проявление": ["форма один", "форма два"],
         "advice": ["совет"]},
        CARDS[:1], None, 1,
    )
    assert parsed is not None
    assert parsed["short_answer"] == "первая мысль\nвторая мысль"
    assert parsed["проявление"] == "форма один\nформа два"
    assert parsed["advice"] == "совет"


def test_only_checklist_prose_rejected():
    """Само-проверка модели («— only шёпот») в прозе — ответ непригоден."""
    assert validate_interpretation(
        {"intro": "Утро хранит шёпот — only шёпот",
         "short_answer": "сигнал дня",
         "проявление": "форма",
         "advice": "совет"},
        CARDS[:1], None, 1,
    ) is None


def test_english_thinking_rejected():
    """Английский chain-of-thought в ответе — непригоден."""
    assert validate_interpretation(
        {"intro": "шёпот",
         "short_answer": "Let me carefully analyze this task",
         "проявление": "форма",
         "advice": "совет"},
        CARDS[:1], None, 1,
    ) is None


def test_has_reasoning_leak_helper():
    from core.llm import _has_reasoning_leak

    assert _has_reasoning_leak("Зеркала — only зеркала")
    assert _has_reasoning_leak('(no "вода", "окна")')
    assert _has_reasoning_leak("We need to produce JSON")
    assert not _has_reasoning_leak("Тихий шёпот над водой без латиницы")


def test_list_trajectory_values_joined():
    """Значения «траектории» списком — склеиваются, расклад валиден."""
    parsed = validate_interpretation(
        {"short_answer": "сигнал",
         "траектория": {"утро": ["тон"], "день": "д", "вечер": ["в1", "в2"]}},
        CARDS[:1], None, 1,
    )
    assert parsed is not None
    assert parsed["траектория"]["утро"] == "тон"
    assert parsed["траектория"]["вечер"] == "в1\nв2"
