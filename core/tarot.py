# core/tarot.py
import random
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
_CARDS: List[Dict[str, Any]] = []

def load_cards() -> List[Dict[str, Any]]:
    global _CARDS
    if _CARDS:
        return _CARDS
    path = PROJECT_ROOT / "data" / "cards.json"
    try:
        with open(path, "r", encoding="utf-8") as f:
            _CARDS = json.load(f)
    except Exception as e:
        logger.exception("Не удалось загрузить cards.json: %s", path)
        raise
    return _CARDS

def validate_cards() -> None:
    cards = load_cards()
    missing = []
    for c in cards:
        filename = c.get("filename")
        if not filename:
            missing.append(f"card {c.get('id') or c.get('name')} missing filename")
            continue
        image_path = PROJECT_ROOT / "static" / "pixel" / filename
        if not image_path.exists():
            missing.append(str(image_path))
    if missing:
        msg = "Missing card images or filenames:\n" + "\n".join(missing)
        logger.error(msg)
        raise FileNotFoundError(msg)
    logger.info("All %d card images found", len(cards))

def _card_payload(card: Dict[str, Any]) -> Dict[str, Any]:
    is_reversed = random.choice([True, False])
    filename = card.get("filename", "")
    image_path = str(PROJECT_ROOT / "static" / "pixel" / filename)
    return {
        "id": card.get("id"),
        "name": card.get("name"),
        "upright": card.get("upright"),
        "reversed": card.get("reversed"),
        "image_path": image_path,
        "is_reversed": is_reversed,
        "orientation": "reversed" if is_reversed else "upright",
    }

def draw_cards(n: int) -> List[Dict[str, Any]]:
    cards = load_cards()
    if not cards:
        raise RuntimeError("No cards loaded")
    k = min(n, len(cards))
    selected = random.sample(cards, k)
    return [_card_payload(c) for c in selected]

def get_card_image(card_id: str) -> str:
    cards = load_cards()
    for c in cards:
        if c.get("id") == card_id:
            filename = c.get("filename", "")
            return str(PROJECT_ROOT / "static" / "pixel" / filename)
    raise ValueError(f"Card not found: {card_id}")

