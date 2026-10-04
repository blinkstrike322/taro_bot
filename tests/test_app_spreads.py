# tests/test_app_spreads.py
# Контракт каталога раскладов на уровне /api/spread/begin: count приходит
# из каталога, позиции/ключи соответствуют записям data/spreads.json.
# Интеграцию хендлера проверяем на уровне моков — tests/test_spread_lifecycle.py.
import pytest
from core.spreads import resolve_spread


def test_count_comes_from_catalog():
    # needs_question-расклады разрешимы только с вопросом: без него каталог
    # безопасно падает в daily (resolve_spread, прод-семантика Task 1).
    for sid, n in [("yesno", 3), ("mfd", 3), ("shadow", 6), ("pentagram", 6), ("horseshoe", 7), ("daily", 1)]:
        assert resolve_spread(sid, "вопрос")["count"] == n
    # без вопроса: daily/three разрешимы сами, needs_question падает в daily
    assert resolve_spread("daily", None)["count"] == 1
    assert resolve_spread("three", None)["count"] == 3
    assert resolve_spread("yesno", None)["id"] == "daily"
    assert resolve_spread("mfd", None)["id"] == "daily"
    assert resolve_spread("pentagram", None)["id"] == "daily"
    assert resolve_spread("horseshoe", None)["id"] == "daily"


def test_positions_and_keys_shape():
    s = resolve_spread("pentagram", "q")
    names = [p["name"] for p in s["positions"]]
    keys = [p["key"] for p in s["positions"]]
    assert len(names) == len(keys) == 6
    assert keys[0] == "center" and names[0] == "сигнификатор"


def test_reading_type_format():
    for sid in ["yesno", "mfd", "shadow", "pentagram", "horseshoe", "single", "three"]:
        s = resolve_spread(sid, "вопрос")
        assert (s["id"] == "daily") or (f"spread_{s['id']}" == f"spread_{sid}")
