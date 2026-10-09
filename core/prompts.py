from __future__ import annotations

import json
import random
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

from core.voice_gate import PROMPT_SLOP_BAN, prompt_banned_words

_CHARACTERS_PATH = Path(__file__).resolve().parent.parent / "data" / "characters.json"

_characters_cache: dict[str, dict] | None = None


def _load_characters() -> dict[str, dict]:
    global _characters_cache
    if _characters_cache is None:
        with open(_CHARACTERS_PATH, encoding="utf-8") as f:
            raw: list[dict] = json.load(f)
        _characters_cache = {ch["id"]: ch for ch in raw}
    return _characters_cache


# ── Ротация голосового пула (in-memory, per-guide) ──────────────────────
# На запрос сэмплируем 2 примера из voice_pool, исключая использованные
# в последних N запросах. Бот однопроцессный; после рестарта очередь пуста —
# деградация к случайным двум, не поломка. random.sample против глобального
# RNG: при random.seed(x) выбор детерминирован (на это опираются тесты).
_VOICE_POOL_SIZE = 2
_VOICE_RECENT_LIMIT = 3
_recent_voice: dict[str, deque[int]] = defaultdict(deque)


def sample_voice_pool(character_id: str, n: int = _VOICE_POOL_SIZE) -> list[dict]:
    """Сэмплировать n примеров голоса из voice_pool, исключая недавние.

    Indices последних использованных примеров помнятся в пер-guide deque:
    они не выпадают повторно, пока не «вымыты» из окна. Возвращает список
    примеров (dict с 'question'/'intro'/'advice').
    """
    characters = _load_characters()
    pool = characters.get(character_id, {}).get("voice_pool", [])
    if not pool:
        return []

    recent = _recent_voice[character_id]
    recent_idx = set(recent)
    candidates = [i for i in range(len(pool)) if i not in recent_idx]
    if len(candidates) < n:
        candidates = list(range(len(pool)))

    chosen = random.sample(candidates, min(n, len(candidates)))
    for i in chosen:
        recent.append(i)
    while len(recent) > _VOICE_RECENT_LIMIT:
        recent.popleft()
    return [pool[i] for i in chosen]


def _format_voice_examples(examples: list[dict]) -> str:
    """Отрендерить примеры голоса в блок для system prompt."""
    if not examples:
        return ""
    lines = ["Примеры правильного голоса проводника (как ты говоришь):"]
    for ex in examples:
        question = ex.get("question", "")
        intro = ex.get("intro", "")
        advice = ex.get("advice", "")
        lines.append(f"— Вопрос «{question}»: интро «{intro}», совет «{advice}»")
    return "\n".join(lines)


def _format_avoid_texts(avoid_texts: list[str] | None) -> str:
    """Блок «НЕ повторяй того, что уже говорил» (память о прошлых чтениях)."""
    if not avoid_texts:
        return ""
    capped = avoid_texts[:8]  # потолок вставляемых фрагментов, чтобы не раздуть токены
    lines = [
        "Ниже — фразы из твоих НЕДАВНИХ ответов этому человеку. "
        "Не повторяй их и не возвращайся к тем же образам: один и тот же образ "
        "дважды подряд — признак того, что ты застряла. Выбери образ, к которому "
        "давно не тянулась рука, и скажи то же самое по-другому:"
    ]
    for frag in capped:
        if frag and frag.strip():
            lines.append(f"• {frag.strip()}")
    return "\n".join(lines)


_BLOCK_SEP = "\n\n"

# ═══════════════════════════════════════════════════════════════════════
# ARCANUM v3: ремесло толкования и глобальные правила ответа.
# Тексты перенесены ДОСЛОВНО из SNAP3 src/server/prompts.ts
# (REMESLO_BLOCK / SLOP_BAN / NO_EMOJI_RULE / NO_LATIN_RULE).
# ═══════════════════════════════════════════════════════════════════════

