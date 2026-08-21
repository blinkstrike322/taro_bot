from __future__ import annotations

import random
from pathlib import Path

_CHARACTERS_PATH = Path(__file__).resolve().parent.parent / "data" / "characters.json"

_characters_cache: dict[str, dict] | None = None

DAILY_POSITIONS = ["Энергия дня", "Вызов дня", "Совет дня"]
THREE_POSITIONS = ["Прошлое", "Настоящее", "Будущее"]

GLOBAL_FORBIDDEN = [
    "карта указывает на",
    "значение этой карты",
    "в позиции прошлого",
    "в позиции настоящего",
    "в позиции будущего",
    "аркан символизирует",
    "это говорит о том, что",
    "стоит обратить внимание на то",
    "не забывай, что",
    "следует помнить, что",
]


def _load_characters() -> dict[str, dict]:
    global _characters_cache
    if _characters_cache is None:
        import json
        with open(_CHARACTERS_PATH, encoding="utf-8") as f:
            raw: list[dict] = json.load(f)
        _characters_cache = {ch["id"]: ch for ch in raw}
    return _characters_cache


def get_character(character_id: str) -> dict:
    characters = _load_characters()
    if character_id not in characters:
        raise KeyError(
            f"Unknown character_id '{character_id}'. "
            f"Available: {', '.join(characters)}"
        )
    return characters[character_id]


def pick_greeting(character_id: str) -> str:
    ch = get_character(character_id)
    greetings = ch.get("greetings") or [ch.get("greeting", "Добро пожаловать.")]
    return random.choice(greetings)


# ──────────────────────────────────────────────────────────────────
# Question context categories
# ──────────────────────────────────────────────────────────────────

_CATEGORIES: dict[str, dict] = {
    "love": {
        "keywords": [
            "люб", "отношен", "мужч", "женщ", "парн", "девушк", "мужа", "жена",
            "встреча", "влюб", "бывш", "свадьб", "расстал", "развод", "измен",
            "ревност", "роман", "свидан", "свобод", "чувств к", "нравится",
            "вернёт", "вернет", "он любит", "она любит", "пара", "поссор",
        ],
        "focus": (
            "Ситуация про чувства и отношения. Фокусируйся на динамике между людьми: "
            "чувства, невысказанное, потребности и страхи каждой стороны. "
            "Будь эмпатичной, но не льсти: если человек ждёт того, чего карты не подтверждают, "
            "скажи об этом мягко и честно. Дай понять, что делать сердцу."
        ),
    },
    "career": {
        "keywords": [
            "работ", "карьер", "начальн", "коллег", "ваканс", "собес", "увольн",
            "проект", "бизнес", "клиент", "команд", "творч", "творчество",
            "учёб", "учеб", "экзамен", "поступ", "курс", "професс", "призван",
        ],
        "focus": (
            "Ситуация про дело, работу или призвание. Фокусируйся на сильных сторонах, "
            "скрытых рисках и конкретных шагах. Про отношения с коллегами и начальством — "
            "как игру сил, без морализаторства. Подчеркни, где человек недооценивает себя."
        ),
    },
    "money": {
        "keywords": [
            "деньг", "финанс", "доход", "кредит", "долг", "покупк", "квартир",
            "съём", "съем", "переезд", "инвест", "вложить", "выигрыш", "наслед",
            "зарплат", "продаж",
        ],
        "focus": (
            "Ситуация про деньги и материальные решения. Фокусируйся на динамике "
            "давания-получения, страхах нехватки и конкретных решениях. Никаких "
            "финансовых гарантий — но покажи, где человек распоряжается силой верно, "
            "а где обманывает себя."
        ),
    },
    "decision": {
        "keywords": [
            "стоит ли", "стоит", "выбрат", "выбор", "или ", "решение", "решить",
            "поступать", "соглашать", "соглаш", "отказ", "менять", "уезжать",
            "перейти", "остаться", "начинать", "ждать или",
        ],
        "focus": (
            "Человек стоит перед выбором. Разведи варианты через карты: что несёт каждый путь, "
            "чем придётся заплатить, что подсказывает тело и сердце. Не решай за человека — "
            "но покажь последствия живо и честно. Заверши ясным ориентиром, а не «решай сама»."
        ),
    },
    "self": {
        "keywords": [
            "себя", "самореализ", "предназчен", "предназначен", "самой", "себе",
            "уверенн", "страхи", "страшно", "тревог", "одинок", "устал", "выгор",
            "силы", "энергия", "не могу", "не получается", "люблю ли я",
            "кто я", "смысл",
        ],
        "focus": (
            "Вопрос о себе и внутреннем состоянии. Фокусируйся на внутренних опорах: "
            "что истощает, что наполняет, где человек живёт не свою жизнь. Говори бережно "
            "и ободряюще, без клише про «верь в себя». Покажи конкретный путь к себе."
        ),
    },
    "health": {
        "keywords": [
            "здоровь", "боле", "болит", "тел", "сон", "сны", "бессонниц",
            "диагноз", "лечен", "врач", "операци",
        ],
        "focus": (
            "Вопрос про тело и энергию. Говори только об энергетике и заботе о себе: баланс, "
            "отдых, ритм, любовь к телу. СТРОГО без медицинских диагнозов, советов и обещаний — "
            "мягко напомни, что врачам доверяют тело, а картам — путь."
        ),
    },
}


