import pytest

from core.llm_gate import validate_interpretation, validate_followup


CARDS = [
    {"name": "Луна", "orientation": "upright"},
    {"name": "Звезда", "orientation": "upright"},
    {"name": "Солнце", "orientation": "upright"},
]

GOOD = {
    "intro": "Ты несёшь вопрос, как фонарь в тумане.",
    "short_answer": (
        "Луна в раскладе говорит о паузе, которая тебе нужна. Звезда рядом — "
        "значит, за этой паузой уже ждёт надежда, которую ты почти не пускаешь "
        "к себе. Солнце в конце истории обещает ясность: не сейчас, но скоро, "
        "и она придёт не извне, а из твоего решения перестать торопить себя."
    ),
    "card_meaning": ["Луна: пауза.", "Звезда: надежда.", "Солнце: ясность."],
    "advice": "Сегодня позволь себе не решать ничего окончательного.",
}


def test_valid_interpretation_passes():
    ok, reason = validate_interpretation(GOOD, CARDS, "shadow_walker")
    assert ok, reason


def test_short_answer_too_short_fails():
    bad = {**GOOD, "short_answer": "Карты говорят всё хорошо."}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "short" in reason


def test_missing_intro_fails():
    bad = {**GOOD, "intro": ""}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "intro" in reason


def test_missing_advice_fails():
    bad = {**GOOD, "advice": None}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "advice" in reason


def test_emoji_flag_fails():
    ok, reason = validate_interpretation(GOOD, CARDS, "shadow_walker", had_emoji=True)
    assert not ok and "emoji" in reason


def test_card_name_coverage_required():
    stripped = GOOD["short_answer"]
    for a, b in (("Луна", "Тень"), ("Звезда", "Искра"), ("Солнце", "Свет")):
        stripped = stripped.replace(a, b)
    bad = {**GOOD, "short_answer": stripped}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "coverage" in reason


def test_character_forbidden_phrase_fails():
    bad = {**GOOD, "advice": "Луна шепчет — доверяй."}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "forbidden" in reason


def test_global_forbidden_phrase_fails():
    bad = {**GOOD, "advice": "Стоит обратить внимание на то, что день новый."}
    ok, reason = validate_interpretation(bad, CARDS, "shadow_walker")
    assert not ok and "forbidden" in reason


def test_unknown_character_still_checks_global_forbidden():
    bad = {**GOOD, "advice": "Карта указывает на перемены."}
    ok, reason = validate_interpretation(bad, CARDS, "nope")
    assert not ok and "forbidden" in reason


def test_followup_ok():
    ok, reason = validate_followup(
        "Вода в чаше ещё не успокоилась — дай ей ночь, и спроси себя утром снова.",
        "shadow_walker",
    )
    assert ok, reason


def test_followup_too_short_fails():
    ok, reason = validate_followup("Хорошо.", "shadow_walker")
    assert not ok and "short" in reason
