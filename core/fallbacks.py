# core/fallbacks.py — детерминированные фолбэки ask/pair/forecast.
# Тексты строятся из data/cards.json значений + голосовых полей characters.json.
# Порт локальных фолбэков SNAP3: src/app/api/ask/route.ts (localFallback /
# localPairFallback) и src/server/prompts.ts (localDayForecast); санкция
# ответа LLM — sanitize_llm_text.
from __future__ import annotations

import re

from core.llm import _extract_json, strip_emojis
from core.prompts import _card_meaning_text, _is_upright, _load_characters, pair_bridge_phrase

# ── Санитизация ответа LLM ────────────────────────────────────────
# Срез markdown-заборов (в т.ч. ```json) с сохранением содержимого,
# как в SNAP3 ask/route.ts: .replace(/```[a-z]*\s*([\s\S]*?)```/g, '$1').
_FENCE_BLOCK_RE = re.compile(r"```[a-z]*[ \t]*\n?([\s\S]*?)```", re.IGNORECASE)
# Незакрытый забор (модель обрезалась) — срезаем маркер целиком.
_FENCE_OPEN_RE = re.compile(r"```[a-z]*[ \t]*\n?", re.IGNORECASE)
_MULTI_NL_RE = re.compile(r"\n{3,}")

_DEFAULT_INTRO = "Карты раскрывают свои тайны..."
_DEFAULT_ADVICE = "Обдумай значение карт в контексте своего вопроса."


def sanitize_llm_text(text: str) -> str:
    """Чистка ответа LLM: срез ```-заборов (в т.ч. ```json), эмодзи, \\n{3,}, trim."""
    if not isinstance(text, str):
        return ""
    text = _FENCE_BLOCK_RE.sub(r"\1", text)
    text = _FENCE_OPEN_RE.sub("", text)
    text = strip_emojis(text)
    text = _MULTI_NL_RE.sub("\n\n", text)
    return text.strip()


# ── Срез ризонинга модели ─────────────────────────────────────────
# Reasoning-модели иногда пишут в ответ планирование и самопроверку
# («Мне нужно…», «Проверю: 4 предложения…») — русский аналогов _LEAK_RE
# из core/llm.py не ловит. Паттерн утечки из боя:
# [рассуждение] Напишу: <ответ> Проверю: <самопроверка> [правила].
_RU_REASONING_RE = re.compile(
    r"(Проверю\b|Мне нужно\b|пользователь спрашивает|запрещённ\w+ слов\w+|"
    r"правила запрещают|Не повторять|Не перечислять|Не начинать с|самопроверк\w*)"
)
_ANSWER_ANNOUNCE_RE = re.compile(r"Напишу\s*:\s*")
_MIN_ANSWER_LEN = 20

# ── Англоязычный chain-of-thought в ответе (бой 09.10.2026) ──────
# Reasoning-модели иногда отдают планирование целиком на английском
# («Let me analyze…», «The user provides…», «I need to respond as…»):
# русские маркеры выше его не ловят, и мусор уходил пользователям
# month/arcana-потоков как «готовый ответ». Легитимные ответы — строго
# русские (терминал, lowercase), английских planning-оборотов в них нет,
# поэтому срез по первому маркеру безопасен: голова без маркеров —
# ответ (хвостовые самопроверки), иначе — мусор целиком в retry/fallback.
_EN_COT_RE = re.compile(
    r"(\blet me\s|\bi need to\b|\bwe need\b|\bthe user\b|"
    r"\bi(['’]ll| will)\s+(draft|respond|write|connect|answer)\b|"
    r"\bwait,\s*let me\b|\bpersona\b|\btrickster\b|\bkey points\b|"
    r"\bmy (draft|final)\b|\bfinal (line|answer)\b)",
    re.IGNORECASE,
)


def _strip_en_cot(text: str) -> str:
    """Отрезать английский CoT: голова до первого маркера — кандидат
    в ответ; маркер в начале (дамп целиком) — пусто в retry/fallback."""
    cut = _EN_COT_RE.search(text)
    if not cut:
        return text
    head = text[:cut.start()].strip()
    if (
        len(head) >= _MIN_ANSWER_LEN
        and not _RU_REASONING_RE.search(head)
        and not _EN_COT_RE.search(head)
    ):
        return head
    return ""