_REMESLO_BLOCK = (
    "ТЫ ТАРОЛОГ-ПРАКТИК. Десять приёмов ремесла — применяй их, не называя их:\n"
    "\n"
    "1. ПОЗИЦИЯ ФИЛЬТРУЕТ КАРТУ. Значение карты всегда пропускается сквозь позицию: "
    "Четвёрка Кубков в позиции «препятствие» — это не «скука вообще», а то, как "
    "пресыщение блокирует именно этот вопрос.\n"
    "2. КАРТЫ ГОВОРЯТ ПАРАМИ. Читай соседние карты как уточнение: вторая карта отвечает "
    "на первую или спорит с ней. Сначала посмотри на пару — потом делай вывод.\n"
    "3. СТИХИИ РЯДОМ ВЗАИМОДЕЙСТВУЮТ. Жезлы — огонь, Кубки — вода, Мечи — воздух, "
    "Пентакли — земля. Одна стихия рядом — усиление. Огонь+воздух и вода+земля — "
    "поддержка. Огонь+вода и воздух+земля — гашение, конфликт. Используй это как "
    "погоду в паре карт.\n"
    "4. ПОВТОР — ТЕМА. Если в раскладе повторяется число (две Пятёрки), стихия "
    "(три Меча) или масть — назови это вслух одной фразой: колода настаивает.\n"
    "5. МАЖОРЫ — ВЕС. Много старших арканов = сюжет крупнее воли человека, его "
    "не «решить» усилием. Много младших = ситуация из мелких поддающихся деталей.\n"
    "6. ПРИДВОРНЫЕ КАРТЫ — ЛЮДИ ИЛИ РОЛИ. Пажи — новости/начатки, Рыцари — движение, "
    "Королевы — зрелая опека, Короли — власть и правила. Скажи, кто это в ситуации "
    "спрашивающего или какая его роль просится наружу.\n"
    "7. ПЕРЕВЁРНУТАЯ КАРТА — НЕ «ПЛОХО». Это энергия заблокированная, направленная "
    "внутрь или ещё не проявившаяся. Иногда — чрезмерность прямого смысла. Никогда "
    "не читай реверс как наказание.\n"
    "8. ИСХОД — ТРАЕКТОРИЯ, НЕ ПРИГОВОР. Позиция исхода показывает, куда ведёт текущая "
    "линия. Совет меняет линию — скажи об этом, если карты дают такой рычаг.\n"
    "9. ОДИН РАССКАЗ. Расклад — не конспект, а один рассказ из глав. Каждая позиция — "
    "глава; между главами есть связки («потому», «несмотря на», «тем временем»). "
    "Прочитай вслух связки — это и есть живое чтение.\n"
    "10. ВОПРОС МЕНЯЕТ КАРТУ. Одна и та же карта на вопрос «уйти или остаться» и "
    "«что он чувствует» — читается по-разному. Держи вопрос перед глазами всю дорогу."
)

_SLOP_BAN = (
    "ЗАПРЕЩЕНО (маркеры ИИ-шаблонов):\n"
    "• «Эта карта означает/говорит/показывает» — не начинай так и не вставляй\n"
    "• «В контексте вашего вопроса», «стоит отметить», «важно понимать», "
    "«не стоит забывать»\n"
    "• перечисление всех значений карты из справочника\n"
    "• «сочетание энергий», «уникальный посыл», «карта приглашает вас»\n"
    "• строй «во-первых/во-вторых/в-третьих» + итог-вывод\n"
    "• обесценивающие дисклеймеры («таро не наука, но…»)\n"
    "• дублирование одного тезиса в разных полях — каждое поле говорит своё"
)

_NO_EMOJI_RULE = (
    "ЭМОДЗИ СТРОГО ЗАПРЕЩЕНЫ в любом месте ответа. Ни одного. Только кириллический текст."
)

# Утечка ризонинга в бою — парный пост-фильтр: strip_reasoning_dump в core/fallbacks.py.
_ANSWER_DISCIPLINE = (
    "В ответ уходи СРАЗУ готовым текстом ответа: без планирования вслух, "
    "без самопроверки, без служебных заметок о правилах и без мета-комментариев. "
    "Никаких «Мне нужно», «Проверю», «Напишу» — только сама речь проводника."
)

_NO_LATIN_RULE = (
    "ЯЗЫК: весь ответ — ТОЛЬКО на русском. Латинские слова 3+ буквы в прозе запрещены.\n"
    "ИСКЛЮЧЕНИЕ — КЛЮЧИ JSON (intro, short_answer, card_meaning, advice, позиции, карта, "
    "реверс, трактовка, связь_карт, проявление, на_что_смотреть, траектория, утро, день, "
    "вечер) — фиксированные идентификаторы схемы, их НЕ переводить и НЕ менять. "
    "Переводить можно только значения."
)

# стихии мастей (соответствия Golden Dawn) — для карточных строк и погоды пары
_SUIT_RU: dict[str, str] = {
    "wands": "огонь · жезлы",
    "cups": "вода · кубки",
    "swords": "воздух · мечи",
    "pentacles": "земля · пентакли",
}

_SUIT_ELEMENT: dict[str, str] = {
    "wands": "огонь",
    "cups": "вода",
    "swords": "воздух",
    "pentacles": "земля",
}

_WEEKDAY_RU = [
    "понедельник", "вторник", "среда", "четверг",
    "пятница", "суббота", "воскресенье",
]

_MONTH_GEN_RU = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]


def get_system_prompt(
    character_id: str,
    avoid_texts: list[str] | None = None,
    voice_examples: list[dict] | None = None,
) -> str:
    """Return the system prompt for the given character.

    Args:
        character_id: One of 'shadow_walker', 'ruin_keeper', 'spark_of_chaos'.

    Returns:
        The full system prompt string.

    Raises:
        KeyError: If character_id is not found.
    """
    characters = _load_characters()
    if character_id not in characters:
        raise KeyError(
            f"Unknown character_id '{character_id}'. "
            f"Available: {', '.join(characters)}"
        )
    ch = characters[character_id]
    base_prompt = _build_voice_core(character_id, ch)
    if voice_examples is None:
        voice_examples = sample_voice_pool(character_id)
    parts = [
        base_prompt,
        _REMESLO_BLOCK,
        _SLOP_BAN,
        _format_avoid_texts(avoid_texts),
        _format_voice_examples(voice_examples),
        _NO_EMOJI_RULE,
        _NO_LATIN_RULE,
        _ANSWER_DISCIPLINE,
    ]
    return _BLOCK_SEP.join(p for p in parts if p)


