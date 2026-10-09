# tests/test_prompts_arcanum.py
# Тесты Task 7 (brief): маркеры адаптированы к фактическому SNAP3-тексту
# (плановое правило: тест подгоняется под текст, не наоборот):
#   • «позиция фильтрует карту» → «ПОЗИЦИЯ ФИЛЬТРУЕТ КАРТУ» (ремесло, приём 1)
#   • «элементальные соответствия» → строка стихий Golden Dawn (приём 3)
#   • «эмодзи» → «ЭМОДЗИ» (NO_EMOJI_RULE в SNAP3 капсом)
from core.llm import validate_interpretation
from core.prompts import build_day_forecast_prompt, build_reading_prompt, get_system_prompt

CARDS = [
    {"id": "the-fool", "name": "Шут", "orientation": "прямое", "upright": "н", "reversed": "п"},
    {"id": "the-magician", "name": "Маг", "orientation": "перевернутое", "upright": "н", "reversed": "п"},
]

def test_system_prompt_has_craft_block():
    p = get_system_prompt("shadow_walker")
    assert "ПОЗИЦИЯ ФИЛЬТРУЕТ КАРТУ" in p   # маркер «10 приёмов ремесла»
    assert "Жезлы — огонь, Кубки — вода, Мечи — воздух, Пентакли — земля" in p  # блок Golden Dawn
    assert "ЭМОДЗИ" in p

def test_reading_prompt_requests_arcanum_json():
    p = build_reading_prompt(CARDS, "цель?", "shadow_walker",
                             {"id": "horseshoe", "name": "подкова", "count": 3},
                             ["за", "против", "совет"])
    assert "позиции" in p and "short_answer" in p and "связь_карт" in p and "JSON" in p

def test_forecast_prompt_strict_json():
    p = build_day_forecast_prompt({"name": "Солнце", "orientation": "прямое"})
    for key in ("лозунг", "утро", "день", "вечер", "фокус", "тонус", "удача", "общение", "глоток"):
        assert key in p

def test_validate_interpretation_new_shape():
    good = {"intro": "и", "short_answer": "с",
            "позиции": [{"позиция": "за", "карта": "Шут", "реверс": False, "трактовка": "т"}] * 2}
    assert validate_interpretation(good, CARDS, "в") is not None
    assert validate_interpretation({"intro": "", "short_answer": "с"}, CARDS, "в") is None
    assert validate_interpretation({"intro": "и", "short_answer": "с", "позиции": []}, CARDS, "в") is None

def test_validate_interpretation_legacy_passthrough():
    legacy = {"intro": "и", "short_answer": "с", "card_meaning": "м", "advice": "а"}
    assert validate_interpretation(legacy, CARDS, "в") is not None