def strip_reasoning_dump(text: str) -> str:
    """Отрезать ризонинг, оставить готовый ответ; ответа под мусором нет — «»."""
    if not text or not _RU_REASONING_RE.search(text):
        return text if isinstance(text, str) else ""
    announced = _ANSWER_ANNOUNCE_RE.search(text)
    if announced:
        candidate = text[announced.end():]
        cut = _RU_REASONING_RE.search(candidate)
        if cut:
            candidate = candidate[:cut.start()]
        candidate = candidate.strip()
        if len(candidate) >= _MIN_ANSWER_LEN and not _RU_REASONING_RE.search(candidate):
            return candidate
    lines = text.splitlines()
    last_marker = max(
        (i for i, line in enumerate(lines) if _RU_REASONING_RE.search(line)),
        default=-1,
    )
    candidate = "\n".join(lines[last_marker + 1:]).strip()
    if len(candidate) >= _MIN_ANSWER_LEN and not _RU_REASONING_RE.search(candidate):
        return candidate
    return ""


def clean_llm_answer(text: str) -> str:
    """Полная чистка прозы LLM: sanitize + срез ризонинга (RU + EN CoT)."""
    return _strip_en_cot(strip_reasoning_dump(sanitize_llm_text(text)))


# ── Голос проводника для фолбэков ────────────────────────────────
def _voice(character_id: str | None) -> dict:
    characters = _load_characters()
    return characters.get(character_id or "", characters.get("shadow_walker", {}))


# ── Фолбэк одиночного вопроса: ответ из значений карты голосом проводника ──
def local_followup_fallback(card: dict, ctx: dict) -> str:
    ch = _voice(ctx.get("character_id"))
    upright = _is_upright(card)
    base = _card_meaning_text(card)
    orient = (
        "в прямом положении — в полный голос"
        if upright
        else "перевёрнутая — энергия уходит внутрь, наружу выйдет не сразу"
    )
    return (
        f"{ch.get('fallback_intro', _DEFAULT_INTRO)} Про {card.get('name', '')}: "
        f"карта легла {orient}. "
        f"Смотри на неё через свой вопрос и через то, что уже сказали остальные: "
        f"{base.lower()}. "
        f"{ch.get('fallback_advice', _DEFAULT_ADVICE)}"
    )


# ── Фолбэк парного вопроса: формула связи из значений обеих карт ──
def local_pair_fallback(card_a: dict, card_b: dict, ctx: dict) -> str:
    ch = _voice(ctx.get("character_id"))
    ma = _card_meaning_text(card_a).lower()
    mb = _card_meaning_text(card_b).lower()
    bridge = pair_bridge_phrase(card_a, card_b)
    return (
        f"{ch.get('fallback_intro', _DEFAULT_INTRO)} "
        f"Пара «{card_a.get('name', '')}» и «{card_b.get('name', '')}»: {bridge}. "
        f"Первая держит {ma}. Вторая отвечает: {mb}. "
        f"Твой вопрос — про связь, и ответ лежит между ними: смотри, где одна "
        f"поддерживает, а где гасит. "
        f"{ch.get('fallback_advice', _DEFAULT_ADVICE)}"
    )


# ── Локальный фолбэк прогноза: из значений карты, без LLM ─────────
def local_day_forecast(card: dict) -> dict:
    upright = _is_upright(card)
    base = _card_meaning_text(card)
    # числа от номера аркана (порт SNAP3: seed = (number ?? 3) + (upright ? 0 : 5))
    number = card.get("number")
    seed = (number if number is not None else 3) + (0 if upright else 5)
    first_sentence = re.split(r"[.!?]", base)[0].strip().lower() if base else ""
    return {
        "лозунг": "день идёт тебе навстречу" if upright else "день просит медленного шага",
        "утро": (
            "Не разгоняйся сразу: дай карте дня минуту — она задаёт тон лучше будильника."
            if upright
            else "Утро начнётся с лёгкого тумана — это карта дня уходит внутрь, наружу выйдет позже."
        ),
        "день": (
            f"Главный сюжет дня: {first_sentence}. Смотри, где это проявится "
            f"в разговорах и мелких решениях."
        ),
        "вечер": (
            "Вечером сведи баланс: что из задуманного реально вышло — то и есть ответ карты."
            if upright
            else "К вечеру станет тише — и в этой тишине будет понятнее, что карта дня имела в виду."
        ),
        "фокус": "сделать один шаг вместо десяти",
        "тонус": max(2, min(10, seed)),
        "удача": max(2, min(10, 10 - seed + 2)),
        "общение": max(2, min(10, seed + (2 if upright else -1))),
        "глоток": (
            "запиши одну фразу изо всех разговоров дня — она окажется важнее остальных"
            if upright
            else "выйди на пять минут туда, где тихо, и не бери телефон"
        ),
    }


