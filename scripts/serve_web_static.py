"""Веб-only сервер для визуальной проверки фронтенда без бэкенда.

Раздаёт static/webapp и отвечает на /api/* заглушками (без БД, LLM,
Telegram). Нужен только чтобы флоу вебаппа проходил целиком: welcome →
карты → раскрытие → толкование.

Запуск: python3 scripts/serve_web_static.py [порт]   # по умолчанию 8080
"""
import json
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEBAPP = ROOT / "static" / "webapp"

CARDS = [
    {"id": "the-moon", "name": "Луна", "upright": "интуиция, туман", "reversed": "ясность",
     "is_reversed": False, "orientation": "upright", "image_url": ""},
    {"id": "two-of-wands", "name": "Двойка Жезлов", "upright": "выбор", "reversed": "застревание",
     "is_reversed": True, "orientation": "reversed", "image_url": ""},
    {"id": "ace-of-cups", "name": "Туз Кубков", "upright": "начало чувств", "reversed": "переполнение",
     "is_reversed": False, "orientation": "upright", "image_url": ""},
]

INTERPRETATION_DAILY = {
    "intro": "Три карты легли кольцом — это твой день, увиденный со стороны.",
    "short_answer": "День просит тихости: не разгоняйся, доводи начатое до маленьких завершений — и к вечеру придёт ясность.",
    "card_meaning": [
        "Энергия дня — Луна: интуиция громче логики, не спорь с ней.",
        "Вызов дня — Двойка Жезлов (пер.): соблазн распылиться на три дела сразу.",
        "Совет дня — Туз Кубков: одно маленькое искреннее действие оживит всё.",
    ],
    "advice": "Сделай одно дело медленно, как ритуал.",
}

INTERPRETATION_SPREAD = {
    "intro": "Вопрос услышан. Смотри: прошлое держит ниточку, настоящее тянет узел.",
    "short_answer": "Ситуация движется к развязке быстрее, чем кажется; главное — не дожимать силой там, где просят времени.",
    "card_meaning": [
        "Корень ситуации — Луна: часть фактов пока скрыта, и это нормально.",
        "Прямо сейчас — Двойка Жезлов (пер.): пауза, которую ты воспринимаешь как ловушку, на деле передышка.",
        "Куда ведёт — Туз Кубков: обновление через честный разговор.",
    ],
    "advice": "Напиши сообщение, которое откладываешь. Сегодня можно.",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[web-only] %s\n" % (fmt % args))

    def _send(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", ""):
            path = "/index.html"
        target = (WEBAPP / path.lstrip("/")).resolve()
        if not str(target).startswith(str(WEBAPP)) or not target.is_file():
            self.send_error(404)
            return
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()
        with open(target, "rb") as f:
            self.wfile.write(f.read())

    def do_GET(self):
        if self.path.startswith("/api/"):
            if self.path.startswith("/api/character"):
                self._send({"character_id": "shadow_walker"})
            elif self.path.startswith("/api/readings"):
                self._send({"readings": []})
            else:
                self._send({"ok": True})
            return
        self._static()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            body = {}

        if self.path == "/api/spread":
            is_daily = body.get("spread_type") in ("daily",) or (
                body.get("spread_type") in (1, "1") and not body.get("question")
            )
            count = 3 if is_daily or body.get("spread_type") in (3, "3") else 1
            interp = INTERPRETATION_DAILY if is_daily else INTERPRETATION_SPREAD
            self._send({
                "reading_id": 1,
                "cards": [{**c, "image_url": f"/cards/{c['id']}.webp"} for c in CARDS[:count]],
                "interpretation": interp,
                "mood": {"id": "svetlaya_luna", "name": "светлая луна"},
                "remaining": 9,
                "limit": 10,
            })
        elif self.path == "/api/followup":
            self._send({"answer": "Слушай внимательно: карта говорит не о событии, а о твоей ставке в нём.", "remaining": 14})
        else:
            self._send({"ok": True})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8080
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[web-only] static + stub API on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
