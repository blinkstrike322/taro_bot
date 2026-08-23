"""Unit-тесты чистых функций пайплайна (без сети)."""
from core.llm import _failure_streak, _register_failure, _register_success


def test_cooldown_after_two_consecutive_failures():
    _failure_streak.pop("m1", None)
    assert _register_failure("m1") is False  # первая неудача — ещё не cooldown
    assert _register_failure("m1") is True   # вторая подряд — cooldown
    assert _register_failure("m1") is True   # третья — по-прежнему cooldown


def test_success_resets_streak():
    _failure_streak.pop("m2", None)
    _register_failure("m2")
    _register_success("m2")
    assert _register_failure("m2") is False  # streak сброшен — снова нужна 2-я


def test_streaks_are_per_model():
    _failure_streak.pop("a", None)
    _failure_streak.pop("b", None)
    _register_failure("a")
    assert _register_failure("b") is False
    assert _register_failure("a") is True
