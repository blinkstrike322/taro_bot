# Taro Bot Processes

## Table of Contents

- [Local Development](#local-development)
- [Configuration (.env)](#configuration-env)
- [Database](#database)
- [Testing](#testing)
- [Card Conversion](#card-conversion)
- [WebApp Frontend (Next.js)](#webapp-frontend-nextjs)
- [Production Deploy (start.sh)](#production-deploy-startsh)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites

- Python 3.10 or later
- Node.js 18 or later
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- An OpenRouter API key (from [openrouter.ai](https://openrouter.ai/keys))

### Setup

```bash
# Navigate to the project
cd taro_bot

# Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

Dependencies (`requirements.txt`):

| Package | Purpose |
|---------|---------|
| aiogram >= 3.0.0 | Telegram Bot API framework |
| python-dotenv | Load .env file |
| pydantic-settings | Settings management with env validation |
| aiosqlite | Async SQLite database access |
| Pillow | Image processing (card conversion) |
| httpx | HTTP client for LLM API calls |
| aiohttp | HTTP server for WebApp backend |
| pytest | Test runner |
| pytest-asyncio | Async test support |

### Configure Environment

Copy `.env.example` to `.env` and fill in your credentials. See [Configuration](#configuration-env) below for details.

### Run the Bot (Full)

```bash
source .venv/bin/activate
python3 app.py
```

Starts both:
- The Telegram bot (polls Telegram API for updates)
- The WebApp HTTP server on port 8080

The WebApp needs an HTTPS tunnel for Telegram to load it. In production you use `start.sh`; for local testing with the bot alone (no WebApp), the bot works without a tunnel.

### Run Web-Only Mode

```bash
source .venv/bin/activate
python3 run_web_only.py
```

Starts only the aiohttp WebApp server on port 8080 without the Telegram bot. Useful for testing the frontend API endpoints. Routes:

| Method | Route | Handler |
|--------|-------|---------|
| GET | `/api/readings?tg_id=&year=&month=` | Fetch reading history |
| POST | `/api/card_pick` | Draw a single card |
| POST | `/api/spread` | Draw a spread with interpretation |
| GET | `/` | Serve Next.js static export |
| Static | `/pixel/` | Card pixel art images |

### WebApp Frontend (Next.js)

```bash
# Install frontend dependencies
cd web && npm install

# Development mode (hot reload on localhost:3000)
cd web && npm run dev

# Production build (exports to taro_bot/static/webapp/)
cd web && npm run build
```

The Next.js app is configured as a static export (`output: 'export'` in `next.config.mjs`). The build output goes to `../static/webapp/` (relative to the `web/` directory), which the aiohttp server serves at the root path.

After building, the backend serves the static files automatically. No separate process needed for the frontend in production.

NPM scripts (`web/package.json`):

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Dev server with hot reload |
| `build` | `next build` | Static export to `../static/webapp/` |
| `start` | `next start` | Next.js production server (rarely used; aiohttp serves the export) |

---

## Configuration (.env)

The `.env` file lives at the project root and is loaded automatically by `config.py` via `pydantic-settings`.

```env
BOT_TOKEN=your_telegram_bot_token_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
DB_PATH=taro_bot.db
WEBAPP_URL=http://localhost:8080
```

### Required Variables

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM card interpretations |
| `DB_PATH` | Path to SQLite database file (default: `taro_bot.db`) |
| `WEBAPP_URL` | Public HTTPS URL for the WebApp (auto-updated by `start.sh`) |

### How It Works

`config.py` defines a `Settings` class using `pydantic-settings` that reads from `.env`. The settings object is imported and used throughout the app:

```python
from config import settings

# Usage
bot_token = settings.BOT_TOKEN
db_path = settings.DB_PATH
```

The `WEBAPP_URL` is updated automatically during production deploy when `start.sh` runs. The bot uses this URL to set the Telegram WebApp button link.

---

## Database

Uses SQLite via `aiosqlite`. The database file is auto-created at `DB_PATH` (default `taro_bot.db`) on first run.

### Schema (`storage/db.py`)

**`users`** table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PK | AUTOINCREMENT | Internal user ID |
| `tg_id` | INTEGER UNIQUE | NOT NULL | Telegram user ID |
| `character_id` | TEXT | 'shadow_walker' | Active character guide |
| `created_at` | TEXT | datetime('now') | Account creation |
| `last_active_at` | TEXT | datetime('now') | Last interaction |
| `last_reminder_sent_at` | TEXT | NULL | Last reminder timestamp |

**`readings`** table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER PK | AUTOINCREMENT | Reading ID |
| `user_id` | INTEGER FK | NOT NULL | References users.id |
| `type` | TEXT | NOT NULL | `spread_1` or `spread_3` |
| `question` | TEXT | NULL | User's question |
| `cards_data` | TEXT | NOT NULL | JSON with cards and spread type |
| `interpretation` | TEXT | NOT NULL | JSON with LLM response |
| `character_id` | TEXT | 'shadow_walker' | Character used |
| `created_at` | TEXT | datetime('now') | Timestamp |

### Key Functions (`storage/db.py`)

| Function | Description |
|----------|-------------|
| `create_tables(db_path)` | Create tables if they don't exist |
| `get_or_create_user(db, tg_id)` | Look up or register a user |
| `save_reading(db, user_id, type, question, cards_data, interpretation, character_id)` | Store a reading |
| `get_user_readings_by_month(db, tg_id, year, month)` | Fetch readings for a given month |

---

## Testing

```bash
source .venv/bin/activate

# Run all tests
python3 -m pytest tests/ -v

# Run a specific test file
python3 -m pytest tests/test_tarot.py -v
```

### Test Coverage

| File | Tests |
|------|-------|
| `tests/test_tarot.py` | Card loading, drawing, image path resolution |
| `tests/core/` | Business logic (if present) |
| `tests/bot/` | Bot handlers (if present) |

### Writing Tests

Tests use `pytest` with `pytest-asyncio` for async support. Run by filename convention; no special test discovery config needed.

Example (`tests/test_tarot.py`):

```python
from core.tarot import draw_cards, load_cards, get_card_image

def test_load_cards():
    cards = load_cards()
    assert len(cards) == 78

def test_draw_one_card():
    cards = draw_cards(1)
    assert len(cards) == 1
    assert "orientation" in cards[0]
```

---

## Card Conversion

Converts 78 tarot card PNGs to a 16-bit pixel art style for the JRPG aesthetic.

```bash
source .venv/bin/activate
python3 scripts/convert_cards.py [--force]
```

### What It Does

The script (`scripts/convert_cards.py`) processes PNG images from anywhere and writes results to `static/pixel/`. The conversion pipeline:

1. **Downscale** to 64x96 pixels (NEAREST neighbor)
2. **Upscale** back to 256x384 (NEAREST neighbor) for the pixel-block look
3. **Quantize** colors to a custom 32-color dark/mystic palette (deep purples, indigos, golds, muted reds)
4. **Add border**: 2px black + 1px gold pixel border
5. **Generate card back** with rune/star pattern

### Options

| Flag | Description |
|------|-------------|
| `--force` | Re-convert all cards even if output exists |

### Output

- 78 PNG files in `static/pixel/` (e.g., `the-fool.png`, `the-magician.png`)
- One `back.png` for the card back design
- Files named by card slug matching the data in `data/cards.json`

### Requirements

The conversion uses Pillow (`PIL`), included in `requirements.txt`. Run from the project root so the `static/pixel/` output path resolves correctly.

---

## Production Deploy (start.sh)

`start.sh` is the production deployment script. It automates the full startup sequence.

### What It Does

1. **Kills old processes** -- any existing `python3 app.py`, `autossh`, and `localhost.run` processes
2. **Starts HTTPS tunnel** via `autossh` + `localhost.run` (port 80 mapped to localhost:8080)
3. **Waits for tunnel URL** (up to ~10 seconds) and extracts the `.lhr.life` address
4. **Updates `.env`** -- sets `WEBAPP_URL` to the current tunnel URL
5. **Starts the bot** -- launches `python3 app.py` in the background
6. **Cleans up on Ctrl+C** -- kills both the bot and the SSH tunnel

### Run

```bash
./start.sh
```

### How the Tunnel Works

- `autossh` maintains a persistent SSH reverse tunnel to `localhost.run`
- Remote port 80 forwards to local port 8080
- Auto-reconnects on failure (`ServerAliveInterval 30`, `ServerAliveCountMax 3`)
- Tunnel URL is scraped from `/tmp/localtunnel.log`

### Telegram WebApp Requirement

Telegram requires the WebApp URL to use HTTPS. The `localhost.run` tunnel provides a public HTTPS endpoint (`https://*.lhr.life`) that forwards to the local aiohttp server. Without this tunnel, the WebApp button in Telegram won't load.

---

## Project Structure

```
taro_bot/
├── app.py                 # Main entry point (bot + web server)
├── config.py              # Settings via pydantic-settings
├── run_web_only.py        # Web-only mode (no bot)
├── start.sh               # Production deployment script
├── requirements.txt       # Python dependencies
├── .env                   # Local environment config (gitignored)
├── .env.example           # Env template with placeholder values
├── taro_bot.db            # SQLite database (auto-created, gitignored)
│
├── bot/                   # Telegram bot logic
│   ├── __init__.py
│   ├── router.py          # Route registration
│   ├── handlers.py        # Message/command handlers
│   └── webapp_handler.py  # WebApp interaction handlers
│
├── core/                  # Business logic
│   ├── __init__.py
│   ├── tarot.py           # Card drawing, loading, images
│   ├── llm.py             # OpenRouter LLM client
│   └── reminder.py        # Daily reminder loop
│
├── storage/               # Data access layer
│   ├── __init__.py
│   ├── db.py              # SQLite queries
│   └── models.py          # Data models
│
├── data/                  # Static data
│   └── cards.json         # 78 tarot card definitions
│
├── static/                # Static assets
│   ├── webapp/            # Next.js static export (auto-generated)
│   └── pixel/             # Pixel art card images (auto-generated)
│
├── scripts/               # Utility scripts
│   └── convert_cards.py   # PNG to pixel-art converter
│
├── tests/                 # Test suite
│   ├── test_tarot.py      # Card system tests
│   ├── core/              # Core logic tests (if present)
│   └── bot/               # Bot handler tests (if present)
│
├── web/                   # Next.js frontend
│   ├── package.json
│   ├── next.config.mjs
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   └── src/               # React components and pages
│
├── art_references/        # Design reference images (gitignored)
│
└── DESIGN.md              # Architecture and design notes
```

---

## Troubleshooting

### Bot Not Responding

**Check BOT_TOKEN in `.env`.** The token must match what @BotFather gave you. A wrong token causes the bot to fail silently during polling startup. Verify by running:

```bash
source .venv/bin/activate
python3 -c "from config import settings; print(settings.BOT_TOKEN[:10] + '...')"
```

If the token is missing or invalid, the aiogram client will log an error during initialization.

### LLM Not Working

**Check OPENROUTER_API_KEY in `.env`.** Card interpretations use OpenRouter to call DeepSeek/Nemotron models. If the key is missing, expired, or has insufficient credits, the interpretation endpoint returns an error. Verify:

```bash
source .venv/bin/activate
python3 -c "from config import settings; print(settings.OPENROUTER_API_KEY[:10] + '...')"
```

The app uses a fallback chain: DeepSeek V3 first, then Nemotron, then a cached response if all API calls fail.

### WebApp Blank

**Rebuild the Next.js frontend.** The aiohttp server serves the static export in `static/webapp/`. If that directory is missing or stale, the WebApp shows a blank page.

```bash
cd web && npm run build
```

This runs `next build` and writes the output to `../static/webapp/`. After the build, restart the server.

### Port Conflict (8080 Already in Use)

The aiohttp server listens on port 8080 by default. If something else is using it:

```bash
# Find what's on port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>
```

To change the port, edit the `web.TCPSite` call in `app.py` (line 116 area):

```python
site = web.TCPSite(runner, "0.0.0.0", 8080)  # Change 8080 to your port
```

After changing the port, update `WEBAPP_URL` in `.env` accordingly: `WEBAPP_URL=http://localhost:YOUR_PORT`.

### Tunnel Fails (start.sh)

If `start.sh` exits with "ERROR: Could not get tunnel URL":

```bash
# Check the tunnel log
cat /tmp/localtunnel.log

# Verify autossh is installed
which autossh

# Test SSH connectivity manually
ssh -o StrictHostKeyChecking=no -R 80:localhost:8080 nokey@localhost.run
```

Common causes:
- `autossh` is not installed (`brew install autossh` on macOS)
- Local SSH is not configured or has broken keys
- Network blocks the SSH outbound connection

### Database Issues

The SQLite file `taro_bot.db` is auto-created. If tables are missing:

```bash
source .venv/bin/activate
python3 -c "import asyncio; from storage.db import create_tables; asyncio.run(create_tables())"
```

To inspect the database manually:

```bash
sqlite3 taro_bot.db ".tables"
sqlite3 taro_bot.db "SELECT * FROM users;"
sqlite3 taro_bot.db "SELECT COUNT(*) FROM readings;"
```

### Virtual Environment Issues

If `pip install -r requirements.txt` fails, ensure you're using Python 3.10+:

```bash
python3 --version
```

If you see a `pydantic-settings` import error, the package is missing or the environment isn't activated:

```bash
source .venv/bin/activate && pip install -r requirements.txt
```

### Card Conversion Problems

If `scripts/convert_cards.py` fails:

- Ensure Pillow is installed (`pip install Pillow`)
- Run from the project root directory (paths are relative to `taro_bot/`)
- Input PNGs should be at least 256x384 pixels for good results
- Use `--force` to overwrite existing output files
