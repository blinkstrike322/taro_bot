from __future__ import annotations

import json
import random
from collections import defaultdict, deque
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
        "НЕ повторяй эти интро и советы дословно — скажи то же самое по-другому:"
    ]
    for frag in capped:
        if frag and frag.strip():
            lines.append(f"• {frag.strip()}")
    return "\n".join(lines)


_BLOCK_SEP = "\n\n"


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
    no_emoji_rule = (
        "\n\nПОДТВЕРЖДЕНИЕ: Emoji СТРОГО ЗАПРЕЩЕНЫ в любом месте ответа. "
        "Ни одного эмодзи. Только обычный кириллический текст.\n"
        "REMEMBER: Your response will be REJECTED if it contains any emoji. "
        "This is a hard rule with zero exceptions."
    )
    no_latin_rule = (
        "\n\nЯЗЫК: Весь ответ — ТОЛЬКО на русском языке. "
        "СТРОГО ЗАПРЕЩЕНО любое латинское/английское слово в прозе и значениях. "
        "Никаких английских слов, "
        "даже «по привычке» (navigate, truly, mindset, choice и т.п.). "
        "Если не знаешь русский эквивалент — перефразируй по-русски своими словами "
        "или пиши транслитом, но НЕ вставляй латиницу размером 3+ буквы подряд.\n"
        "ИСКЛЮЧЕНИЕ — КЛЮЧИ JSON: ключи объекта (intro, short_answer, card_meaning, "
        "advice, позиции, связь_карт, проявление, на_что_смотреть, траектория) — это "
        "фиксированные идентификаторы схемы, их НЕ переводить и НЕ менять. "
        "Переводить можно только значения (текст в кавычках), сами ключи оставляй как есть.\n"
        "Помни: ответ с любым латинским словом из 3+ букв в прозе будет отклонён. "
        "Это жёсткое правило без исключений."
    )
    if voice_examples is None:
        voice_examples = sample_voice_pool(character_id)
    parts = [
        base_prompt,
        _format_avoid_texts(avoid_texts),
        _format_voice_examples(voice_examples),
        no_emoji_rule,
        no_latin_rule,
    ]
    return _BLOCK_SEP.join(p for p in parts if p)


def _build_voice_core(character_id: str, ch: dict) -> str:
    """Голосовое ядро: persona + diction + rhythm + stance + lens + taboo + bans."""
    parts = [ch.get("persona", "").strip()]

    diction = ch.get("diction") or {}
    if diction:
        lines = ["Словарь твоих образов (используй их, но не штампуй):"]
        imagery = diction.get("imagery") or []
        if imagery:
            lines.append(f"• образы: {', '.join(imagery)}")
        anti = diction.get("anti") or []
        if anti:
            lines.append(f"• избегай: {', '.join(anti)}")
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


def _spread_mode(spread_type: object, question: str | None, n_cards: int) -> str:
    """Режим расклада: 'three' | 'single' | 'daily'.

    App.py присылает spread_type = 'daily'/1/3, для карты дня вопрос всегда
    None. Три карты распознаём по количеству, карту дня — по отсутствию
    вопроса, остальное — одна карта с вопросом.
    """
    if str(spread_type) == "3" and n_cards == 3:
        return "three"
    if question and question.strip():
        return "single"
    return "daily"


def _orientation(card: dict) -> str:
    return "прямое" if card.get("orientation") == "upright" else "перевернутое"


def _format_cards(cards: list[dict], positions: list[str] | None = None) -> list[str]:
    out: list[str] = []
    for i, card in enumerate(cards, 1):
        line = f"{i}. {card['name']} ({_orientation(card)})"
        if positions:
            line += f" — [{positions[i - 1]}]"
        out.append(line)
    return out


def _character_reminder(character_id: str) -> str:
    """Голос-напоминание проводника (поле 'reminder') для финала user prompt."""
    characters = _load_characters()
    return characters.get(character_id, {}).get("reminder", "").strip()


