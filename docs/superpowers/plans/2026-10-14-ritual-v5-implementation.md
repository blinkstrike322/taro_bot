# ARCANUM Ritual v5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first product UI with the accepted v5 ritual, connected to durable sessions and a complete local studio, including the owner's additional calendar, persona gallery and backward reading gesture.

**Architecture:** Keep Next/React static production export and Python/aiohttp/SQLite. The studio uses the same authenticated handlers with a dummy signing token and a separate persistent database. Server owns reading/discussion contents; browser owns account-scoped navigation, disclosure and scroll anchors.

**Tech Stack:** Existing Next16, React19, TypeScript, vanilla CSS, Python3.14 environment, aiohttp, aiosqlite, pytest, Vitest. No new product framework.

**Spec:** docs/superpowers/specs/2026-10-14-ritual-v5-design.md, including its 14 October owner addendum.

## Global Constraints

- Full localhost on http://localhost:3210/; Python binds loopback8097. No Telegram login/demo gate in studio.
- Four bottom sections: Home, Spreads, Journal, Guides. Guide selection only fourth section; immutable guide snapshot per reading.
- Keep all eight canonical server spreads with1/1/3/3/3/6/6/7 cards, all78 card URLs and orientations.
- Whole2:3 artwork, English labels baked in three approved samples, separate alpha frame; legacy art no second frame. No DOM card-title/numeral overlay.
- Reading:44px right dot targets, native text scrolling, one deliberate gesture begun at end advances one card; at start the reverse gesture selects previous card. Left returns to table. All-open permits natural inline summary/discussion.
- One-second document-only intro; real restored destination underneath; reduced motion and keyboard alternatives.
- Guide accents #ADA5D3 / #C7A369 / #C87879 against #050505. Coating is separate future preference, no theme store now.
- Fixture mode never calls models/Telegram, even with real env credentials. Live requires explicit flag and bounded accounting; no deployment, bot polling or payments in studio.
- Preserve existing main checkout and committed prototype. User approved implementation; do not ask the same approval again.

## Review Focus

- Lost begin response plus preference change: replay must restore original guide/cards, new question with same key409 (Task1 regression).
- Lost discussion response/reload/navigation: one persisted operation, server-derived context and no response appended to another reading (Tasks1/3).
- Gesture begun mid-text/inertia/input selection: no accidental advance/reverse, both edges and first/last boundaries safe (Task3 tests).
- Midnight/month/year/timezone boundary: journal calendar and list use same local date; empty month distinct from API outage (Task3 tests).
- Startup on saved reading while API offline/reset: no home flash or cached foreign content, retry preserves operation, DB identity changes namespace (Tasks2/3).

## Task 1: Durable reading conversations and recovery

**Files:** modify app.py, storage/db.py; create storage/conversations.py, core/session_api.py; test tests/test_ritual_sessions.py and update tests/test_session_integrity.py expectation superseded by accepted spec.

**Interfaces:** Existing begin/poll/session stay compatible. Begin/session add character_id, question, created_at, reading_id. Session accepts token or reading_id with ownership. POST /api/readings/{reading_id}/followups consumes {operation_key, question, card_index:number|null}; GET same path lists persisted rows {operation_key,question,card_index,character_id,status,answer,error,created_at}. POST /api/spread/retry consumes {token,operation_key}; returns same token/status. GET/POST /api/preferences exposes notifications_enabled, reusing existing reminder setting. No context from browser accepted by new followup endpoint.

- [ ] RED: fresh user POST character then GET returns chosen; replay begin after changing preference returns old guide/cards; unknown spread and blank required question400; same-day daily returns same reading. Write API tests and run pytest tests/test_ritual_sessions.py.
- [ ] GREEN: upsert guide, validate explicit canonical IDs before legacy resolver, operation lookup before current preference; daily existing row replay. Preserve compatibility for legacy numeric1 blank→daily.
- [ ] RED: concurrent followup requests with same key invoke provider once, replay after DB reconnect, changed payload409, wrong owner403, server prompt uses stored guide/question/cards. Failed generation persists failed operation. Retry failed reading same cards, same retry key one call, new retry respects quota; settings authenticate.
- [ ] GREEN: add durable followup table and retry-attempt table. Claim through atomic SQLite statements. Background followup tasks run independently of disconnected client; GET/session recover. Failed reading retry atomically changes status with quota guard (one slot, no redraw), distinct attempt timestamp. Never restart failed/pending requests automatically in production.
- [ ] Run focused tests then full pytest; commit backend task.

## Task 2: Persistent local studio

**Files:** create scripts/studio_api.py, scripts/dev_studio.py, scripts/studio_fixtures.py, scripts/studio_budget.py, docs/LOCAL_STUDIO.md; modify web/next.config.ts, web/src/lib/api.ts; create web/src/lib/runtime.ts; tests/test_studio.py.

