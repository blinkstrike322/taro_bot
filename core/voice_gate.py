"""Voice gate: slop-детект + отпечатки голоса + скоринг.

Замеряем голос числом, а не надеждой: каждый ответ LLM проходит скоринг,
слабые уходят на перегенерацию с конкретным указанием, что чинить.
Паттерны шлака — из stop-slop (binary contrasts, throat-clearing,
rhetorical openers, card-talk), адаптированы под русский.
"""
from __future__ import annotations

import difflib
import re

SCORE_PASS = 85
TEMPLATE_RATIO = 0.55

# ── Глобальный шлак (для всех проводников) ──────────────────────────
# Каждый паттерн: (код, штраф, строка починки для repair-инструкции).

_SLOP_PATTERNS: list[tuple[str, re.Pattern, int, str]] = [
    (
        "contrast-eto",
        re.compile(r"это не [^.?!…]{1,60}?,?\s+а\b", re.IGNORECASE),
        12,
        "Убери конструкцию «это не X, а Y» — утверждай прямо, без отрицания.",
    ),
    (
        "contrast-vopros",
        re.compile(r"вопрос не в том", re.IGNORECASE),
        12,
        "Убери «вопрос не в том..., а в том...» — скажи суть одним утверждением.",
    ),
    (
        "contrast-delo",
        re.compile(r"дело не в [^.?!…]{1,50}?,?\s+а\b", re.IGNORECASE),
        12,
        "Убери «дело не в X, а в Y» — начни сразу с Y.",
    ),
    (
        "throat",
        re.compile(
            r"дело в том, что|стоит отметить|на самом деле|правда в том, что|"
            r"как известно|в конце концов|важно понимать|следует отметить|"
            r"скорость [а-яё]+ (высок|низк)|согласно [а-яё]+|"
            r"система (заметила|видит|подсказывает)",
            re.IGNORECASE,
        ),
        8,
        "Вырежи слова-паразиты («дело в том, что», «на самом деле» и т.п.).",
    ),
    (
        "card-talk",
        re.compile(
            r"в контексте|означает|символизирует|\bаркан\b|трактовка:|"
            r"(говор(ит|ят) о|указыва|вед[её]т к тому|показыва|фиксиру)|"
            r"это карта [а-я]|в прямом положении",
            re.IGNORECASE,
        ),
        10,
        "Не говори как учебник («карта говорит/указывает», «в контексте») — говори по смыслу.",
    ),
    (
        "contrast-ane",
        re.compile(r"\sа не \w", re.IGNORECASE),
        12,
        "Убери «..., а не ...» — утверждай прямо, без противопоставления.",
    ),
]

_RHET_OPENER_PENALTY = 10
_RHET_OPENER_REPAIR = "Не начинай ответ с вопроса — начни с утверждения."
_RHET_OPENER_RE = re.compile(r"^[^.!?…\n]*\?")

# Глобально зашаблоненное слово: собственная находка модели на вопросы
# про отношения — все три проводника независимо упали в одну метафору.
_GLOBAL_BANNED: list[str] = ["нит"]
_GLOBAL_BANNED_PENALTY = 10
_GLOBAL_BANNED_CAP = 20

# ── Чужой лексикон (подпись другого проводника — табу) ─────────────
_GUIDE_BANNED: dict[str, list[str]] = {
    "shadow_walker": ["камен", "фундамент", "стен", "мост"],
    "ruin_keeper": ["туман", "лун", "мох", "ш[её]пот", "шепч", "тен", "свеч",
                  "пожар", "плам"],
    "spark_of_chaos": [
        "туман", "нит", "тен", "лун", "мох", "ш[её]пот", "шепч", "свеч",
        "камен", "фундамент", "стен", "мост",
    ],
}
_LEXICON_PENALTY = 10
_LEXICON_CAP = 30

