# core/emotion.py
import re
from typing import Tuple

_BUCKETS = {
  "anxiety": ["тревог", "беспокои", "паник", "волную", "пережив", "страх", "боюсь"],
  "sadness": ["груст", "печал", "одинок", "безысход", "подавлен"],
  "anger": ["злюс", "злость", "раздражен", "ненавид", "зол"],
  "hope": ["радост", "радуюсь", "оптимист", "вдохнов"],
  "practical": ["как", "что делать", "совет", "помоги", "помогите", "как мне"]
}

def detect_emotion(text: str) -> Tuple[str, float]:
  if not text:
    return "neutral", 0.0
  s = text.lower()
  scores = {}
  for label, words in _BUCKETS.items():
    cnt = 0
    for w in words:
      if re.search(re.escape(w), s):
        cnt += 1
    scores[label] = cnt
  top_label = max(scores, key=lambda k: scores[k])
  top_score = scores[top_label]
  total = sum(scores.values())
  if total == 0:
    return "neutral", 0.0
  return top_label, float(top_score) / float(total) if total else 0.0

def generate_mirror(user_text: str, emotion_label: str, emotion_score: float, tone: str = "mystic") -> str:
  if emotion_label == "anxiety":
    return "В твоём вопросе слышится беспокойство и напряжение. Карты помогут показать, где прячется причина этого чувства."
  if emotion_label == "sadness":
    return "Я слышу печаль в твоих словах. Карты могут указать, что нужно отпустить, чтобы стало легче."
  if emotion_label == "anger":
    return "В словах чувствуется раздражение и неспокойство. Посмотрим, куда уходит эта энергия и как её направить."
  if emotion_label == "hope":
    return "В твоём сообщении слышится надежда и открытость. Карты покажут, как это можно развить."
  if emotion_label == "practical":
    return "Вопрос поставлен конкретно — ищем практический ориентир в раскладе."
  return "Слышу в твоих словах смешанные нотки. Давай посмотрим, что скажут карты."
