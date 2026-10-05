#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────
# serve_webapp_mock.py — локальный тест-сервер собранного веб-аппа
#
# Запуск (из корня репозитория):
#     python3 scripts/serve_webapp_mock.py
#     → http://localhost:3000
#
# Отдаёт статику из static/webapp/ (прод-экспорт Next.js) и
# мокает эндпоинты бэкенда (/api/spread, /api/spread/begin,
# /api/spread/poll, /api/character, /api/readings), чтобы терминал
# можно было тестировать без aiohttp. /api/spread/begin отдаёт карты
# сразу, а «ЛЛМ» (poll) готовит толкование ~7 секунд — как живой канал.
# ─────────────────────────────────────────────────────────────
import json
import os
import random
import sys
import threading
import time
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "webapp")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "3000"))

# Каталог раскладов — зеркало data/spreads.json (backend — источник правды).
with open(os.path.join(REPO, "data", "spreads.json"), encoding="utf-8") as _f:
    CATALOG = json.load(_f)["spreads"]

DECK = [
    ("the-fool", "Дурак"), ("the-magician", "Маг"), ("the-high-priestess", "Жрица"),
    ("the-empress", "Императрица"), ("the-emperor", "Император"), ("the-hierophant", "Иерофант"),
    ("the-lovers", "Влюблённые"), ("the-chariot", "Колесница"), ("strength", "Сила"),
    ("the-hermit", "Отшельник"), ("wheel-of-fortune", "Колесо Фортуны"), ("justice", "Справедливость"),
    ("the-hanged-man", "Повешенный"), ("death", "Смерть"), ("temperance", "Умеренность"),
    ("the-devil", "Дьявол"), ("the-tower", "Башня"), ("the-star", "Звезда"),
    ("the-moon", "Луна"), ("the-sun", "Солнце"), ("judgement", "Суд"), ("the-world", "Мир"),
    ("ace-of-wands", "Туз Жезлов"), ("two-of-cups", "Двойка Кубков"), ("three-of-swords", "Тройка Мечей"),
    ("nine-of-pentacles", "Девятка Пентаклей"), ("king-of-swords", "Король Мечей"),
    ("queen-of-cups", "Королева Кубков"), ("knight-of-wands", "Рыцарь Жезлов"), ("page-of-pentacles", "Паж Пентаклей"),
]

INTROS = [
    "Карты легли странно. Тени вокруг них длиннее обычного — это значит, что ответ уже живёт в тебе.",
    "Свеча трещит, когда вопрос честный. Сейчас она трещит. Слушай.",
    "Комната, в которой ты задаёшь вопрос, стала тише. Это хороший знак.",
]
ANSWERS = [
    "То, что ты считаешь концом, — лишь порог. Карты настаивают: переступи его, не оборачиваясь.",
    "Да, но не сразу. Сначала тебе придётся отпустить то, что ты давно носишь с собой.",
    "Ответ уже произошёл — ты просто ещё не заметил, где именно.",
]
ADVICES = [
    "Не ищи знак — стань им. Три дня молчи о планах, и путь проявится сам.",
    "Сделай маленький шаг сегодня. Хаос любит смелых, но платит по счетам аккуратно.",
    "Запиши сон утром — в нём будет первая строка ответа.",
]
MEANING_TPL = [
    "то, что ушло, всё ещё держит тебя за рукав.",
    "ты стоишь на перекрёстке, и это честнее, чем кажется.",
    "будущее просит не скорости, а направления.",
]
SYNTHESIS = [
    "карты спорят, но спор продуктивный: движение здесь важнее покоя.",
    "все линии сходятся в одном: решает не обстоятельство, а твоя ставка.",
    "путь не обещан лёгким, но он открыт — если не оборачиваться.",
]