# ── Отпечатки (обязательные маркеры голоса) ─────────────────────────
_SHADOW_SENSORY = [
    "туман", "тен", "лун", "мох", "ш[её]пот", "свет",
    "лес", "ноч", "свеч", "вод", "зеркал", "сон",
]


def _sentences(text: str) -> list[str]:
    parts = re.split(r"[.!?…]+\s*|\n+", text)
    return [p.strip() for p in parts if p.strip()]


def _word_count(sentence: str) -> int:
    return len(sentence.split())


def _stem_hits(text: str, stems: list[str]) -> list[str]:
    hits = []
    for stem in stems:
        if re.search(r"\b" + stem + r"\w*", text, re.IGNORECASE):
            hits.append(stem)
    return hits


def _iter_prose_fields(interp: dict) -> list[str]:
    """Все прозаические поля интерпретации одной строкой для проверок."""
    chunks = []
    for key in ("intro", "short_answer", "advice", "связь_карт",
                "проявление", "на_что_смотреть"):
        val = interp.get(key)
        if isinstance(val, str) and val.strip():
            chunks.append(val)
    позиции = interp.get("позиции")
    if isinstance(позиции, list):
        for item in позиции:
            if isinstance(item, dict):
                t = item.get("трактовка")
                if isinstance(t, str) and t.strip():
                    chunks.append(t)
    meaning = interp.get("card_meaning")
    if isinstance(meaning, list):
        chunks.extend(m for m in meaning if isinstance(m, str) and m.strip())
    elif isinstance(meaning, str) and meaning.strip():
        chunks.append(meaning)
    return chunks


PROMPT_SLOP_BAN = (
    "Запрещённые приёмы (типовые LLM-шаблоны — никогда не используй):\n"
    "• конструкции «это не X, а Y», «вопрос не в том..., а в том...», "
    "«дело не в X, а в Y» — утверждай прямо, без отрицания;\n"
    "• заход вопросом; фразы «дело в том, что», «на самом деле», "
    "«в контексте», «карта говорит/указывает/ведёт/показывает», «это карта X», "
    "«..., а не ...» после запятой; не читай лекцию о карте — говори с человеком."
)


_DISPLAY_WORD = {"ш[её]пот": "шёпот", "шепч": "шепчут/шепчет"}


def prompt_banned_words(guide_id: str) -> str:
    """Чужие слова для промпта: корни подписи других проводников + глобальные."""
    words = list(_GUIDE_BANNED.get(guide_id, []))
    for stem in _GLOBAL_BANNED:
        if stem not in words:
            words.append(stem)
    if not words:
        return ""
    return (
        "Чужие слова (лексикон других проводников — никогда не используй "
        "слова с этими корнями, придумай свои образы): "
        + ", ".join(f"«{_DISPLAY_WORD.get(w, w)}»" for w in words)
        + ". Образы из примеров ниже НЕ копируй дословно."
    )


_LATIN_WORD = re.compile(r"\b[A-Za-z]{3,}\b")


def find_latin(prose: str) -> list[str]:
    """Латиница в прозе (дубль LATIN_WORD из core.llm — voice_gate не импортирует llm)."""
    return sorted(set(_LATIN_WORD.findall(prose)))


def has_rhet_opener(intro: str) -> bool:
    """Заход вопросом: первое предложение интро — вопрос (не вопрос в конце)."""
    return bool(intro and _RHET_OPENER_RE.search(intro.strip()))


def find_slop(text: str) -> list[tuple[str, str]]:
    """Найти шлак-паттерны. Возвращает [(код, строка_починки)]."""
    found = []
    for code, pattern, _penalty, repair in _SLOP_PATTERNS:
        if pattern.search(text):
            found.append((code, repair))
    return found