def build_reading_prompt(
    cards: list[dict],
    question: str | None,
    character_id: str,
    spread_type: object = 1,
    voice_reminder: str | None = None,
) -> str:
    """Construct the user-facing prompt for a tarot reading.

    Args:
        cards: List of card dicts, each with at least 'name' and
               'orientation' ('upright' or 'reversed').
        question: The user's question, or None if no question was asked.
        character_id: The character reading the cards (per-guide voice reminder).
        spread_type: 'daily', 1, or 3 (also accepts their string forms).
        voice_reminder: Optional override for the trailing voice reminder;
                        defaults to the character's 'reminder' field.

    Returns:
        A formatted user prompt string tailored to the spread mode.
    """
    mode = _spread_mode(spread_type, question, len(cards))
    lines: list[str] = []

    # ── Question ──
    if mode == "daily":
        lines.append("Карта дня — пользователь не задавал вопроса (открыл утром).")
    else:
        lines.append("Вопрос пользователя:")
        lines.append(question if question else "(спонтанный расклад — пользователь не задавал вопроса)")
    lines.append("")

    # ── Cards ──
    if mode == "three":
        positions = _positions_for_question(question)
        lines.append("Расклад «3 карты». Позиции уже определены по типу вопроса:")
        lines.extend(_format_cards(cards, positions))
    else:
        lines.append("Карта дня:" if mode == "daily" else "Карта:")
        lines.extend(_format_cards(cards))

    lines.append("")

    # ── Core instruction ──
    if mode == "three":
        lines.append(
            "Три карты — это ОДНА история, а не три отдельных значения.\n"
            "ШАГ 1. Прочитай каждую карту в её позиции.\n"
            "ШАГ 2. Найди, как карты связаны между собой: они могут усиливать друг друга, "
            "конфликтовать, переходить одна в другую (причина → следствие) или повторять общую тему.\n"
            "ШАГ 3. Только после этого напиши общий связный ответ — единый сюжет всех трёх карт."
        )
        lines.append("")
        lines.append(
            "ВАЖНО — ЧЕГО НЕ ДЕЛАТЬ:\n"
            "• НЕ возвращайся к «прошлое → настоящее → будущее» — позиции уже заданы выше, "
            "не переименовывай и не меняй их\n"
            "• НЕ начинай абзацы с «В прошлом...», «В настоящем...», «В будущем...»\n"
            "• НЕ пиши маркированные списки и нумерацию\n"
            "• НЕ используй шаблон «Эта карта означает...», «Значение этой карты...»\n"
            "• НЕ дублируй одно и то же в short_answer и «позиции»/«связь_карт» — они про разное: "
            "short_answer это связный сюжет всей истории, "
            "а «позиции» с «трактовками» и «связь_карт» — детальная структура\n"
            "• НЕ ставь префиксы позиций в квадратных скобках в прочем тексте\n"
            "• Называй карты по имени органично внутри повествования"
        )
    elif mode == "daily":
        lines.append(
            "Это карта дня — пользователь открыл её утром, чтобы понять, "
            "на что обратить внимание ИМЕННО СЕГОДНЯ. Толкуй карту как дневной сигнал: "
            "как её энергия может проявиться сегодня в обычной жизни. "
            "Говори языком сегодняшней жизни (разговор, сообщение, идея, задержка, "
            "встреча, внутреннее состояние, возможность), а не энциклопедией Таро. "
            "Не пиши, что карта значит «вообще» — пиши, как она может проявиться сегодня."
        )
    else:  # single
        lines.append(
            "Один вопрос — один главный нерв ситуации. Отвечай прямо и концентрированно, "
            "не раздувая толкование до «полного значения карты». " if question else
            "Дай толкование этой карты."
        )
        if question:
            lines.append("")
            lines.append(
                "ВАЖНО — ЧЕГО НЕ ДЕЛАТЬ:\n"
                "• НЕ превращай вероятность в предсказание. НЕ выдумывай конкретные события "
                "(поездку, встречу конкретного человека, повышение, сообщение от бывшего и т.п.), "
                "если они не следуют из значения карты в контексте вопроса\n"
                "• НЕ перечисляй все возможные значения карты — отвечай только на вопрос\n"
                "• НЕ используй «Эта карта означает...» — говори по смыслу, от имени проводника"
            )

    lines.append("")

    # ── Голос полей: схема говорит регистром проводника, а не учебника ──
    field_voice = _load_characters().get(character_id, {}).get("field_voice", "")
    if field_voice:
        lines.append(field_voice)
        lines.append("")

    # ── JSON format ──
    if mode == "three":
        lines.append(
            'ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n'
            '{\n'
            '  "intro": "1-2 предложения. Шёпот-предчувствие: коротко обозначь ТРАЕКТОРИЮ '
            'между картами (как одна перетекает в другую), не описывая одну карту",\n'
            '  "short_answer": "связное повествование из 5-7 предложений — вся история из трёх карт '
            'как единый сюжет, в конце — синтез: как карты влияют друг на друга '
            '(усиление / конфликт / переход). Никаких списков. Без префиксов позиций",\n'
            '  "позиции": [\n'
            '    {"позиция": "<первая позиция ДОСЛОВНО, как в раскладе>", "карта": "<имя карты>", '
            '"реверс": true/false, "трактовка": "3-4 предложения: трактовка карты в этой позиции '
            '+ её связь с соседней картой + что значит для вопроса пользователя"},\n'
            '    {"позиция": "<вторая позиция ДОСЛОВНО>", "карта": "<имя карты>", '
            '"реверс": true/false, "трактовка": "..."},\n'
            '    {"позиция": "<третья позиция ДОСЛОВНО>", "карта": "<имя карты>", '
            '"реверс": true/false, "трактовка": "..."}\n'
            '  ],\n'
            '  "связь_карт": "синтез 2-3 предложения: как карты усиливают / сталкиваются / '
            'переходят друг в друга — единая механика расклада",\n'
            '  "advice": "конкретный совет на основе всей ситуации (1-2 предложения)"\n'
            '}'
        )
    elif mode == "daily":
        daily_voice = _load_characters().get(character_id, {}).get("daily_voice", "")
        if daily_voice:
            lines.append(daily_voice)
            lines.append("")
        lines.append(
            'ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n'
            '{\n'
            '  "intro": "1-2 предложения — шёпот-предчувствие дня: мелочь, мимо которой '
            'легко пройти (без слов «система», «заметила» — просто образ и чувство)",\n'
            '  "short_answer": "2-4 предложения — СИГНАЛ дня: главная энергия дня и как она '
            'скорее всего проявится через что-то конкретное и наблюдаемое сегодня",\n'
            '  "проявление": "2-4 реалистичные формы, как карта проявится сегодня '
            '(разговор, сообщение, идея, задержка, неожиданная встреча, внутреннее состояние, '
            'возможность). Без мистики — про обычный день",\n'
            '  "на_что_смотреть": "слепая зона: что сегодня легко не заметить или понять '
            'неправильно; на что обратить внимание в первую очередь",\n'
            '  "траектория": {\n'
            '    "утро": "что задаст тон утру",\n'
            '    "день": "где карта проявится сильнее всего",\n'
            '    "вечер": "что станет понятнее к вечеру"\n'
            '  },\n'
            '  "advice": "ДЕЙСТВИЕ: одно конкретное «что сделать / чего не делать» именно сегодня '
            '(1-2 предложения)"\n'
            '}'
        )
    else:  # single
        lines.append(
            'ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n'
            '{\n'
            '  "intro": "1 предложение — короткая интуитивная формула ответа (ядро), '
            'шёпот оракула",\n'
            '  "short_answer": "2-4 предложения — ПРЯМОЙ ответ на вопрос пользователя, '
            'связанный с его ситуацией",\n'
            '  "card_meaning": ["Трактовка: что карта говорит именно ЕГО ситуации. '
            'Живыми словами, как человек человеку. ЗАПРЕЩЕНЫ обороты «означает», '
            '«в контексте», «карта показывает/фиксирует»"],\n'
            '  "advice": "конкретный практический совет (1 предложение)"\n'
            '}'
        )

    reminder = voice_reminder if voice_reminder is not None else _character_reminder(character_id)
    if reminder:
        lines.append("")
        lines.append(reminder)

    return "\n".join(lines)