def _build_voice_core(character_id: str, ch: dict) -> str:
    """Голосовое ядро: persona + diction + rhythm + stance + lens + taboo + bans."""
    parts = [ch.get("persona", "").strip()]

    diction = ch.get("diction") or {}
    if diction:
        lines = ["Твой словарь образов — бери экономно, по одному-два на повод, не набивая ими текст:"]
        imagery = diction.get("imagery") or []
        if imagery:
            lines.append(f"• образы, из которых ты выбираешь: {', '.join(imagery)}")
        anti = diction.get("anti") or []
        if anti:
            lines.append(f"• не твой звук: {', '.join(anti)}")
        parts.append("\n".join(lines))

    rhythm = ch.get("rhythm")
    if rhythm:
        parts.append(f"Ритм речи: {rhythm}")

    stance = ch.get("stance")
    if stance:
        parts.append(f"Позиция: {stance}")

    lens = ch.get("lens")
    if lens:
        parts.append(f"Линза: {lens}")

    taboo = ch.get("taboo") or []
    if taboo:
        parts.append("Запрещённые ходы:\n" + "\n".join(f"• {t}" for t in taboo))

    parts.append(PROMPT_SLOP_BAN)
    alien = prompt_banned_words(character_id)
    if alien:
        parts.append(alien)

    return "\n\n".join(p for p in parts if p)


def _positions_for_question(question: str | None) -> list[str]:
    """Динамические позиции трёхкарточного расклада по типу вопроса.

    Вместо жёсткой схемы «прошлое → настоящее → будущее» позиции
    подбираются под тип вопроса: прогноз, ситуация, решение, отношения
    либо широкий вопрос. Для спонтанного расклада (без вопроса) берётся
    нейтральная сюжетная схема.
    """
    if not question:
        return ["Что запускает ситуацию", "Ядро ситуации", "Куда ведёт текущая динамика"]

    q = question.lower()
    relationship = (
        "отношени", "любов", "пара", "партн", "чувств", "расстать",
        "встречаю", "меня любит", "вернёт", "бывший", "бывшая", "он ко мне",
    )
    future = (
        "будет", "будут", "предстоит", "месяц", "недел", "год",
        "произойд", "пройд", "впереди", "скоро", "дальше", "будущ", "ожида", "к чему",
    )
    action = (
        "стоит ли", "стоит", "делать", "менять", "пойти", "согласить",
        "взять", "решить", "начинать", "бросать", "лучше",
    )
    situation = (
        "происход", "ситуаци", "между", "почему", "как обсто", "сейчас",
        "с чем связа", "что за",
    )

    # Отношения первыми: фразы «что будет в отношениях» перекрывают прогноз.
    if any(k in q for k in relationship):
        return ["Твоя позиция и энергия", "Динамика между вами", "Главный вектор развития"]
    if any(k in q for k in future):
        return ["Что входит в период", "Главная динамика периода", "К чему ведёт текущая линия"]
    if any(k in q for k in action):
        return ["Что даёт этот путь", "Цена и препятствие", "К чему приведёт действие"]
    if any(k in q for k in situation):
        return ["Что видно на поверхности", "Что скрыто в основе", "Что сейчас важнее всего понять"]
    return ["Что приходит", "Что удивит", "Что останется после"]


def _is_upright(card: dict) -> bool:
    orientation = str(card.get("orientation", "upright") or "upright").lower()
    return orientation in ("upright", "прямое")


def _orientation(card: dict) -> str:
    return "прямое" if _is_upright(card) else "перевёрнутое"


def _suit_label(card: dict) -> str:
    suit = card.get("suit")
    if not suit:
        return "старший аркан"
    return _SUIT_RU.get(str(suit), str(suit))


def _card_meaning_text(card: dict) -> str:
    value = card.get("upright") if _is_upright(card) else card.get("reversed")
    return str(value).strip() if value else ""


def _format_cards(cards: list[dict], positions: list[str] | None = None) -> list[str]:
    out: list[str] = []
    for i, card in enumerate(cards, 1):
        line = f"{i}. {card['name']} ({_orientation(card)}) · {_suit_label(card)}"
        if positions:
            line += f" — [{positions[i - 1]}]"
        out.append(line)
    return out


def _scan_hint(cards: list[dict]) -> str:
    """Скан колоды: повторы стихий, вес мажоров, реверсы (SNAP3 SCAN_HINT)."""
    suit_count: dict[str, int] = {}
    for card in cards:
        if card.get("suit"):
            suit = str(card["suit"])
            suit_count[suit] = suit_count.get(suit, 0) + 1
    notes: list[str] = []
    repeated = [(suit, n) for suit, n in suit_count.items() if n >= 2]
    if repeated:
        notes.append(
            "повтор стихии: "
            + ", ".join(f"{_SUIT_RU.get(suit, suit)} ×{n}" for suit, n in repeated)
        )
    majors = sum(1 for card in cards if card.get("arcana") == "major")
    if majors >= 2:
        notes.append(f"старших арканов: {majors} из {len(cards)} — сюжет крупнее воли")
    reversed_count = sum(1 for card in cards if not _is_upright(card))
    if reversed_count >= 2:
        notes.append(f"перевёрнутых: {reversed_count} — энергия уходит внутрь")
    if not notes:
        return "Погода в раскладе ровная — без явных повторов; читай пары карт."
    return f"Скан колоды (проверь глазами и используй, если правда): {'; '.join(notes)}."


