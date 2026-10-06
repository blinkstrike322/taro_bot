from core.spreads import get_spread, load_spreads, resolve_spread


def test_all_spreads_valid():
    spreads = load_spreads()
    assert set(spreads) == {"daily","single","yesno","three","mfd","shadow","pentagram","horseshoe"}
    for s in spreads.values():
        assert 1 <= s["count"] <= 10
        assert s["mode"] in {"daily","single","yesno","three","mfd","shadow","pentagram","horseshoe"}
        assert s["layout"] in {"column1","trio","pyramid","spine","pentagram","arc"}
        assert len(s["positions"]) == s["count"]
        if s["id"] != "three":
            assert {p["key"] for p in s["positions"]} == set(s["flip_order"]), s["id"]

def test_legacy_mapping():
    assert resolve_spread("daily", None)["id"] == "daily"
    assert resolve_spread(1, "вопрос?")["id"] == "single"
    assert resolve_spread("1", "вопрос?")["id"] == "single"
    assert resolve_spread(3, None)["id"] == "three"
    assert resolve_spread("3", None)["id"] == "three"
    assert resolve_spread("pentagram", "кто я?")["id"] == "pentagram"

def test_unknown_falls_back():
    assert resolve_spread("nonexistent", "q")["id"] == "single"
    assert resolve_spread("nonexistent", None)["id"] == "daily"

def test_get_spread_pentagram():
    s = get_spread("pentagram")
    assert s is not None
    assert s["count"] == 6
    assert s["flip_order"] == ["earth", "air", "water", "fire", "spirit", "center"]

def test_whitespace_question_falls_back_to_daily():
    assert resolve_spread("yesno", "   ")["id"] == "daily"