def check_lexicon(text: str, guide_id: str) -> list[tuple[str, int, str]]:
    """Чужой лексикон + глобальные шаблоны. Возвращает [(слово, штраф, починка)]."""
    hits = []
    guide_stems = set(_GUIDE_BANNED.get(guide_id, []))
    for stem in guide_stems:
        if re.search(r"\b" + stem + r"\w*", text, re.IGNORECASE):
            hits.append((stem, _LEXICON_PENALTY,
                         f"Слово с корнем «{stem}» — из чужого словаря, не твоего."))
    for stem in _GLOBAL_BANNED:
        if stem in guide_stems:
            continue
        for _m in re.finditer(r"\b" + stem + r"\w*", text, re.IGNORECASE):
            hits.append((stem, _GLOBAL_BANNED_PENALTY,
                         "Убери образ нити — это заезженный шаблон, придумай свой."))
    return hits


def check_fingerprint(interp: dict, guide_id: str) -> list[tuple[str, int, str]]:
    """Обязательные маркеры голоса. Возвращает [(код, штраф, починка)]."""
    missing = []
    short = str(interp.get("short_answer") or "")
    intro = str(interp.get("intro") or "")
    advice = str(interp.get("advice") or "")

    if guide_id == "ruin_keeper":
        sents = _sentences(short)
        if sents:
            avg = sum(_word_count(s) for s in sents) / len(sents)
            if avg > 18:
                missing.append(("keeper-verbose", 10,
                                "Короче: фразы должны быть каменными, не растекайся."))
        if len(_sentences(advice)) > 2:
            missing.append(("keeper-long-advice", 6,
                            "Совет — максимум два коротких предложения."))
    elif guide_id == "spark_of_chaos":
        head = f"{intro} {short}"
        game_hits = len(re.findall(r"\bигр\w*", head, re.IGNORECASE))
        if game_hits >= 3:
            missing.append(("spark-game-spam", 10,
                            f"Слово «игра» повторено {game_hits} раза — "
                            "одного называния за ответ достаточно."))
        if not any(_word_count(s) <= 8 for s in _sentences(head)):
            missing.append(("spark-no-staccato", 10,
                            "Добавь хоть одну короткую хлёсткую фразу."))
        if "?" not in head and "!" not in f"{head} {advice}":
            missing.append(("spark-no-fire", 8,
                            "Где огонь? Хотя бы один вопрос в лоб или восклицание."))
    elif guide_id == "shadow_walker":
        head = f"{intro} {short}"
        if not _stem_hits(head, _SHADOW_SENSORY):
            missing.append(("shadow-no-sense", 10,
                            "Добавь хоть один чувственный образ (свет, туман, лес, ночь)."))
        for stem in ("лун", "туман"):
            count = len(re.findall(r"\b" + stem + r"\w*", head, re.IGNORECASE))
            if count >= 3:
                missing.append(("shadow-image-spam", 10,
                                f"Образ с корнем «{stem}» повторён {count} раза — "
                                "возьми соль, зеркало или окно вместо него."))
                break
    return missing


def check_template(intro: str, avoid_texts: list[str] | None) -> list[tuple[str, int, str]]:
    """Схожесть захода с недавними ответами (память против шаблонов)."""
    if not intro or not avoid_texts:
        return []
    for frag in avoid_texts:
        if frag and frag.strip():
            ratio = difflib.SequenceMatcher(
                None, intro.strip().lower(), frag.strip().lower()).ratio()
            if ratio > TEMPLATE_RATIO:
                return [("template-repeat", 15,
                         "Этот заход уже был недавно — зайди с другой стороны.")]
    return []


def _slop_penalty(prose: str) -> tuple[int, list[str]]:
    """Штраф за шлак с учётом повторов: каждое вхождение бьёт, потолок x2."""
    total = 0
    reasons: list[str] = []
    for code, pattern, penalty, _repair in _SLOP_PATTERNS:
        hits = len(pattern.findall(prose))
        if hits:
            total += min(hits, 2) * penalty
            reasons.append(code)
    return total, reasons


