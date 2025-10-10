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
  """
  Загружает cards.json один раз в процессе (кеширует в _CARDS).
  """
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
  """
  Проверяет, что для каждой карты существует файл изображения.
  Вызываем на старте приложения.
  """
  cards = load_cards()
  missing = []
  for c in cards:
    filename = c.get("filename")
    if not filename:
      missing.append(f"card {c.get('id') or c.get('name')} missing filename")
      continue
    image_path = PROJECT_ROOT / "static" / filename
    if not image_path.exists():
      missing.append(str(image_path))
  if missing:
    msg = "Missing card images or filenames:\n" + "\n".join(missing)
    logger.error(msg)
    raise FileNotFoundError(msg)
  logger.info("All %d card images found", len(cards))

def _card_payload(card: Dict[str, Any]) -> Dict[str, Any]:
  """Собираем payload, пригодный для отправки в handlers."""
  is_reversed = random.choice([True, False])
  filename = card.get("filename", "")
  image_path = str(PROJECT_ROOT / "static" / filename)
  return {
    "id": card.get("id"),
    "name": card.get("name"),
    "upright": card.get("upright"),
    "reversed": card.get("reversed"),
    "image_path": image_path,
    "is_reversed": is_reversed
  }

def draw_card() -> Dict[str, Any]:
  cards = load_cards()
  if not cards:
    raise RuntimeError("No cards loaded")
  card = random.choice(cards)
  return _card_payload(card)

def draw_three_cards() -> List[Dict[str, Any]]:
  cards = load_cards()
  if not cards:
    raise RuntimeError("No cards loaded")
  k = 3 if len(cards) >= 3 else len(cards)
  selected = random.sample(cards, k)
  return [_card_payload(c) for c in selected]


