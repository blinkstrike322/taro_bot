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
PORT = int(os.environ.get("PORT", "3000"))

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
POSITIONS = ["прошлое", "настоящее", "будущее"]
MEANING_TPL = [
    "то, что ушло, всё ещё держит тебя за рукав.",
    "ты стоишь на перекрёстке, и это честнее, чем кажется.",
    "будущее просит не скорости, а направления.",
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
            return self._json({
                "readings": [
                    {
                        "id": i + 1,
                        "type": ["daily", "1", "3"][i % 3],
                        "question": "стоит ли менять работу?" if i % 2 else None,
                        "created_at": "2026-08-%02dT12:00:00" % (10 + i),
                        "cards_data": [],
                        "interpretation": {},
                        "character_id": "shadow_walker",
                    }
                    for i in range(6)
                ]
            })
        if parsed.path.startswith("/api/"):
            return self._json({"error": "unknown endpoint"}, 404)
        return super().do_GET()

    def _draw_cards(self, payload):
        n = 3 if payload.get("spread_type") == 3 else 1
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
        meanings = [
            "%s%s — «%s»: %s" % (
                name, " перевёрнута" if cards[i]["is_reversed"] else "",
                (POSITIONS if n == 3 else ["послание"])[i],
                MEANING_TPL[i] if i < len(MEANING_TPL) else "тише — и увидишь.",
            )
            for i, (cid, name) in enumerate(pick)
        ]
        interpretation = {
            "intro": INTROS[now % len(INTROS)],
            "short_answer": ANSWERS[now % len(ANSWERS)],
            "card_meaning": meanings,
            "advice": ADVICES[now % len(ADVICES)],
        }
        return cards, interpretation

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/spread", "/api/spread/begin"):
            return self._json({"error": "unknown endpoint"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            payload = {}
        cards, interpretation = self._draw_cards(payload)
        if parsed.path == "/api/spread":
            return self._json({"cards": cards, "interpretation": interpretation})
        # двухфазный: карты сразу, шёпот — через LLM_LATENCY секунд
        token = uuid.uuid4().hex[:20]
        with _pending_lock:
            _pending[token] = {
                "ready_at": time.time() + LLM_LATENCY,
                "interpretation": interpretation,
            }
        return self._json({"cards": cards, "token": token})


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
