"""Бенчмарк бесплатных моделей OpenCode Zen: скорость + качество.

Промпты — реальные продакшн-промпты (расклад дня + доп-вопрос).
Оценка качества: валидный JSON со всеми полями, объём, кириллица,
отсутствие эмодзи и запрещённых штампов, упоминание всех карт.
"""
import asyncio
import json
import time

import httpx

from config import settings
from core.llm import parse_llm_response, strip_emojis
from core.prompts import get_system_prompt, build_reading_prompt, build_followup_messages
from core.tarot import load_cards

ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
TIMEOUT = 90.0  # для замера — даём медленным шанс показать себя

MODELS = [
    "deepseek-v4-flash-free",
    "nemotron-3.5-lightning-free",
    "nemotron-3-ultra-free",
    "mimo-v2.5-free",
    "hy3-free",
    "laguna-s-2.1-free",
    "muse-spark-1.2-contributor-free",
    "x-preview-f-free",
]

BANNED = ("карта указывает", "в позиции", "значение этой карты", "аркан символизирует")


def make_prompts():
    cards = load_cards()[:40]
    daily_cards = [
        {"name": "Звезда", "orientation": "upright"},
        {"name": "Луна", "orientation": "reversed"},
        {"name": "Солнце", "orientation": "upright"},
    ]
    daily = (
        get_system_prompt("shadow_walker"),
        build_reading_prompt(daily_cards, None, "shadow_walker", "daily"),
        6000,
    )
    follow = build_followup_messages(
        "shadow_walker",
        {
            "question": None,
            "cards": daily_cards,
            "interpretation": {
                "intro": "День начинается тихо.",
                "short_answer": "Утро пройдёт спокойно, к вечеру появится ясность.",
                "advice": "Вечером зажги свечу.",
            },
        },
        [],
        "А что мне сделать сегодня вечером?",
    )
    followup = (follow[0]["content"], follow[1]["content"], 4500)
    card_names = [c["name"] for c in daily_cards]
    return daily, followup, card_names


def score_daily(raw: str, card_names) -> tuple[int, dict]:
    cleaned = strip_emojis(raw)
    parsed = parse_llm_response(cleaned)
    d = {}
    score = 0
    ok_json = (
        isinstance(parsed, dict)
        and parsed.get("intro")
        and parsed.get("short_answer")
        and parsed.get("advice")
        and parsed.get("card_meaning")
    )
    if ok_json:
        score += 40
    sa = (parsed or {}).get("short_answer", "") or ""
    cm = (parsed or {}).get("card_meaning", "")
    cm_len = len(cm) if isinstance(cm, str) else sum(len(x) for x in cm)
    if 150 <= len(sa) <= 800:
        score += 15
    if cm_len >= 200:
        score += 10
    text = cleaned
    cyr = sum(1 for ch in text if "\u0400" <= ch <= "\u04FF")
    ratio = cyr / max(1, len(text))
    if ratio > 0.5:
        score += 10
    if len(cleaned) == len(raw):
        score += 5  # без эмодзи
    low = text.lower()
    if not any(b in low for b in BANNED):
        score += 10
    mentioned = sum(1 for n in card_names if n.lower() in low)
    score += mentioned * 3  # до 9
    d.update(ok_json=ok_json, sa=len(sa), cm=cm_len, cyr=round(ratio, 2), mentioned=mentioned)
    return score, d


def score_followup(raw: str) -> tuple[int, dict]:
    cleaned = strip_emojis(raw)
    parsed = parse_llm_response(cleaned)
    ans = ""
    if isinstance(parsed, dict):
        ans = parsed.get("answer") or parsed.get("short_answer") or ""
        if not ans and parsed.get("intro"):
            ans = cleaned
    score = 0
    if 80 <= len(ans) <= 800:
        score += 50
    elif ans:
        score += 25
    cyr = sum(1 for ch in ans if "\u0400" <= ch <= "\u04FF") / max(1, len(ans))
    if cyr > 0.5:
        score += 20
    if "луна" in ans.lower() or "вечер" in ans.lower():
        score += 15  # отвечает по делу
    if len(cleaned) == len(raw):
        score += 5
    return score, {"ans_len": len(ans), "cyr": round(cyr, 2), "json": bool(ans and parsed)}


async def call(client, model, system, user, max_tokens):
    t0 = time.monotonic()
    r = await client.post(
        ZEN_URL,
        headers={"Authorization": f"Bearer {settings.OPENCODE_ZEN_KEY}"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": 0.8,
        },
        timeout=TIMEOUT,
    )
    dt = time.monotonic() - t0
    r.raise_for_status()
    data = r.json()
    msg = data["choices"][0]["message"]
    content = msg.get("content") or msg.get("reasoning_content") or msg.get("reasoning") or ""
    if not content.strip():
        raise ValueError("empty content")
    usage = data.get("usage", {}) or {}
    return content, dt, usage.get("completion_tokens")


async def bench_model(client, model, daily, followup, card_names):
    out = {"model": model, "daily_s": None, "daily_score": 0, "daily": {},
           "fup_s": None, "fup_score": 0, "fup": {}, "error": None}
    try:
        content, dt, _ = await call(client, model, daily[0], daily[1], daily[2])
        out["daily_s"] = round(dt, 1)
        out["daily_score"], out["daily"] = score_daily(content, card_names)
    except httpx.HTTPStatusError as e:
        body = ""
        try:
            body = e.response.text[:200]
        except Exception:
            pass
        out["error"] = f"daily HTTP {e.response.status_code}: {body}"
        return out
    except Exception as e:
        out["error"] = f"daily: {type(e).__name__}: {str(e)[:100]}"
        return out
    try:
        content, dt, _ = await call(client, model, followup[0], followup[1], followup[2])
        out["fup_s"] = round(dt, 1)
        out["fup_score"], out["fup"] = score_followup(content)
    except Exception as e:
        out["error"] = f"fup: {type(e).__name__}: {str(e)[:80]}"
    return out


async def main():
    daily, followup, card_names = make_prompts()
    sem = asyncio.Semaphore(2)  # бережём free-tier rate limits

    async with httpx.AsyncClient() as client:
        async def run(m):
            async with sem:
                return await bench_model(client, m, daily, followup, card_names)

        results = await asyncio.gather(*[run(m) for m in MODELS])

    results.sort(key=lambda r: -(r["daily_score"] + r["fup_score"]) / max(0.1, (r["daily_s"] or 999) + (r["fup_s"] or 999)))
    print(f"{'model':36} {'daily_s':>7} {'score':>6} | {'fup_s':>6} {'score':>5} | ok_json cyr menc | err")
    for r in results:
        print(
            f"{r['model']:36} {str(r['daily_s']):>7} {r['daily_score']:>6} | "
            f"{str(r['fup_s']):>6} {r['fup_score']:>5} | "
            f"{str(r['daily'].get('ok_json')):>7} {str(r['daily'].get('cyr')):>3} {str(r['daily'].get('mentioned')):>4} | "
            f"{r['error'] or ''}"
        )
    with open("/tmp/zen_bench.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print("\nsaved /tmp/zen_bench.json")


asyncio.run(main())