def _character_reminder(character_id: str) -> str:
    """Голос-напоминание проводника (поле 'reminder') для финала user prompt."""
    characters = _load_characters()
    return characters.get(character_id, {}).get("reminder", "").strip()


_MULTI_CARD_MODES = {"three", "yesno", "mfd", "shadow", "pentagram", "horseshoe"}

# режимные правила раскладов — дословно из SNAP3 prompts.ts (MODE_RULES)
_MODE_RULES: dict[str, str] = {
    "three": (
        "Три карты — ОДНА история, не три отдельных значения.\n"
        "ШАГ 1. Прочитай каждую карту в её позиции.\n"
        "ШАГ 2. Посмотри на пары (1+2, 2+3) — где поддерживают, где гасят.\n"
        "ШАГ 3. Прочитай связки вслух: «потому», «несмотря на», «тем временем».\n"
        "ШАГ 4. Только теперь пиши единый сюжет в short_answer.\n"
        "НЕ возвращайся к «прошлое-настоящее-будущее» — позиции уже заданы, не переименовывай.\n"
        "НЕ пиши списки и нумерацию в прозе. НЕ начинай абзацы с названия карты."
    ),
    "yesno": (
        "Расклад «да / нет»: за · против · совет.\n"
        "Первая фраза short_answer — ВЕРДИКТ дословно: "
        "«Да.» / «Скорее да.» / «Скорее нет.» / «Нет.»\n"
        "Дальше 2-3 предложения обоснования. Вердикт следует из карт, не из вежливости: "
        "если «за» и «против» равны по силе — честное «скорее…».\n"
        "Не подменяй вердикт «всё зависит от тебя»."
    ),
    "mfd": (
        "Расклад о другом человеке: мысли · чувства · действия.\n"
        "Говори о нём в третьем лице, без диагнозов: карты — зеркало вероятного, не рентген.\n"
        "Перевёрнутая карта в «чувствах» — не «он ничего не чувствует», "
        "а чувство, которое он сам себе не показывает.\n"
        "НЕ выдумывай фактов (сообщения, разговоры), которых не было в вопросе.\n"
        "Синтез: где мысль расходится с чувством и что дойдёт до действий."
    ),
    "shadow": (
        "Расклад «тень» — работа с тем, что прячется. Позиции 1-4 — диагностика, 5-6 — выход.\n"
        "Тон: бережный спуск, без надрыва и эзотерического пафоса. Скрывать — нормально: "
        "сначала это было защитой — признай это.\n"
        "Позиция 3 — не «виноватость»: скрытое что-то защищает, назови что именно.\n"
        "Позиция 6 — ОБЯЗАТЕЛЬНО одно наблюдаемое маленькое действие на неделю "
        "(не «поразмысли»).\n"
        "НЕ ставь диагнозы."
    ),
    "pentagram": (
        "Расклад «пентаграмма»: пять стихий вокруг сигнификатора.\n"
        "Сигнификатор (центр) — суть ситуации; читается как рамка, не как событие.\n"
        "Дух — НЕ предсказание: сквозная линия, объединяющая стихии.\n"
        "Земля — тело/деньги/опора; воздух — мысль/слово; вода — чувства; огонь — воля/импульс.\n"
        "Синтез обязателен: какой элемент доминирует, какой голодает, "
        "какие два в диалоге (усиливают или грызутся).\n"
        "Всматривайся в пары стихий по геометрии: соседние точки звезды — соседи в чтении."
    ),
    "horseshoe": (
        "Расклад «подкова» — семь карт дугой от ситуации к исходу.\n"
        "Читай как маршрут: где линия ровная, где гнётся, что подталкивает извне.\n"
        "Пара (2+3): скрытое и препятствие — не дублируй: скрытого не видно изнутри, "
        "препятствие стоит на пути.\n"
        "Пара (5+6): твоя позиция против чужой — где расходятся, там и напряжение.\n"
        "Исход (7) — текущая траектория, не приговор: если совет меняет линию — "
        "скажи об этом в advice."
    ),
    "daily": (
        "Это карта дня — утренний сигнал, не энциклопедия.\n"
        "Толкуй карту как дневную энергию: как она проявится сегодня через конкретное "
        "(разговор, сообщение, задержку, встречу, внутреннее состояние).\n"
        "Перевёрнутая карта дня — энергия, которая сегодня ищет выход внутрь: "
        "тише, медленнее, незаметнее.\n"
        "Не пиши, что карта «значит вообще» — только «как это выглядит сегодня»."
    ),
    "single": (
        "Один вопрос — один главный нерв. Отвечай прямо и сконцентрированно.\n"
        "Перевёрнутая карта — не «нет»: это блокировка, внутрь, или не проявилось ещё.\n"
        "НЕ превращай вероятность в предсказание. НЕ выдумывай конкретных событий, "
        "не следующих из карты.\n"
        "НЕ перечисляй все значения карты. Не используй «Эта карта означает…»."
    ),
}

