import datetime as dt

from core.moods import mood_of_day, moon_phase


def test_moon_phase_in_range():
    p = moon_phase(dt.datetime(2026, 8, 23, tzinfo=dt.timezone.utc))
    assert 0.0 <= p < 1.0


def test_moon_phase_known_new_moon():
    p = moon_phase(dt.datetime(2000, 1, 6, 18, 14, tzinfo=dt.timezone.utc))
    assert p < 0.01


def test_selena_mood_deterministic_within_day():
    t = dt.datetime(2026, 8, 23, 10, 0)
    a = mood_of_day("shadow_walker", now=t)
    b = mood_of_day("shadow_walker", now=t + dt.timedelta(minutes=30))
    assert a == b and a.get("id")


def test_selena_mood_follows_moon_phase():
    # полнолуние ≈ 0.5 фазы
    full_moon = dt.datetime(2000, 1, 21, tzinfo=dt.timezone.utc)
    m = mood_of_day("shadow_walker", now=full_moon)
    assert m["id"] == "light_moon"


def test_vesta_mood_depends_on_hour():
    morning = mood_of_day("ruin_keeper", now=dt.datetime(2026, 8, 23, 8, 0))
    evening = mood_of_day("ruin_keeper", now=dt.datetime(2026, 8, 23, 19, 0))
    assert morning["id"] == "amber"
    assert evening["id"] == "smoke"


def test_lilith_mood_rotates_by_day():
    a = mood_of_day("spark_of_chaos", now=dt.datetime(2026, 8, 23, 12, 0))
    b = mood_of_day("spark_of_chaos", now=dt.datetime(2026, 8, 24, 12, 0))
    assert a.get("id") and b.get("id")
    assert a["id"] in {"sparks", "quiet_fire", "storm", "midnight_laugh"}


def test_unknown_character_returns_empty():
    assert mood_of_day("nope") == {}