def detect_question_category(question: str | None) -> str:
    """Detect the thematic category of a question for context-aware readings."""
    if not question:
        return "general"
    q = question.lower()
    for cat, cfg in _CATEGORIES.items():
        for kw in cfg["keywords"]:
            if kw in q:
                return cat
    return "general"


GENERAL_FOCUS = (
    "Относись к вопросу лично: это не абстрактный справочник, а разговор с конкретным человеком "
    "о его жизни. Ищи в карках ответ именно на заданный вопрос, а не общее значение карт."
)


# ──────────────────────────────────────────────────────────────────
# System prompt
# ──────────────────────────────────────────────────────────────────

def get_system_prompt(
    character_id: str,
    mood: dict | None = None,
    opener: str | None = None,
    avoid_texts: list[str] | None = None,
) -> str:
    """Compose a rich, rotation-aware system prompt for a character.

    mood: optional mood dict from the character's `moods` list.
    opener: optional instruction on how to open the reading.
    avoid_texts: recent reading fragments (intro/advice) to avoid repeating.
    """
    ch = get_character(character_id)
    parts: list[str] = []

    parts.append(ch.get("persona") or ch.get("system_prompt", ""))

    if ch.get("focus"):
        parts.append("\nЧто ты замечаешь в первую очередь:\n" + ch["focus"])

    # Mood of the day — rotates between readings
    if mood is None:
        moods = ch.get("moods") or []
        mood = random.choice(moods) if moods else None
    if mood:
        parts.append(
            f"\nТвоё сегодняшнее настроение — «{mood['name']}»:\n{mood['prompt']}"
        )

    if opener is None:
        openers = ch.get("openers") or []
        opener = random.choice(openers) if openers else None
    if opener:
        parts.append("\nКак начать этот ответ:\n" + opener)

    # Anti-repetition: character clichés + global + recent texts
    forbidden = list(ch.get("forbidden") or []) + GLOBAL_FORBIDDEN
    if avoid_texts:
        seen: set[str] = set()
        unique_avoid: list[str] = []
        for t in avoid_texts:
            t = t.strip()
            if t and t not in seen:
                seen.add(t)
                unique_avoid.append(t)
        if unique_avoid:
            quoted = "\n".join(f"  — {t}" for t in unique_avoid[:8])
            parts.append(
                "\nВАЖНО — НЕ ПОВТОРЯЙСЯ. Вот фрагменты твоих недавних ответов этому "
                "человеку. Не используй те же формулировки, обороты и способы начать:\n" + quoted
            )
    parts.append(
        "\nЗапрещённые штампы (никогда не пиши их):\n" + "\n".join(f"  «{f}»" for f in forbidden)
    )

    parts.append(
        "\nОбщие правила: обращайся на «ты», тепло и лично. Не пиши списков и маркировку. "
        "Не начинай предложения с названия позиции. Не пересказывай справочные значения карт — "
        "живи ими внутри истории. Пиши по-русски, живым языком."
    )

    parts.append(
        "\nПОДТВЕРЖДЕНИЕ: Emoji СТРОГО ЗАПРЕЩЕНЫ в любом месте ответа. "
        "Ни одного эмодзи. Только обычный кириллический текст.\n"
        "REMEMBER: Your response will be REJECTED if it contains any emoji. "
        "This is a hard rule with zero exceptions."
    )

    return "\n".join(parts)


