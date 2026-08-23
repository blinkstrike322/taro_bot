"""Настроение дня проводницы — детерминированное, вместо random на расклад.

Селена живёт по фазе луны, Веста — по времени суток, Лилит — по дню года.
Настроение стабильно весь день: его видно в UI («сегодня у неё гроза»).
"""
from __future__ import annotations

import datetime as _dt

from core.prompts import get_character

_SYNODIC = 29.53058867
_EPOCH_NEW_MOON = _dt.datetime(2000, 1, 6, 18, 14, tzinfo=_dt.timezone.utc)

# Границы фаз (доля синодического месяца, 0 = новолуние) → mood_id Селены
_SELENA_PHASE_MAP: list[tuple[float, str]] = [
    (0.0625, "fog"),
    (0.4375, "tide"),
    (0.6875, "light_moon"),
    (0.9375, "storm"),
    (1.01, "fog"),
]


def moon_phase(now: _dt.datetime | None = None) -> float:
    """Фаза луны 0..1 (0 — новолуние)."""
    now = now or _dt.datetime.now(_dt.timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=_dt.timezone.utc)
    delta = now - _EPOCH_NEW_MOON
    return (delta.total_seconds() / 86400 / _SYNODIC) % 1.0


def mood_of_day(character_id: str, now: _dt.datetime | None = None) -> dict:
    """Детерминированное настроение проводницы на сегодня.

    Возвращает элемент `moods` персонажа ({"id","name","prompt"}) или {}.
    """
    try:
        ch = get_character(character_id)
    except KeyError:
        return {}
    moods: list[dict] = ch.get("moods") or []
    if not moods:
        return {}
    by_id = {m["id"]: m for m in moods}

    now = now or _dt.datetime.now()
    if character_id == "shadow_walker":
        p = moon_phase(now)
        for limit, mood_id in _SELENA_PHASE_MAP:
            if p < limit:
                return by_id.get(mood_id, moods[0])
        return moods[0]

    if character_id == "ruin_keeper":
        h = now.hour
        mood_id = (
            "amber" if 5 <= h < 11
            else "hearth" if 11 <= h < 17
            else "smoke" if 17 <= h < 22
            else "stone"
        )
        return by_id.get(mood_id, moods[0])

    return moods[now.timetuple().tm_yday % len(moods)]