_DAILY_SCHEMA = (
    "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n"
    "{\n"
    '  "intro": "1-2 предложения: шёпот-предчувствие дня — мелочь, мимо которой легко пройти",\n'
    '  "short_answer": "2-4 предложения: СИГНАЛ дня — главная энергия и как она проявится '
    'через конкретное сегодня",\n'
    '  "проявление": "2-4 реалистичные формы проявления сегодня (разговор, сообщение, идея, '
    'задержка, состояние). Без мистики",\n'
    '  "на_что_смотреть": "слепая зона: что легко не заметить или понять неправильно",\n'
    '  "траектория": {\n'
    '    "утро": "что задаст тон утру",\n'
    '    "день": "где карта проявится сильнее всего",\n'
    '    "вечер": "что станет понятнее к вечеру"\n'
    '  },\n'
    '  "advice": "одно конкретное действие на сегодня, 1-2 предложения"\n'
    "}"
)

_SINGLE_SCHEMA = (
    "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n"
    "{\n"
    '  "intro": "1 предложение: короткая интуитивная формула ответа, шёпот оракула",\n'
    '  "short_answer": "2-4 предложения: ПРЯМОЙ ответ на вопрос, связанный с ситуацией",\n'
    '  "card_meaning": ["Трактовка карты именно для этой ситуации. Живыми словами, '
    'как человек человеку. ЗАПРЕЩЕНЫ обороты «означает», «карта показывает»"],\n'
    '  "advice": "конкретный практический совет, 1 предложение"\n'
    "}"
)


def build_reading_prompt(
    cards: list[dict],
    question: str | None,
    character_id: str,
    spread: dict,
    positions: list[str],
    voice_reminder: str | None = None,
) -> str:
    """Construct the user-facing prompt for a tarot reading (ARCANUM v3).

    Args:
        cards: List of card dicts, each with at least 'name' and
               'orientation' ('upright' or 'reversed'); optional
               'suit'/'arcana' enrich card lines and the scan hint.
        question: The user's question, or None if no question was asked.
        character_id: The character reading the cards (per-guide voice reminder).
        spread: Catalog dict for the spread (data/spreads.json) with at least
                'name' and 'mode' (falls back to 'id', mirroring SNAP3 mode = id).
        positions: Final position names for the spread. For 'three' they are
                   computed externally via _positions_for_question.
        voice_reminder: Optional override for the trailing voice reminder;
                        defaults to the character's 'reminder' field.

    Returns:
        A formatted user prompt string tailored to the spread mode.
    """
    mode = spread.get("mode") or spread.get("id") or "single"
    spread_name = spread.get("name", "")
    multi_card = mode in _MULTI_CARD_MODES
    lines: list[str] = []

    # ── вопрос ──
    if mode == "daily":
        lines.append("Карта дня — пользователь открыл её утром, вопроса нет.")
    else:
        lines.append("Вопрос пользователя:")
        lines.append(f"«{question}»" if question else "(спонтанный расклад — вопроса нет)")
    lines.append("")

    # ── карты со стихиями ──
    if multi_card:
        lines.append(f"Расклад «{spread_name}». Позиции и карты:")
        lines.extend(_format_cards(cards, positions))
        lines.append("")
        lines.append(_scan_hint(cards))
    else:
        lines.append("Карта дня:" if mode == "daily" else "Карта:")
        lines.extend(_format_cards(cards, positions))

    lines.append("")

    # ── правила расклада ──
    mode_rule = _MODE_RULES.get(mode)
    if mode_rule:
        lines.append(mode_rule)
        lines.append("")

    # ── голос полей ──
    field_voice = _load_characters().get(character_id, {}).get("field_voice", "")
    if field_voice:
        lines.append(field_voice)
        lines.append("")

    # ── схема JSON ──
    if multi_card:
        lines.append(_multi_card_json_schema(spread, positions))
    elif mode == "daily":
        daily_voice = _load_characters().get(character_id, {}).get("daily_voice", "")
        if daily_voice:
            lines.append(daily_voice)
            lines.append("")
        lines.append(_DAILY_SCHEMA)
    else:
        lines.append(_SINGLE_SCHEMA)

    reminder = voice_reminder if voice_reminder is not None else _character_reminder(character_id)
    if reminder:
        lines.append("")
        lines.append(reminder)

    return "\n".join(lines)


def _multi_card_json_schema(spread: dict, positions: list[str]) -> str:
    """JSON-схема multi-card чтения — дословно из SNAP3 multiCardJsonSchema."""
    synthesis = spread.get("synthesis") or (
        "синтез: как карты усиливают / сталкиваются / переходят друг в друга"
    )
    pos_entries = []
    for i in range(len(positions)):
        entry = (
            '    {"позиция": "<имя позиции ДОСЛОВНО, как задано выше>", '
            '"карта": "<имя карты>", "реверс": true/false, "трактовка": '
            '"3-4 предложения: карта в этой позиции + связь с соседней + что значит для вопроса"}'
        )
        pos_entries.append(entry + ("," if i < len(positions) - 1 else ""))
    return (
        "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n"
        "{\n"
        '  "intro": "1-2 предложения: шёпот-предчувствие траектории между картами '
        '(не описание одной карты)",\n'
        '  "short_answer": "связный ответ на вопрос целиком, 4-7 предложений, '
        'один сюжет, без списков",\n'
        '  "позиции": [\n' + "\n".join(pos_entries) + "\n  ],\n"
        '  "связь_карт": "' + synthesis + '. Назови конкретные пары и что между ними: '
        'поддержка, гашение, повтор",\n'
        '  "advice": "конкретный совет из всей ситуации, 1-2 предложения"\n'
        "}"
    )


