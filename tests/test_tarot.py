# tests/test_tarot.py
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from core.tarot import draw_cards, load_cards, validate_cards, get_card_image

# ── build_reading_prompt tests ──────────────────────────────────────────────

from core.prompts import build_reading_prompt


def test_build_reading_prompt_single_card():
    cards = [{"name": "Шут", "orientation": "upright"}]
    prompt = build_reading_prompt(cards, "Что ждет меня?", "shadow_walker", spread_type=1)
    assert "Странница Теней" in prompt
    assert "Шут" in prompt
    assert "Что ждет меня?" in prompt
    assert "JSON" in prompt
    assert "Расклад 3 карты" not in prompt
    assert "позиция" not in prompt


def test_build_reading_prompt_three_cards():
    cards = [
        {"name": "Шут", "orientation": "upright"},
        {"name": "Маг", "orientation": "reversed"},
        {"name": "Верховная Жрица", "orientation": "upright"},
    ]
    prompt = build_reading_prompt(cards, None, "shadow_walker", spread_type=3)
    assert "Расклад 3 карты" in prompt
    assert "Прошлое" in prompt
    assert "Настоящее" in prompt
    assert "Будущее" in prompt
    assert "позиция Прошлое" in prompt
    assert "позиция Настоящее" in prompt
    assert "позиция Будущее" in prompt


def test_build_reading_prompt_no_question():
    cards = [{"name": "Шут", "orientation": "upright"}]
    prompt = build_reading_prompt(cards, None, "ruin_keeper", spread_type=1)
    assert "Хранитель Руин" in prompt
    assert "?" not in prompt


def test_build_reading_prompt_json_intro_field():
    cards = [{"name": "Шут", "orientation": "upright"}]
    prompt = build_reading_prompt(cards, None, "shadow_walker", spread_type=1)
    assert "intro" in prompt


# ── parse_llm_response tests ────────────────────────────────────────────────

from core.llm import parse_llm_response, _parse_text_format, fallback_from_cards_db


def test_parse_json_response():
    text = (
        '{"intro": "Тени сгущаются...", "short_answer": "Ответ", '
        '"card_meaning": ["Шут: новое начало"], "advice": "Будь смелее"}'
    )
    result = parse_llm_response(text)
    assert result is not None
    assert result["intro"] == "Тени сгущаются..."
    assert result["short_answer"] == "Ответ"
    assert result["card_meaning"] == ["Шут: новое начало"]
    assert result["advice"] == "Будь смелее"


def test_parse_text_format_any_order():
    text = (
        "advice: Будь осторожен\n"
        "short_answer: Хороший день\n"
        'card_meaning: ["Шут: новое начало"]\n'
        "intro: Тени шепчут"
    )
    result = _parse_text_format(text)
    assert result is not None
    assert "Будь осторожен" in result.get("advice", "")
    assert "Хороший день" in result.get("short_answer", "")
    assert result["intro"] == "Тени шепчут"


def test_parse_text_format_reversed_order():
    text = (
        "intro: Привет\n"
        "advice: Совет дня\n"
        'card_meaning: ["Маг: сила"]\n'
        "short_answer: Итог"
    )
    result = _parse_text_format(text)
    assert result is not None
    assert result["intro"] == "Привет"
    assert result["short_answer"] == "Итог"
    assert result["advice"] == "Совет дня"


def test_parse_text_format_no_json_array():
    text = (
        "short_answer: Все хорошо\n"
        "card_meaning: Шут — новое начало\n"
        "advice: Действуй"
    )
    result = _parse_text_format(text)
    assert result is not None
    assert result["short_answer"] == "Все хорошо"
    assert isinstance(result["card_meaning"], list)
    assert len(result["card_meaning"]) == 1


def test_parse_unparseable_response():
    text = "Это просто какой-то текст без полей"
    result = parse_llm_response(text)
    assert result is not None
    assert "intro" in result
    assert "short_answer" in result
    assert "card_meaning" in result
    assert "advice" in result


# ── fallback_from_cards_db tests ────────────────────────────────────────────


def test_fallback_from_cards_db():
    cards = [{"name": "Шут", "orientation": "upright"}]
    result = fallback_from_cards_db(cards, "shadow_walker")
    assert result is not None
    assert "intro" in result
    assert "short_answer" in result
    assert "card_meaning" in result
    assert "advice" in result
    assert isinstance(result["card_meaning"], list)


def test_fallback_from_cards_db_three_cards():
    cards = [
        {"name": "Шут", "orientation": "upright"},
        {"name": "Маг", "orientation": "reversed"},
        {"name": "Верховная Жрица", "orientation": "upright"},
    ]
    result = fallback_from_cards_db(cards, "ruin_keeper")
    assert len(result["card_meaning"]) == 3


# ── interpret_reading test with mock ────────────────────────────────────────


@pytest.mark.asyncio
async def test_interpret_reading_mocked_llm():
    from core.llm import interpret_reading

    cards = [
        {
            "name": "Шут",
            "orientation": "upright",
            "id": "the-fool",
            "is_reversed": False,
        }
    ]

    mock_json_response = (
        '{"intro": "Тени...", "short_answer": "Ответ", '
        '"card_meaning": ["Шут: новое"], "advice": "Совет"}'
    )

    with patch(
        "core.llm.call_llm_with_fallback",
        new=AsyncMock(return_value=mock_json_response),
    ):
        result = await interpret_reading(
            question=None,
            cards=cards,
            character_id="shadow_walker",
            spread_type=1,
        )

    assert result is not None
    assert "intro" in result
    assert "short_answer" in result
    assert "card_meaning" in result
    assert "advice" in result
    assert result["short_answer"] == "Ответ"

def test_load_cards():
    cards = load_cards()
    assert isinstance(cards, list)
    assert len(cards) == 78

def test_draw_one_card():
    cards = draw_cards(1)
    assert len(cards) == 1
    card = cards[0]
    assert "name" in card
    assert "upright" in card
    assert "reversed" in card
    assert "image_path" in card
    assert "orientation" in card
    assert card["orientation"] in ("upright", "reversed")
    assert isinstance(card["is_reversed"], bool)

def test_draw_three_cards():
    cards = draw_cards(3)
    assert len(cards) == 3
    for card in cards:
        assert "name" in card
        assert isinstance(card["is_reversed"], bool)
        assert "orientation" in card

def test_get_card_image():
    path = get_card_image("the-fool")
    assert "pixel" in path
    assert path.endswith(".png")

def test_get_card_image_not_found():
    import pytest
    with pytest.raises(ValueError):
        get_card_image("nonexistent-card")