# ──────────────────────────────────────────────────────────────────
# Reading prompts
# ──────────────────────────────────────────────────────────────────

def _format_cards(cards: list[dict], positions: list[str] | None = None) -> list[str]:
    lines = []
    for i, card in enumerate(cards):
        orientation = "прямое" if card.get("orientation") == "upright" else "перевернутое"
        pos = f" — позиция «{positions[i]}»" if positions and i < len(positions) else ""
        lines.append(f"{i + 1}. {card['name']} ({orientation}){pos}")
    return lines


def build_reading_prompt(
    cards: list[dict],
    question: str | None,
    character_id: str,
    spread_type: int | str = 1,
) -> str:
    """Construct the user-facing prompt for a tarot reading.

    spread_type: 1, 3 or "daily".
    """
    is_daily = spread_type == "daily"
    category = detect_question_category(question if not is_daily else None)
    focus = _CATEGORIES.get(category, {}).get("focus", GENERAL_FOCUS)

    lines: list[str] = []

    if is_daily:
        lines.append("Ритуал дня. Расклад из 3 карт на сегодня:")
        lines.extend(_format_cards(cards, DAILY_POSITIONS))
        lines.append("")
        lines.append(
            "Это расклад на СЕГОДНЯШНИЙ день. Построй из карт живую карту дня, а не пересказ "
            "значений: чем наполнено утро, что потребует внимания и мягкости днём, "
            "с чем красиво закрыть вечер. Проведи человека через день — от пробуждения "
            "до ночи. Свяжи карты между собой: энергия дня перетекает в вызов, вызов "
            "разрешается советом."
        )
        lines.append("")
        lines.append(
            "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n"
            "{\n"
            "  \"intro\": \"вступление-настроение ко дню (1 предложение)\",\n"
            "  \"short_answer\": \"связная история дня из 4-6 предложений: как unfolded день "
            "от утра к вечеру. Называй карты по имени внутри текста. Никаких списков.\",\n"
            "  \"card_meaning\": \"три абзаца — по одному на каждую позицию (Энергия дня, "
            "Вызов дня, Совет дня). В каждом: что карта делает с этим днём конкретно, "
            "как это проявится в реальных ситуациях (сообщения, люди, настроение).\",\n"
            "  \"advice\": \"один маленький красивый ритуал или действие на сегодня — "
            "конкретное и выполнимое (1-2 предложения)\"\n"
            "}"
        )
        return "\n".join(lines)

    # ── Questioned spreads ──
    lines.append("Вопрос пользователя:")
    lines.append(question if question else "(спонтанный расклад — пользователь не задавал вопроса)")
    lines.append("")

    if spread_type == 3 and len(cards) == 3:
        lines.append("Расклад 3 карты (Прошлое — Настоящее — Будущее):")
        lines.extend(_format_cards(cards, THREE_POSITIONS))
    else:
        lines.append("Карта:")
        lines.extend(_format_cards(cards))

    lines.append("")
    lines.append("Фокус вопроса:\n" + focus)
    lines.append("")

    if spread_type == 3 and len(cards) == 3:
        if question:
            lines.append(
                "Толкуй эти три карты как единую историю судьбы, отвечающую на вопрос. "
                "Прошлое перетекает в настоящее, а из настоящего рождается будущее. "
                "Каждую карту объясни через три слоя: (1) что она несёт, (2) связь с позицией, "
                "(3) что это значит именно для ситуации пользователя — его вопрос, его жизнь."
            )
        else:
            lines.append(
                "Толкуй эти три карты как единую историю. Прошлое перетекает в настоящее, "
                "из настоящего рождается будущее. Раскрой сюжет."
            )
        lines.append("")
        lines.append(
            "ВАЖНО — ЧЕГО НЕ ДЕЛАТЬ:\n"
            "• НЕ начинай абзацы с «В прошлом...», «В настоящем...», «В будущем...»\n"
            "• НЕ пиши маркированные списки и нумерацию\n"
            "• НЕ дублируй одно и то же в short_answer и card_meaning: short_answer — "
            "связный пересказ всей истории, card_meaning — детальный разбор по картам\n"
            "• Называй карты по имени органично внутри повествования"
        )
        lines.append("")
        lines.append(
            "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n"
            "{\n"
            "  \"intro\": \"вступительная фраза ко всему раскладу (1 предложение)\",\n"
            "  \"short_answer\": \"связное повествование из 5-7 предложений. Все три карты "
            "как единая история. Прямой ответ на вопрос. Никаких списков.\",\n"
            "  \"card_meaning\": \"дополнительный разбор — три абзаца, по одному на каждую "
            "карту/позицию: значение, связь с позицией, контекст вопроса. Связным текстом.\",\n"
            "  \"advice\": \"конкретный совет на основе всей ситуации (1-2 предложения)\"\n"
            "}"
        )
    else:
        if question:
            lines.append(
                "Дай ПРЯМОЙ ответ на вопрос через эту карту. Сначала — суть ответа "
                "(к чему всё идёт), затем — почему карта говорит именно об этом "
                "в ситуации пользователя. Не просто опиши значение карты — ответь на вопрос."
            )
        else:
            lines.append("Дай живое толкование этой карты для человека здесь и сейчас.")
        lines.append("")
        lines.append(
            "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом (без markdown, без пояснений):\n"
            "{\n"
            "  \"intro\": \"вступительная фраза (1 предложение)\",\n"
            "  \"short_answer\": \"прямой ответ на вопрос: 3-5 предложений\",\n"
            "  \"card_meaning\": [\"Название карты: развёрнутое значение, привязанное к вопросу\"],\n"
            "  \"advice\": \"конкретный совет (1 предложение)\"\n"
            "}"
        )

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────
# Follow-up questions about a reading
# ──────────────────────────────────────────────────────────────────