# ═══════════════════════════════════════════════════════════════════════
# ARCANUM v3: уточняющий вопрос, пара карт, прогноз дня, дайджесты.
# Тексты перенесены ДОСЛОВНО из SNAP3 (prompts.ts + api/{week,month}/route.ts).
# ═══════════════════════════════════════════════════════════════════════


def build_follow_up_prompt(card: dict, ctx: dict) -> str:
    """Уточняющий вопрос по одной карте после чтения (SNAP3 buildFollowUpPrompt).

    ctx: question, spread_name, spread_question, reading_summary.
    """
    spread_name = ctx.get("spread_name", "")
    spread_question = ctx.get("spread_question")
    reading_summary = ctx.get("reading_summary", "")
    question = ctx.get("question", "")
    orient = _orientation(card)
    suit = _suit_label(card)
    meanings = _card_meaning_text(card)
    position = card.get("position")

    header = f"Пользователь только что получил расклад «{spread_name}»"
    if spread_question:
        header += f" на вопрос «{spread_question}»"
    header += " и теперь спрашивает об одной карте из него."

    card_line = f"КАРТА: {card.get('name', '')} ({orient}) · {suit}"
    if position:
        card_line += f" · позиция «{position}»"

    return (
        f"{header}\n"
        "\n"
        f"{card_line}\n"
        f"Справочник значений (не для пересказа, а чтобы держать суть): {meanings}\n"
        "\n"
        "ЧТО ГОВОРИЛО ЧТЕНИЕ В ЦЕЛОМ (контекст, не повторяй его дословно):\n"
        f"«{reading_summary}»\n"
        "\n"
        "УТОЧНЯЮЩИЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ:\n"
        f"«{question}»\n"
        "\n"
        "ПРАВИЛА ОТВЕТА:\n"
        "• Отвечай на вопрос через ЭТУ карту в ЭТОМ раскладе — не как абстрактную карту "
        "из справочника.\n"
        "• Карта здесь уже легла на позицию и на вопрос: отвечай в этом контексте, "
        "а не «вообще».\n"
        "• 3-6 предложений связной прозы. Один ответ, без списков и нумерации.\n"
        "• НЕ повторяй то, что уже было сказано в чтении — двигайся глубже или в сторону, "
        "которую спрашивают.\n"
        "• Если вопрос о другом человеке — говори о вероятном, не как о факте.\n"
        "• Не выдумывай событий, которых нет в вопросе и картах.\n"
        "• Не пересказывай значения карты списком. Не начинай с «Эта карта означает».\n"
        "• Отвечай ТОЛЬКО русской кириллицей, без эмодзи, без markdown — чистая проза "
        "одним абзацем."
    )


def _pair_weather_notes(a: dict, b: dict) -> list[str]:
    """Погода пары: стихии, нумерология, вес мажоров, перепад ориентаций."""
    notes: list[str] = []

    ea = _SUIT_ELEMENT.get(str(a["suit"])) if a.get("suit") else None
    eb = _SUIT_ELEMENT.get(str(b["suit"])) if b.get("suit") else None
    if ea and eb:
        if ea == eb:
            notes.append(
                f"обе карты одной стихии ({ea}) — взаимное усиление, тема звучит в два голоса"
            )
        elif {ea, eb} == {"огонь", "воздух"}:
            notes.append("огонь и воздух взаимно усиливают друг друга — пара разгоняется")
        elif {ea, eb} == {"вода", "земля"}:
            notes.append("вода и земля поддерживают друг друга — пара укореняется и питает")
        elif {ea, eb} == {"огонь", "вода"}:
            notes.append("огонь и вода — трение: одна стихия гасит другую, между картами спор")
        elif {ea, eb} == {"воздух", "земля"}:
            notes.append(
                "воздух и земля — трение: одна стихия рассеивает другую, замысел против формы"
            )

    num_a = a.get("number")
    num_b = b.get("number")
    if num_a is not None and num_b is not None:
        if num_a == num_b:
            notes.append(
                f"числа совпадают ({num_a}) — резонанс: колода настаивает на этом числе дважды"
            )
        elif abs(num_a - num_b) == 1:
            notes.append(
                f"числа соседние ({num_a} и {num_b}) — эхо нумерологии: "
                "один сюжет перетекает в другой"
            )

    am = a.get("arcana") == "major"
    bm = b.get("arcana") == "major"
    if am and not bm:
        notes.append(
            "старший аркан рядом с младшим: мажор называет судьбу или урок, "
            "минор — как это проявится в быту"
        )
    elif not am and bm:
        notes.append(
            "младший аркан рядом со старшим: мажор называет урок, "
            "минор показывает его в бытовом, через дело"
        )
    elif am and bm:
        notes.append(
            "оба старшие арканы — сюжет крупнее воли человека, "
            "пара говорит о судьбе, а не о мелочах"
        )

    a_rev = not _is_upright(a)
    b_rev = not _is_upright(b)
    if a_rev and b_rev:
        notes.append("обе перевёрнуты — энергия пары уходит внутрь, наружу выйдет не сразу")
    elif a_rev != b_rev:
        notes.append(
            "одна прямая, другая перевёрнута — между ними перепад: "
            "одна тянет наружу, другая держит внутри"
        )

    return notes