# ── Дайджесты недели/месяца: чистка полей (порт SNAP3-валидации) ──
def _validate_counts(raw: object, max_items: int = 8) -> dict[str, int]:
    """map имя→число: ключи-строки ≤60 симв, значения clamp 0–999,
    сортировка по убыванию, топ max_items. Мусорные ключи/значения — долой."""
    if not isinstance(raw, dict):
        return {}
    items: list[tuple[str, int]] = []
    for key, value in raw.items():
        k = str(key).strip()[:60]
        if not k or isinstance(value, bool):
            continue
        try:
            n = int(value)
        except (TypeError, ValueError):
            continue
        items.append((k, max(0, min(999, n))))
    items.sort(key=lambda item: (-item[1], item[0]))
    return dict(items[:max_items])


def _clean_questions(raw: object, max: int = 5, max_len: int = 80) -> list[str]:
    """Список вопросов оператора: строки ≤max_len симв, максимум max штук."""
    if not isinstance(raw, (list, tuple)):
        return []
    out: list[str] = []
    for q in raw:
        if not isinstance(q, str):
            continue
        q = q.strip()[:max_len]
        if q:
            out.append(q)
        if len(out) >= max:
            break
    return out


def _times_ru(n: int) -> str:
    """Русское «раз/раза»: 1 раз, 4 раза, 5 раз, 11 раз."""
    if n % 100 in (11, 12, 13, 14):
        return "раз"
    if n % 10 == 1:
        return "раз"
    if n % 10 in (2, 3, 4):
        return "раза"
    return "раз"


def _top_card(digest: dict) -> tuple[str, int] | None:
    """Топ-карта дайджеста (имя, выпадений) — из уже чистого card_counts."""
    counts = _validate_counts(digest.get("card_counts")) if isinstance(digest, dict) else {}
    if not counts:
        return None
    name = next(iter(counts))
    return name, counts[name]


# ── Детерминированные фолбэки дайджестов: из топ-карты ────────────
def local_week_reflection(digest: dict) -> str:
    top = _top_card(digest)
    if top:
        name, count = top
        return (
            f"неделя прошла под знаком «{name}» — она выпала {count} {_times_ru(count)}, "
            f"и колода не стала прятать главное: смотри, где эта карта звучала в твоих "
            f"решениях, она и есть ответ недели. что спросишь у колоды завтра?"
        )
    return (
        "неделя рассыпала знаки ровно, без одного громкого имени — колода говорила "
        "тихо и разными голосами. вернись к дню, который помнишь ярче остальных: "
        "там и лежит ответ. что спросишь у колоды завтра?"
    )


def local_month_reflection(digest: dict) -> str:
    top = _top_card(digest)
    if top:
        name, count = top
        return (
            f"месяц прошёл под знаком «{name}» — она выпала {count} {_times_ru(count)}, "
            f"держала весь сюжет в своих руках: колода повторяла один урок разными "
            f"словами, и к концу месяца он стал громче. что спросишь у колоды в "
            f"следующем месяце?"
        )
    return (
        "месяц прошёл без одной главной карты — колода говорила хором, тихо и "
        "разными голосами. самый громкий день месяца подскажет, где жил настоящий "
        "сюжет. что спросишь у колоды в следующем месяце?"
    )


# ── Строгий парс JSON-прогноза ────────────────────────────────────
# Прогноз НЕ проходит через validate_interpretation (урок T7): только
# строгий экстрактор JSON + обязательные 9 ключей.
_FORECAST_STR_KEYS = ("лозунг", "утро", "день", "вечер", "фокус", "глоток")
_FORECAST_INT_KEYS = ("тонус", "удача", "общение")


def _clamp_scale(value: object) -> int:
    """Шкала 0–10 (порт SNAP3 clampScale): число → round+clamp, строка → int, мусор → 5."""
    if value is None or isinstance(value, bool):
        return 5
    if isinstance(value, (int, float)):
        n = value
    else:
        try:
            n = int(str(value).strip())
        except (ValueError, TypeError):
            return 5
    return max(0, min(10, round(n)))


def parse_forecast(raw: str) -> dict | None:
    """Санитизация ответа LLM в прогноз дня; None — если схема не сошлась.

    Все 9 ключей обязательны: строки непустые (эмодзи срезаются, кап 400
    символов как в SNAP3 strField), шкалы зажимаются 0–10.
    """
    data = _extract_json(raw)
    if not isinstance(data, dict):
        return None
    forecast: dict = {}
    for key in _FORECAST_STR_KEYS:
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            return None
        forecast[key] = strip_emojis(value).strip()[:400]
    for key in _FORECAST_INT_KEYS:
        forecast[key] = _clamp_scale(data.get(key))
    return forecast
