import random
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent


def load_cards():
    path = PROJECT_ROOT / "data" / "cards.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def draw_card():
    cards = load_cards()
    card = random.choice(cards)
    return {
        "name": card["name"],
        "upright": card["upright"],
        "reversed": card["reversed"],
        "image_path": str(PROJECT_ROOT / "static" / card["filename"]),  # ← явно!
        "is_reversed": random.choice([True, False])
    }

def draw_three_cards():
    cards = load_cards()
    selected = random.sample(cards, 3)  # без повторов
    result = []
    for i, card in enumerate(selected):
        idx = cards.index(card)
        result.append({
            "name": card["name"],
            "upright": card["upright"],
            "reversed": card["reversed"],
            "image_path": str(PROJECT_ROOT / "static" / card["filename"]),
            "is_reversed": random.choice([True, False])
        })
    return result