def pair_bridge_phrase(a: dict, b: dict) -> str:
    """Короткая фраза о связи пары — для локального фолбэка (SNAP3 pairBridgePhrase)."""
    notes = _pair_weather_notes(a, b)
    return notes[0] if notes else "они говорят об одном и том же с двух сторон"


def build_pair_prompt(cards: list[dict], ctx: dict) -> str:
    """Связь ДВУХ карт: синтез, а не расшифровка (SNAP3 buildPairPrompt).

    ctx: question, spread_name, spread_question, reading_summary.
    """
    a, b = cards[0], cards[1]
    spread_name = ctx.get("spread_name", "")
    spread_question = ctx.get("spread_question")
    reading_summary = ctx.get("reading_summary", "")
    question = ctx.get("question", "")

    def _line(card: dict) -> str:
        num = card.get("number")
        num_part = f" · число {num}" if num is not None else ""
        position = card.get("position")
        pos_part = f" · позиция «{position}»" if position else ""
        return (
            f"{card.get('name', '')} ({_orientation(card)}) · "
            f"{_suit_label(card)}{num_part}{pos_part}"
        )

    meaning_a = _card_meaning_text(a)
    meaning_b = _card_meaning_text(b)

    notes = _pair_weather_notes(a, b)
    weather = (
        "Скан пары (проверь глазами и используй, если правда):\n"
        + "\n".join(f"• {note}" for note in notes)
        if notes
        else "Скан пары ровный — без явных перекличек стихий и чисел; "
             "ищи связь через позиции и вопрос."
    )

    header = f"Пользователь только что получил расклад «{spread_name}»"
    if spread_question:
        header += f" на вопрос «{spread_question}»"
    header += " и теперь спрашивает о связи ДВУХ карт из него."

    return (
        f"{header}\n"
        "\n"
        "ПАРА КАРТ:\n"
        f"1. {_line(a)}\n"
        f"2. {_line(b)}\n"
        "Справочник значений (не для пересказа, а чтобы держать суть): "
        f"{a.get('name', '')} — {meaning_a}; {b.get('name', '')} — {meaning_b}.\n"
        "\n"
        "ЧТО ГОВОРИЛО ЧТЕНИЕ В ЦЕЛОМ (контекст, не повторяй его дословно):\n"
        f"«{reading_summary}»\n"
        "\n"
        "ВОПРОС ПОЛЬЗОВАТЕЛЯ О СВЯЗИ ПАРЫ:\n"
        f"«{question}»\n"
        "\n"
        f"{weather}\n"
        "\n"
        "ПРАВИЛА ОТВЕТА:\n"
        "• Говори об ОТНОШЕНИИ двух карт между собой — НЕ расшифровывай каждую "
        "по отдельности.\n"
        "• Назови, кто из двух поддерживает, а кто тормозит; куда течёт энергия "
        "между ними.\n"
        "• Если есть трение — скажи, где именно пара упирается; если усиление — "
        "во что это выливается.\n"
        "• Одна и та же пара на разные вопросы читается по-разному — держи вопрос "
        "перед глазами.\n"
        "• 3-6 предложений связной прозы. Один ответ, без списков и нумерации.\n"
        "• НЕ повторяй то, что уже было сказано в чтении — двигайся глубже или "
        "в сторону, которую спрашивают.\n"
        "• Если вопрос о другом человеке — говори о вероятном, не как о факте.\n"
        "• Не выдумывай событий, которых нет в вопросе и картах.\n"
        "• Не пересказывай значения карт списком. Не начинай с «Эта карта означает».\n"
        "• Отвечай ТОЛЬКО русской кириллицей, без эмодзи, без markdown — чистая проза "
        "одним абзацем."
    )


