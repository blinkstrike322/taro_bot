# ARCANUM local studio

Run from this worktree (Python environment with requirements.txt installed):

```sh
python scripts/dev_studio.py
```

Open http://localhost:3210/. Python API binds127.0.0.1:8097. This is the complete product UI using real authenticated API handlers and SQLite, with prepared guide-specific text. No Telegram login, SDK injection, model calls, polling or payments. `.local/studio-fixture.sqlite3` survives restart; launcher stops only its children and reports occupied ports without killing them.

`--reset-db` explicitly clears this studio DB and changes its namespace. `--api-only` starts only the backend for isolated tests. The outside-phone studio strip identifies prepared text and offers next-request delay/failure controls. Restart marks interrupted local jobs failed without redrawing or automatically spending money.

Live model mode is explicit:

```sh
python scripts/dev_studio.py --mode live --key-file /absolute/path/to/server.env --max-calls 10 --max-usd 0.05
```

This uses a separate database. Each provider hop, including quality retries, reserves a conservative upper cost before sending. Only the verified Ling3.0Flash/DeepInfra route and its price ceiling are allowed. `.local/studio-budget.sqlite3` persists across runs and DB resets; reservations are not refunded on ambiguous errors. The global allowable remainder is capped at4.99USD, reserving prior probes below0.001USD from the owner's5USD budget. No live call is needed to test UI changes. Never commit/copy secrets into the frontend.

Production export omits studio rewrites and bootstrap branch. Production authentication always validates actual Telegram initData and ownership. Studio dummy identity cannot authenticate to production. This is not a production deployment; real Telegram mobile gestures/keyboard and commercial tariff recovery still need release QA.