def build_followup_messages(
    character_id: str,
    reading: dict,
    history: list[dict],
    question: str,
    avoid_texts: list[str] | None = None,
) -> list[dict]:
    """Build the message list for a follow-up question about an existing reading.

    reading: dict with question, cards (list), interpretation (dict).
    history: list of {"question", "answer"} — earlier follow-ups.
    """
    ch = get_character(character_id)
    moods = ch.get("moods") or []
    mood = random.choice(moods) if moods else None

    system = get_system_prompt(character_id, mood=mood, avoid_texts=avoid_texts)
    system += (
        "\n\nСейчас идёт РАЗБОР УЖЕ СДЕЛАННОГО РАСКЛАДА. Правила:\n"
        "• Отвечай на вопрос, опираясь на карты и толкование этого расклада — не раскладывай новые карты.\n"
        "• Не противоречь сказанному ранее, но углубляй, раскрывай детали, отвечай честно.\n"
        "• Если вопрос выходит за рамки расклада — мягко верни разговор к картам.\n"
        "• Отвечай коротко и по-человечески: 2-6 предложений. Можно закончить коротким встречным вопросом.\n"
        "• Никаких списков, заголовков и markdown.\n"
        "ОТВЕЧАЙ ТОЛЬКО ЭТИМ JSON-объектом:\n"
        "{\"answer\": \"...\"}"
    )

    cards = reading.get("cards") or []
    interp = reading.get("interpretation") or {}
    ctx: list[str] = []
    ctx.append(
        "Контекст — расклад, который ты уже сделала для этого человека:"
    )
    if reading.get("question"):
        ctx.append(f"Исходный вопрос: {reading['question']}")
    else:
        ctx.append("Исходный вопрос: (спонтанный расклад / расклад дня)")
    if cards:
        ctx.append("Карты расклада:")
        ctx.extend(_format_cards(cards))
    summary_parts = []
    for key in ("intro", "short_answer", "advice"):
        v = interp.get(key)
        if isinstance(v, str) and v.strip():
            summary_parts.append(v.strip())
    if summary_parts:
        summary = " ".join(summary_parts)
        if len(summary) > 1600:
            summary = summary[:1600] + "…"
        ctx.append("Твоё прошлое толкование (сокращённо):")
        ctx.append(summary)
    if history:
        ctx.append("")
        ctx.append("Предыдущие вопросы-ответы по этому раскладу:")
        for h in history[-6:]:
            q = (h.get("question") or "").strip()
            a = (h.get("answer") or "").strip()
            if q and a:
                if len(a) > 700:
                    a = a[:700] + "…"
                ctx.append(f"— Вопрос: {q}\n  Твой ответ: {a}")
    ctx.append("")
    ctx.append(f"Новый вопрос человека: {question}")
    ctx.append("Ответь в формате JSON.")

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(ctx)},
    ]
