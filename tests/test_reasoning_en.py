"""Англоязычные chain-of-thought дампы в ответах LLM (бой 09.10.2026).

Разборки month/arcana-шепота присылали планирование вслух целиком:
«Let me analyze this request carefully…», «The user provides…»,
«I need to respond as the friend-trickster persona…».
Русские маркеры clean_llm_answer их не ловят — английский CoT обязан
уходить в retry/fallback, а не в ответ пользователю.
"""

from core.fallbacks import clean_llm_answer

MONTH_EN_DUMP = """Let me analyze this request carefully. The user provides a month summary \
for a tarot operator (October 2026) and asks me to respond in a specific way.
I need to respond in a specific way: one paragraph, 3-5 sentences, no lists.
The persona is a best friend trickster: sharp, funny, metacognitive.
Let me draft: serum, vot takoi otvet.
Then the final encouraging line for next month.
Wait, let me check constraints: one paragraph, lowercase, no headers."""

ARCANA_EN_DUMP = """The user is asking about their personal arcana — the Hermit, \
and wants to know how to listen to it within themselves.
I need to respond as the friend-trickster persona, speaking directly \
to this person, in Russian, 3-6 sentences, connected prose, no lists.
Let me craft this in my persona voice, sharp and warm."""


def test_month_en_cot_goes_to_fallback():
    assert clean_llm_answer(MONTH_EN_DUMP) == ""


def test_arcana_en_cot_goes_to_fallback():
    assert clean_llm_answer(ARCANA_EN_DUMP) == ""


def test_legit_russian_answer_passes_through():
    good = "слушай, месяц вышел плотным: девятки жезлов держали строй до конца."
    assert clean_llm_answer(good) == good


def test_trailing_self_check_is_cut_but_answer_kept():
    mixed = "итог недели под знаком башни — она выпала трижды.\nWait, let me check length"
    out = clean_llm_answer(mixed)
    assert "Wait" not in out and "башни" in out