**Interfaces:** `python scripts/dev_studio.py` starts both owned children; `--api-only` for tests. Default fixture DB .local/studio-fixture.sqlite3, live separate .local/studio-live.sqlite3. GET /__studio/bootstrap returns {init_data,user_id,namespace,mode}; /__studio/control supports deterministic failure-next and slow-next for fixture only. Explicit --reset-db changes persisted namespace. Next rewrites /api and /__studio only with ARCANUM_STUDIO=1 and development. `initializeRuntime():Promise<Runtime>` provides authenticated runtime before API use; `authHeaders()` uses initialized dev identity or real Telegram initData, never public-env embedded signed credentials.

- [ ] RED: isolated fixture starts with supplied malicious real credentials but no outbound calls; bootstrap signature valid only dummytoken; full production create_webapp has no bootstrap; namespace stable restart/changes reset; occupied port exits without killing others; local interrupted rows failed preserving cards.
- [ ] GREEN: implement loopback runner, explicit env isolation before importing config, proper cleanup, startup probe and child ownership. Fixtures use actual78-card draw, guide-specific prepared text and configurable delays/failure; local UI clearly labels outside phone. Existing temporary harness remains usable.
- [ ] RED/GREEN: budget ledger reserves cost before every live provider hop, bounded calls and dollars survive restart, no automatic retries outside limiter. Explicit live key file only read server-side. No live test calls necessary for this migration.
- [ ] Run pytest tests/test_studio.py then full suite; commit runtime task.

## Task 3: Accepted scene, ritual and personal library

**Files:** replace web/src/components/premium/PremiumApp.tsx and web/src/app/premium.css; update TarotArtwork.tsx, premium.ts, api.ts. Create focused components RitualScene.tsx, RitualReading.tsx, Journal.tsx, GuideGallery.tsx, Settings.tsx; lib/ritualState.ts, ritualGestures.ts, journalCalendar.ts; tests under web/src/lib/__tests__/ritual*.test.ts and journalCalendar.test.ts plus component interaction test if needed. Copy approved delivery art into web/public/premium/ritual-v5; generated guide portraits versioned with prompts in docs/design-work.

**Interfaces:** State v2 is keyed by runtime.namespace+user_id; stores draft + operation, selected screen/session id, per-reading revealed indices/index/semantic scroll anchors and pending followup/retry IDs. Server content read after authorization. New API functions `getReadingSession(tokenOrId)`, `getReadingFollowups(id)`, `submitReadingFollowup(id,payload)`, `retryReading(token,key)`, `getPreferences()/savePreferences()` consume Task1 contracts. `gestureIntent(start,current,boundary)` pure decision tested; UI event adapter preserves native scrolling. `monthGrid(year,month)` Monday-first and `localReadingDay(createdAt)` shared list/grid date.

- [ ] RED: state hydration invalid indices rejected, two namespaces don't mix; uncertain begin keeps frozen operation; gesture midtext/inertia no advance, deliberate end advances one, top previous no first-card wrap, inputs protected; December→January/leap year and UTC timestamp local day calendar.
- [ ] GREEN: implement state/calendar/gesture helpers and API contract adapters, run Vitest.
- [ ] Build scene from approved v5 CSS/assets:12 logical planes/3 movement groups, static while reading, Forum/Plex16px prose, safe areas. Intro once per document, restoration underneath, errors inline. Question includes bottom-sheet spread selector and single submit; no setup route or guide choice there. Table uses actual spread geometry. Reveal opens reading immediately.
- [ ] Implement linked reading with full current card text, dots, forward/back edge gestures, left table, inline summary after all open and persisted discussion. Retry connection only polls same operation; explicit retry text uses retry endpoint. Telegram Back closes sheet then reading→table→home; close saves.
- [ ] Implement journal month arrows/full calendar/day filter + recent reading thumbnails. Load all month via month endpoint; empty/loading/error distinct. Clicking item uses server reading_id and retained disclosure; finished historic records readable and discussion persists.
- [ ] Guide gallery uses three tall illustrated personas, selection highlight and voice excerpt below, one save action; current preference fetched/saved server. Small settings entry outside main tab count; effects toggle functional, notification toggle existing server setting, sound off/no audio engine introduced; no inert future coating/language controls.
- [ ] Run Vitest, TypeScript, lint changed components and Next production build; commit frontend task.

## Task 4: Integrated acceptance and release notes

**Files:** docs/LOCAL_STUDIO.md, docs/design-work/implementation-v5-report.md, screenshots; fixes limited to failures found in Tasks1–3 with regression tests.

- [ ] Run studio normally and inspect browser through CUA (no Playwright routing/injected identity). All8 spreads, guides before first reading, daily replay, forward/back/left gestures, journal month/day + discussion restore.
- [ ] Check320/360/390/430 widths and reduced motion;1s intro on fresh load only; cards whole, all78URL200. Verify API restart persistence, fixture forced failure/retry without redraw, unavailable bootstrap preserves saved destination, no accidental provider calls.
- [ ] Full pytest/Vitest/TypeScript/build, git diff whitespace. Independent final review if agent service available; otherwise explicitly record self-review and limitation. Do not claim real Telegram device verification.
- [ ] Commit evidence, leave local studio running and open localhost3210 for owner. No push/deploy. Deck78art, paid launch/pricing, coatings/localization and actual-device QA remain follow-on work.