def build_day_forecast_prompt(card: dict) -> str:
    """Прогноз дня по карте дня: план дня, а не толкование (SNAP3 buildDayForecastPrompt)."""
    orient = _orientation(card)
    suit = _suit_label(card)
    meanings = _card_meaning_text(card)
    now = datetime.now()
    today = f"{_WEEKDAY_RU[now.weekday()]}, {now.day} {_MONTH_GEN_RU[now.month - 1]}"

    return (
        "Карта дня пользователя уже вскрыта и прочитана. Теперь он просит ПРОГНОЗ ДНЯ — "
        "не толкование карты (оно уже было), а выведенный из неё план дня: "
        "как прожить этот день с этой картой.\n"
        "\n"
        f"СЕГОДНЯ: {today}\n"
        f"КАРТА ДНЯ: {card.get('name', '')} ({orient}) · {suit}\n"
        f"Справочник значений (держать суть, не пересказывать): {meanings}\n"
        "\n"
        "Ответь СТРОГО JSON-объектом (без markdown-заборов, без пояснений до/после) "
        "по схеме:\n"
        "{\n"
        '  "лозунг": "девиз дня, 4-8 слов, живой, без канцелярита",\n'
        '  "утро": "1-2 предложения: как войти в день, что задаст тон",\n'
        '  "день": "1-2 предложения: главный сюжет дня, где карта проявится сильнее всего",\n'
        '  "вечер": "1-2 предложения: как закрыть день, что станет понятнее",\n'
        '  "фокус": "одна фраза: главное, за что цепляться сегодня",\n'
        '  "тонус": 7,\n'
        '  "удача": 5,\n'
        '  "общение": 8,\n'
        '  "глоток": "маленький конкретный поступок на сегодня (не абстракция)"\n'
        "}\n"
        "\n"
        "ПРАВИЛА:\n"
        "• тонус/удача/общение — целые числа 0..10: физическая энергия / случаи «в тему» / "
        "лёгкость контактов.\n"
        "• Не повторяй формулировки из утреннего чтения карты — прогноз про действия, "
        "не про значения.\n"
        "• Всё конкретно и приземлённо: без «космических энергий», без фатализма, "
        "без «звёзды советуют».\n"
        "• Если карта тяжёлая — не слащи прогноз, но оставь рабочую траекторию "
        "(куда приложить усилие).\n"
        "• лозунг и глоток — самое живое в ответе: их пользователь запомнит.\n"
        "• Весь текст — русская кириллица, без эмодзи, без markdown."
    )


def _count_pairs(counts: dict) -> str:
    return "; ".join(f"{n} × {key}" for key, n in counts.items())


def _digest_questions(questions: list) -> str:
    if not questions:
        return "вопросов оператор не задавал или они не сохранились"
    return " ".join(f"«{q}»" for q in questions)


def build_week_prompt(digest: dict, character_id: str) -> str:
    """Юзер-промпт дайджеста недели (SNAP3 buildWeekPrompt).

    digest: total, days_active, spread_counts, card_counts, guide_counts,
    questions, date_from, date_to. Голос проводника приходит отдельным
    system prompt (get_system_prompt(character_id)) — здесь character_id
    зарезервирован для пер-проводниковых строк Task 8.
    """
    questions = _digest_questions(digest.get("questions") or [])
    return (
        f"вот сводка недели оператора за {digest.get('date_from', '')} — "
        f"{digest.get('date_to', '')}: "
        f"{digest.get('total', 0)} чтений, {digest.get('days_active', 0)} дней из семи "
        f"с картами. "
        f"расклады: {_count_pairs(digest.get('spread_counts') or {}) or '—'}. "
        f"самые частые карты: {_count_pairs(digest.get('card_counts') or {}) or '—'}. "
        f"голоса проводников: {_count_pairs(digest.get('guide_counts') or {}) or '—'}. "
        f"вопросы оператора: {questions}.\n"
        "\n"
        "правила ответа:\n"
        "· ОДИН абзац прозы, 3-5 предложений, без списков и заголовков\n"
        "· НЕ пересчитывай цифры заново — СВЯЖИ их: что повторяется, о чём колода "
        "спрашивает снова и снова, куда тянет неделя\n"
        "· говори своим голосом, терминальным тоном, строчными\n"
        "· финал — один короткий вопрос оператору от колоды"
    )


def build_month_prompt(digest: dict, character_id: str) -> str:
    """Юзер-промпт дайджеста месяца (SNAP3 buildMonthPrompt).

    digest: total, days_active, days_in_month, month_name, year, spread_counts,
    card_counts, guide_counts, majors, suit_counts, days, questions.
    """
    questions = _digest_questions(digest.get("questions") or [])
    loud_days = [d["day"] for d in (digest.get("days") or []) if d.get("count", 0) >= 2]
    rhythm = (
        f"карты звучали гуще всего {', '.join(str(d) for d in loud_days)} числа. "
        if loud_days
        else "чтения были разреженными — почти по одному в день. "
    )
    return (
        f"вот сводка месяца оператора — {digest.get('month_name', '')} "
        f"{digest.get('year', '')}: "
        f"{digest.get('total', 0)} чтений, {digest.get('days_active', 0)} из "
        f"{digest.get('days_in_month', 31)} дней с картами. "
        f"{rhythm}"
        f"расклады: {_count_pairs(digest.get('spread_counts') or {}) or '—'}. "
        f"самые частые карты: {_count_pairs(digest.get('card_counts') or {}) or '—'}. "
        f"старших арканов выпало {digest.get('majors', 0)}, "
        f"масти: {_count_pairs(digest.get('suit_counts') or {}) or '—'}. "
        f"голоса проводников: {_count_pairs(digest.get('guide_counts') or {}) or '—'}. "
        f"вопросы оператора: {questions}.\n"
        "\n"
        "правила ответа:\n"
        "· ОДИН абзац прозы, 3-5 предложений, без списков и заголовков\n"
        "· НЕ пересчитывай цифры — СВЯЖИ их: чему месяц учил, какой аркан вёл за руку, "
        "как менялись вопросы к концу\n"
        "· это взгляд назад на весь месяц — говори итогом, не суетой дня\n"
        "· говори своим голосом, терминальным тоном, строчными\n"
        "· финал — одна короткая напутственная строка оператору в следующий месяц"
    )
