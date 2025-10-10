# tests/test_tarot.py
from pathlib import Path
from core.tarot import draw_card, draw_three_cards, load_cards, validate_cards

def test_load_and_validate_cards():
  cards = load_cards()
  assert isinstance(cards, list)
  validate_cards()

def test_draw_card():
  card = draw_card()
  assert "name" in card
  assert "upright" in card
  assert "reversed" in card
  assert "image_path" in card
  assert isinstance(card["is_reversed"], bool)
  assert Path(card["image_path"]).exists()

def test_draw_three_cards():
  cards = draw_three_cards()
  assert 1 <= len(cards) <= 3
  for card in cards:
    assert "name" in card
    assert isinstance(card["is_reversed"], bool)
    assert Path(card["image_path"]).exists()


