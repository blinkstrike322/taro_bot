"""Живой замер латентности хеджированного пайплайна: 3 реальных расклада."""
import asyncio
import time

from core.llm import interpret_reading, close_client
from core.prompts import get_system_prompt, build_reading_prompt


async def one(i: int):
    cards = [
        {"name": "Звезда", "orientation": "upright"},
        {"name": "Луна", "orientation": "reversed"},
        {"name": "Солнце", "orientation": "upright"},
    ]
    t0 = time.monotonic()
    result = await interpret_reading(None, cards, "shadow_walker", "daily")
    dt = time.monotonic() - t0
    ok = bool(result.get("short_answer"))
    intro = (result.get("intro") or "")[:60]
    print(f"#{i}: {dt:5.1f}s ok={ok} intro={intro!r}")
    return dt, ok


async def main():
    times = []
    for i in range(3):
        dt, ok = await one(i + 1)
        times.append(dt)
    await close_client()
    print(f"\nmedian: {sorted(times)[1]:.1f}s  max: {max(times):.1f}s")


asyncio.run(main())
