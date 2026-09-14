# Product Analytics (provider-agnostic)

The tarot-bot records shape-only product analytics into a single, vendor-neutral
`events` table. There is **no external analytics vendor**. A vendor can be
attached later by either consuming the `events` table or replacing the body of
`storage/events.py` — **without touching a single call site**.

## Privacy rule (non-negotiable)

Only **shapes** are ever recorded: `spread_type`, `count`, `guide`,
`provider`, `model`, `latency_ms`, `fallback_used`, `error_type`, outcomes.
**Never** log question text, card names, or interpretation content. Both the
Python `log_event` (which rejects non-JSON and unknown events) and the
TypeScript `track` (closed event union + scalar-only props) enforce/depend on
this rule.

## The `events` table

```
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,            -- nullable: anonymous/unknown-user events
    tg_id      INTEGER,
    event      TEXT    NOT NULL,
    props      TEXT    NOT NULL DEFAULT '{}',  -- JSON, shape only
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
)
```

Created migration-safely (`CREATE TABLE IF NOT EXISTS`, no backfill) in
`storage/db.py`. `log_event(db, tg_id, event, props, *, user_id=None)` performs
one `INSERT` + `commit`, no joins. The generic, vendor-agnostic `log_event`
raises on programmer error only (`ValueError` unknown event, `TypeError`
non-JSON props); call sites use `safe_log_event`, which swallows and logs
server-side so analytics can never break a spread, payment, or render.

Two emit paths land in the same table:

- **Server-side** (`safe_log_event` at real decision points) — authoritative
  lifecycle with rich parameters.
- **Client-side beacon** (`track()` in `web/src/lib/analytics.ts`) — UX timing,
  fire-and-forget `POST /api/events`, initData-verified, rate-limited per user
  (120/min), never surfaces an error to the UI.

## Event catalog

### Server-side (backend)

| event | meaning | props |
|---|---|---|
| `spread_begin` | a spread slot was reserved | `guide`, `spread_type` |
| `spread_complete` | whisper finished | `guide`, `spread_type`, `provider`, `model`, `latency_ms`, `fallback_used` |
| `spread_fail` | whisper failed | ...complete + `error_type` |
| `quota_refused` | quota rejected | `guide`, `spread_type`, `needs_subscription` |
| `subscription_activated` | payment activated | `first_month` |
| `subscription_expired` | expiry/ renewal reminder sent | `days_left` |
| `history_open` | journal opened (server served readings) | `{}` |

### Client-side (beacon)

| event | meaning | props |
|---|---|---|
| `guide_selected` | operator changed guide | `guide` |
| `daily_started` | daily-card flow launched | `guide`, `spread_type` |
| `spread_started` | question spread launched | `guide`, `spread_type`, `count` |
| `card_revealed` | a card was flipped | `spread_type`, `count` |
| `interpretation_ready` | whisper delivered | `{}` |
| `interpretation_failed` | whisper error | `error_type` |
| `history_opened` | journal opened (backward-compat alias of `history_open`) | `{}` |
| `paywall_shown` | paywall surfaced (subscription needed) | `{}` |

Server and client events are complementary views: server = authoritative
lifecycle, client = UX timing. A vendor sink can dedupe by
`(tg_id, event, created_at)` window if needed.

## Attaching an external vendor later

The single seam is `storage/events.py` (`log_event` / `safe_log_event`) and the
server-side beacon handler `handle_events` in `app.py`. To add e.g.
PostHog/Amplitude/S3-parquet:

1. Keep the closed `EventName` union and the existing call sites untouched.
2. Add the sink in `log_event` (or in a listener subscribed to `events` rows)
   — emit to the vendor in the background.
3. Keep the `events` table as the durable source of truth (idempotent export to
   the vendor from the table, e.g. a batch job reading `id > last_export_id`).

Do **not** log full question/card/interpretation payloads into the vendor.