# двухфазный спред: токен → (ready_at, payload)
LLM_LATENCY = float(os.environ.get("MOCK_LLM_LATENCY", "7"))
_pending: dict[str, dict] = {}
_pending_lock = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[tarot-mock] %s\n" % (fmt % args))

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/character":
            return self._json({"character_id": "shadow_walker"})
        if parsed.path == "/api/spread/poll":
            token = (parse_qs(parsed.query).get("token") or [""])[0]
            with _pending_lock:
                job = _pending.get(token)
            if job is None:
                return self._json({"error": "unknown token"}, 404)
            if time.time() < job["ready_at"]:
                return self._json({"ready": False})
            with _pending_lock:
                _pending.pop(token, None)
            return self._json({"ready": True, "interpretation": job["interpretation"]})
        if parsed.path == "/api/readings":
            return self._json({"readings": self._mock_readings()})
        if parsed.path.startswith("/api/"):
            return self._json({"error": "unknown endpoint"}, 404)
        return super().do_GET()

    def _resolve_spread(self, sid, question=None):
        """sid → (spread_id, spread_name, n, position_keys, positions).

        Легаси различает daily/single как бэкенд (core/spreads.resolve_spread):
        1 без вопроса → daily, 1 с вопросом → single, 3 → three.
        """
        if isinstance(sid, str) and sid in CATALOG:
            s = CATALOG[sid]
            keys = [p["key"] for p in s["positions"]]
            by_key = {p["key"]: p["name"] for p in s["positions"]}
            return s["id"], s["name"], s["count"], keys, [by_key[k] for k in keys]
        if str(sid) == "3":
            return ("three", "три карты", 3, ["p1", "p2", "p3"],
                    ["Твоя позиция и энергия", "Динамика между вами", "Главный вектор развития"])
        if str(sid) == "1" and question and str(question).strip():
            return ("single", "одна карта", 1, ["p1"], ["суть ответа"])
        return ("daily", "карта дня", 1, ["p1"], ["энергия дня"])

    def _draw_cards(self, payload):
        spread_id, spread_name, n, position_keys, positions = self._resolve_spread(
            payload.get("spread_type"), payload.get("question"))
        pick = random.sample(DECK, n)
        now = random.randrange(10 ** 6)
        cards = [
            {
                "id": cid,
                "name": name,
                "is_reversed": random.random() > 0.7,
                "orientation": "upright",
            }
            for cid, name in pick
        ]
        lines = [
            "%s%s — %s" % (name, " перевёрнута" if cards[i]["is_reversed"] else "", MEANING_TPL[i % len(MEANING_TPL)])
            for i, (cid, name) in enumerate(pick)
        ]
        verdict = ("Да.", "Скорее да.", "Скорее нет.", "Нет.")[now % 4]
        if spread_id in ("daily", "single"):
            interpretation = {
                "intro": INTROS[now % len(INTROS)],
                "short_answer": ANSWERS[now % len(ANSWERS)],
                "advice": ADVICES[now % len(ADVICES)],
            }
            if spread_id == "single":
                interpretation["позиции"] = [
                    {"позиция": positions[0], "карта": "%s%s" % (pick[0][1], " перевёрнута" if cards[0]["is_reversed"] else ""),
                     "реверс": cards[0]["is_reversed"], "трактовка": MEANING_TPL[0]},
                ]
            else:
                interpretation["проявление"] = "день ровный, без резких изломов: всё, что откладывалось, мягко напомнит о себе."
                interpretation["на_что_смотреть"] = "смотри на повторяющиеся числа и слова — сегодня они не случайны."
                interpretation["траектория"] = {
                    "утро": "утро задаёт ритм: одно дело за раз, без метаний между вкладками.",
                    "день": "день подтверждает выбор: разговор, который ты откладывал, пройдёт легче, чем казался.",
                    "вечер": "вечер подводит итог: запиши три строки о дне — завтра они станут картой.",
                }
        elif spread_id == "yesno":
            interpretation = {
                "intro": INTROS[now % len(INTROS)],
                "short_answer": "%s %s" % (verdict, ANSWERS[now % len(ANSWERS)]),
                "позиции": [
                    {"позиция": positions[i], "карта": "%s%s" % (pick[i][1], " перевёрнута" if cards[i]["is_reversed"] else ""),
                     "реверс": cards[i]["is_reversed"], "трактовка": MEANING_TPL[i % len(MEANING_TPL)]}
                    for i in range(n)
                ],
                "связь_карт": "линия простая: за и против спорят, совет держит равновесие.",
                "advice": ADVICES[now % len(ADVICES)],
            }
        else:
            interpretation = {
                "intro": INTROS[now % len(INTROS)],
                "short_answer": ANSWERS[now % len(ANSWERS)],
                "позиции": [
                    {"позиция": positions[i], "карта": "%s%s" % (pick[i][1], " перевёрнута" if cards[i]["is_reversed"] else ""),
                     "реверс": cards[i]["is_reversed"], "трактовка": "%s %s" % (lines[i], lines[(i + 1) % n])}
                    for i in range(n)
                ],
                "связь_карт": SYNTHESIS[now % len(SYNTHESIS)],
                "advice": ADVICES[now % len(ADVICES)],
            }
        meta = {
            "spread_id": spread_id,
            "spread_name": spread_name,
            "positions": positions,
            "position_keys": position_keys,
        }
        return cards, interpretation, meta

    def _mock_readings(self):
        rows = []
        types = [
            "daily", "spread_single", "spread_three", "spread_yesno",
            "spread_mfd", "spread_shadow", "spread_pentagram", "spread_horseshoe",
        ]
        for i, t in enumerate(types):
            spread_id = "daily" if t == "daily" else t[len("spread_"):]
            _, _, n, _, positions = self._resolve_spread(spread_id)
            pick = random.sample(DECK, n)
            cards = [
                {"id": cid, "name": name, "is_reversed": (i + j) % 3 == 1}
                for j, (cid, name) in enumerate(pick)
            ]
            interp = {
                "intro": INTROS[i % len(INTROS)],
                "short_answer": ANSWERS[i % len(ANSWERS)],
                "позиции": [
                    {"позиция": positions[j], "карта": cards[j]["name"],
                     "реверс": cards[j]["is_reversed"], "трактовка": MEANING_TPL[j % len(MEANING_TPL)]}
                    for j in range(n)
                ],
                "связь_карт": SYNTHESIS[i % len(SYNTHESIS)],
                "advice": ADVICES[i % len(ADVICES)],
            }
            if spread_id == "daily":
                interp.pop("позиции")
                interp.pop("связь_карт")
                interp["проявление"] = "день ровный, без резких изломов."
                interp["траектория"] = {"утро": "одно дело за раз.", "день": "разговор пройдёт легче.", "вечер": "запиши три строки."}
            rows.append({
                "id": i + 1,
                "type": t,
                "question": "стоит ли менять работу?" if i % 2 else None,
                "created_at": "2026-08-%02dT12:00:00" % (10 + i),
                "cards_data": {"cards": cards, "spread_type": spread_id},
                "interpretation": interp,
                "character_id": "shadow_walker",
            })
        return rows

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/spread", "/api/spread/begin"):
            return self._json({"error": "unknown endpoint"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            payload = {}
        cards, interpretation, meta = self._draw_cards(payload)
        if parsed.path == "/api/spread":
            return self._json({"cards": cards, "interpretation": interpretation, **meta})
        # двухфазный: карты сразу, шёпот — через LLM_LATENCY секунд
        token = uuid.uuid4().hex[:20]
        with _pending_lock:
            _pending[token] = {
                "ready_at": time.time() + LLM_LATENCY,
                "interpretation": interpretation,
            }
        return self._json({"cards": cards, "token": token, **meta})


def _sweep():
    # выметаем забытые токены, чтобы реестр не тек
    while True:
        time.sleep(300)
        with _pending_lock:
            for t in [t for t, j in _pending.items() if time.time() - j["ready_at"] > 600]:
                _pending.pop(t, None)


def main():
    os.chdir(ROOT)
    threading.Thread(target=_sweep, daemon=True).start()
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[tarot-mock] serving {ROOT} on http://localhost:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
