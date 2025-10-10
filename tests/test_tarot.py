from pathlib import Path
from core.tarot import draw_card, draw_three_cards


def test_draw_card():
    card = draw_card()

    # Проверяем структуру
    assert "name" in card
    assert "upright" in card
    assert "reversed" in card
    assert "image_path" in card
    assert isinstance(card["is_reversed"], bool)

    # Проверяем, что файл изображения существует
    image_path = Path(card["image_path"])
    assert image_path.exists(), f"Image not found: {image_path}"

    # Проверяем, что имя не пустое
    assert card["name"], "Card name is empty"

def test_draw_three_cards():
    cards = draw_three_cards()
    assert len(cards) == 3
    for card in cards:
        assert "name" in card
        assert isinstance(card["is_reversed"], bool)
        assert Path(card["image_path"]).exists()

