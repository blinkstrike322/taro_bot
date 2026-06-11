# tests/test_tarot.py
from pathlib import Path
from core.tarot import draw_cards, load_cards, validate_cards, get_card_image

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