def score_interpretation(
    interp: dict,
    guide_id: str,
    avoid_texts: list[str] | None = None,
) -> tuple[int, list[str]]:
    """Скоринг ответа. Возвращает (баллы 0–100, причины списком кодов)."""
    score = 100
    reasons: list[str] = []
    prose = "\n".join(_iter_prose_fields(interp))

    slop_penalty, slop_reasons = _slop_penalty(prose)
    score -= slop_penalty
    reasons.extend(slop_reasons)

    intro = str(interp.get("intro") or "").strip()
    if has_rhet_opener(intro):
        score -= _RHET_OPENER_PENALTY
        reasons.append("rhet-opener")

    latin = find_latin(prose)
    if latin:
        score -= 12
        reasons.append("latin-leak")

    lex_hits = check_lexicon(prose, guide_id)
    lex_total = 0
    for stem, penalty, _repair in lex_hits:
        if lex_total + penalty > _LEXICON_CAP + _GLOBAL_BANNED_CAP:
            break
        lex_total += penalty
        reasons.append(f"lexicon:{stem}")
    score -= lex_total

    for code, penalty, _repair in check_fingerprint(interp, guide_id):
        score -= penalty
        reasons.append(code)

    for code, penalty, _repair in check_template(intro, avoid_texts):
        score -= penalty
        reasons.append(code)

    return max(score, 0), reasons


def score_example(intro: str, advice: str, guide_id: str) -> tuple[int, list[str]]:
    """Облегчённый скоринг few-shot примера (догфуд: примеры сами чистые)."""
    text = f"{intro} {advice}"
    score = 100
    slop_penalty, slop_reasons = _slop_penalty(text)
    score -= slop_penalty
    reasons: list[str] = slop_reasons
    if has_rhet_opener(intro):
        score -= _RHET_OPENER_PENALTY
        reasons.append("rhet-opener")
    lex_total = 0
    for stem, penalty, _repair in check_lexicon(text, guide_id):
        if lex_total + penalty > _LEXICON_CAP + _GLOBAL_BANNED_CAP:
            break
        lex_total += penalty
        reasons.append(f"lexicon:{stem}")
    score -= lex_total
    return max(score, 0), reasons


_REPAIR_BY_CODE: dict[str, str] = {
    code: repair for code, _r, _p, repair in _SLOP_PATTERNS
}
_REPAIR_BY_CODE.update({
    "rhet-opener": _RHET_OPENER_REPAIR,
    "latin-leak": "Только русские слова — убери латиницу, перефразируй по-русски.",
    "template-repeat": "Этот заход уже был недавно — зайди с другой стороны.",
    "keeper-verbose": "Короче: фразы должны быть каменными, не растекайся.",
    "keeper-long-advice": "Совет — максимум два коротких предложения.",
    "spark-no-staccato": "Добавь хоть одну короткую хлёсткую фразу.",
    "spark-no-fire": "Где огонь? Хотя бы один вопрос в лоб или восклицание.",
    "shadow-no-sense": "Добавь хоть один чувственный образ (свет, туман, лес, ночь).",
    "shadow-image-spam": "Один образ заспамлен — замени повторы другими из словаря.",
    "spark-game-spam": "Слово «игра» заспамлено — одного называния за ответ достаточно.",
})


def build_repair_note(reasons: list[str]) -> str:
    """Инструкция починки для следующей попытки (конкретно, без воды)."""
    lines = ["Твоя прошлая попытка отклонена. Причины:"]
    seen: set[str] = set()
    for reason in reasons:
        code = reason.split(":")[0]
        if code in seen:
            continue
        seen.add(code)
        if code == "lexicon":
            stem = reason.split(":", 1)[1]
            lines.append(f"• Слово с корнем «{stem}» — из чужого словаря, убери.")
        else:
            lines.append(f"• {_REPAIR_BY_CODE.get(code, code)}")
    lines.append("Перепиши ответ, устранив каждую причину. Схему JSON сохрани.")
    return "\n".join(lines)
