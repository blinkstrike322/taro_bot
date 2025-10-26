import json
import os
import logging
import re
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from core.groq_client import create_groq_client

logger = logging.getLogger(__name__)

CARDS_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cards.json")

def load_cards_db() -> List[Dict[str, Any]]:
  with open(CARDS_FILE_PATH, "r", encoding="utf-8") as f:
    return json.load(f)

cards_db_list = load_cards_db()
cards_db = {card["name"]: card for card in cards_db_list}

def build_system_prompt() -> str:
  return (
    "You are a professional tarot reader. "
    "Respond ONLY with valid JSON, no explanations or markdown. "
    "Schema: {"
    '"short_answer": string, '
    '"cards": [{"position": int, "label": string, "card": string, "interpretation": string, "advice": string}], '
    '"conclusion": string, "tone": string, "confidence": number}'
  )

def build_user_prompt(question: str, spread_labels: List[str], cards: List[Dict[str, str]]) -> str:
  lines = [f'Вопрос: "{question}"']
  for i, card in enumerate(cards, 1):
    label = spread_labels[i - 1] if i - 1 < len(spread_labels) else f"Позиция {i}"
    lines.append(f"{i}) {card['name']} ({card.get('orientation', 'upright')}) — {label}")
  lines.append("Дай интерпретацию в валидном JSON по указанной схеме.")
  return "\n".join(lines)

def call_groq_sync(prompt: str, model: str = "llama-3.1-8b-instant", max_tokens: int = 1500) -> str:
  client = create_groq_client()
  try:
    response = client.chat.completions.create(
      model=model,
      messages=[
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": prompt},
      ],
      temperature=0.2,
      max_completion_tokens=max_tokens,
      top_p=1,
      stream=False,
    )
    text = response.choices[0].message.content.strip()
    logger.info(f"LLM ответ: {text[:200]}...")
    return text
  except Exception as e:
    logger.error(f"Ошибка вызова Groq API: {e}")
    return ""

def extract_json(text: str) -> Optional[Dict[str, Any]]:
  """Извлекает JSON даже из длинного ответа с шумом."""
  if not text:
    return None
  try:
    # Найдем JSON блок даже при тексте до/после
    match = re.search(r'(\{(?:[^{}]|(?R))*\})', text, flags=re.DOTALL)
    if match:
      json_candidate = match.group(1)
      return json.loads(json_candidate)
  except Exception as e:
    logger.warning(f"Не удалось извлечь JSON: {e}")
  return None

executor = ThreadPoolExecutor(max_workers=5)

def interpret_spread(question: str, spread_labels: List[str], cards: List[Dict[str, str]]) -> Dict[str, Any]:
  prompt = build_user_prompt(question, spread_labels, cards)
  try:
    future = executor.submit(call_groq_sync, prompt)
    raw_text = future.result(timeout=60)
    parsed = extract_json(raw_text)
    if parsed:
      return parsed
  except TimeoutError:
    logger.error("Groq API не ответил вовремя.")
  except Exception as e:
    logger.error(f"Ошибка интерпретации: {e}")

  return fallback_interpretation(question, spread_labels, cards)

def fallback_interpretation(question: str, spread_labels: List[str], cards: List[Dict[str, str]]) -> Dict[str, Any]:
  cards_out = []
  for i, card in enumerate(cards, 1):
    name = card.get("name")
    orientation = card.get("orientation", "upright")
    card_data = cards_db.get(name)
    meaning = "значение не найдено"
    if card_data:
      meaning = card_data.get(orientation, card_data.get("upright", meaning))
    label = spread_labels[i - 1] if i - 1 < len(spread_labels) else f"Позиция {i}"
    cards_out.append({
      "position": i,
      "label": label,
      "card": name,
      "interpretation": meaning,
      "advice": "Подумайте над этим значением в контексте вашего вопроса"
    })
  return {
    "short_answer": "Резервная интерпретация на основе базы карт.",
    "cards": cards_out,
    "conclusion": "LLM не сработал, использованы базовые значения.",
    "tone": "neutral",
    "confidence": 0.3
  }
