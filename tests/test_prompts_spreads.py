# tests/test_prompts_spreads.py
from core.spreads import get_spread
from core.prompts import build_reading_prompt

CARDS = [
    {"name": "Луна", "orientation": "reversed"},
    {"name": "Солнце", "orientation": "upright"},
    {"name": "Башня", "orientation": "upright"},
]

def _pos(spread_id):
    return [p["name"] for p in get_spread(spread_id)["positions"]]

def test_yesno_requires_verdict():
    p = build_reading_prompt(CARDS, "менять ли работу?", "shadow_walker",
                             get_spread("yesno"), _pos("yesno"))
    assert "Да." in p and "Скорее да." in p
    assert "позиции" in p and "связь_карт" in p

def test_pentagram_rules():
    p = build_reading_prompt(CARDS, "кто я в этой ситуации?", "ruin_keeper",
                             get_spread("pentagram"), _pos("pentagram"))
    assert "НЕ предсказание" in p
    assert "доминирует" in p

def test_shadow_requires_concrete_step():
    p = build_reading_prompt(CARDS, None, "spark_of_chaos",
                             get_spread("shadow"), _pos("shadow"))
    assert "конкретное" in p

def test_three_uses_dynamic_positions():
    p = build_reading_prompt(CARDS, "что будет в отношениях?", "shadow_walker",
                             get_spread("three"), ["Твоя позиция", "Динамика", "Вектор"])
    assert "Твоя позиция" in p and "Динамика" in p

def test_single_daily_unchanged():
    p = build_reading_prompt([CARDS[0]], "кто виноват?", "shadow_walker",
                             get_spread("single"), _pos("single"))
    assert "card_meaning" in p
    d = build_reading_prompt([CARDS[0]], None, "shadow_walker", get_spread("daily"), _pos("daily"))
    assert "проявление" in d and "траектория" in d

def test_mfd_third_person_and_position_records():
    cards = CARDS[:3]
    p = build_reading_prompt(cards, "он ко мне остыл?", "shadow_walker",
                             get_spread("mfd"), _pos("mfd"))
    assert "Говори о нем в третьем лице" in p
    assert p.count('{"позиция":') == 3
    for name in _pos("mfd"):
        assert name in p

def test_horseshoe_seven_position_records():
    cards = CARDS + [
        {"name": "Звезда", "orientation": "upright"},
        {"name": "Колесо", "orientation": "upright"},
        {"name": "Император", "orientation": "reversed"},
        {"name": "Жрица", "orientation": "upright"},
    ]
    p = build_reading_prompt(cards[:7], "куда это приведет?", "shadow_walker",
                             get_spread("horseshoe"), _pos("horseshoe"))
    assert p.count('{"позиция":') == 7
