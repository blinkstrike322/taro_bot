# Local full-flow architecture audit

Read-only code inspection, 2026-10-13. This is a proposed design for approval, not implemented behavior. No service was started, no credential was read, and no provider or Telegram request was made.

## Scope and required outcome

Opening the supported localhost development command must automatically provide a local account, the real API handlers, and all eight spreads. The user follows the complete question → spread → draw → reveal → reading → follow-up → journal workflow. No “open Telegram” gate or opt-in three-card demonstration precedes it. Local interpretation text is a clearly identified fixture by default; controlled OpenRouter testing is a separate launch mode. Production continues to require verified Telegram initData and ownership checks.

The fourth persistent bottom tab is the sole guide-selection surface. Home, setup, header, ritual, and reading may identify the current guide but must not contain a guide selector or alternate shortcut that performs selection. Existing sessions preserve the guide captured when created; changing the saved preference affects subsequent readings.

## What exists and where it stops working

| Area | Evidence in current source | Consequence |
| --- | --- | --- |
| Local harness | `scripts/serve_premium_test.py` calls `create_webapp()` with a dummy signing key and temporary database; adds `/__test_identity`; patches `interpret_reading`, `_ask_llm`, and `draw_cards` | Good real-handler integration seam, but identity is not automatically supplied to ordinary browser users and each server restart loses the database |
| Browser routing | `scripts/premium_e2e.mjs` intercepts Telegram SDK and every `/api/**` request | The full local API path currently exists inside Playwright, not in normal localhost browsing |
| Next development | `web/package.json` runs only `next dev -p 3000`; `web/next.config.ts` has no API rewrite; no `web/src/app/api` routes exist | Normal Next dev cannot reach the Python API by same-origin `/api` requests |
| Browser gate | `PremiumApp.tsx` calls `hasTelegramAuth()`, renders Telegram-only copy, and offers `switchPreview(true)` | Ordinary localhost users enter an unauthenticated partial experience |
| Preview | `previewSession()` always uses Moon/Fool/Hermit and `spreadId: three`; `begin()` rejects other preview spreads | This is a three-card showcase, not the full local workflow |
| Deck | `core/tarot.py` samples the complete `data/cards.json` deck and assigns upright/reversed orientation; harness `fixed_cards()` repeats a fixed upright prefix | Production draw mechanics already support the real deck, but default fixture behavior does not explore it |
| Guide | `POST /api/character` validates/authenticates, then calls `update_character()`; storage only performs UPDATE | On a fresh identity without an existing user row, the API reports success but saves nothing. The first begin creates a default guide user, so the first reading can use the wrong voice |
| Guide snapshot | `_create_spread_context()` takes guide from the user's database row, ignores request `character_id`, and fingerprints that guide | Frontend currently POSTs guide again before every begin; an old pending operation can overwrite a newer preference, and concurrent-tab preference changes can invalidate retry fingerprints |
| Sessions | begin durably reserves an operation before draw; DB enforces per-user idempotency; session endpoint verifies owner and returns canonical cards/question/guide/result | Strong foundation; preserve it rather than create a parallel browser-only API |
| Poll failure | `/api/spread/poll` returns a terminal failed result; UI “Проверить чтение” only polls again | Poll retry restores connectivity but cannot regenerate a failed interpretation |
| Restart | Main production startup sweeps reservations older than 15 minutes; harness does not sweep; no unfinished-task resume worker exists | A recent interrupted generation can remain pending with no task running. Completed sessions survive only if the same DB survives |
| Reveal progress | `PremiumSession.revealed` is in account-scoped localStorage; server restore filters its indices against canonical cards | Refresh on the same browser preserves reveal progress; it is not server or cross-device progress |
| Journal | `/api/readings?all=1` returns completed content, capped at 500; history entries become `history:<id>` without a resumable server token | Completed original readings persist in DB; pending and failed sessions are absent from journal; history is not a complete session document |
| Follow-up | `/api/ask` authenticates, validates card metadata, and generates from client-provided context; it has no reading ownership link, operation key, or database save | Active session follow-ups survive same-browser refresh, but history follow-ups disappear when leaving `viewedSession`; network retry can duplicate paid generation |
| Error classification | `spreadPoll()` and `getAllReadings()` throw generic Errors on non-2xx; restore clears session on 401/403/404 | UI cannot reliably distinguish auth expiration, API outage, wrong owner, reset local DB, and unknown session |
| Earlier launchers | `run_webapp_dev.py` imports handlers no longer present and signs a fixed old auth date; `serve_web_static.py` serves legacy `/api/spread` stubs | Neither is a supported launcher for the current premium application |

## Minimal runtime design

Use one application workflow and one real backend session implementation. Introduce a small runtime/identity boundary, not duplicate handlers or a client-only mock journal.

| Runtime | Identity | Interpretation | Database | Telegram side effects |
| --- | --- | --- | --- | --- |
| `telegram` | Actual Telegram SDK initData, verified by existing server function | Existing production provider configuration | Production configured DB | Existing production behavior |
| `local-fixture` (development default) | Dummy local account signed by local dummy BOT_TOKEN | Fixture implementation of every exposed model-backed feature | Dedicated persistent local fixture DB | None; `create_webapp(bot=None)` only |
| `local-openrouter` (explicit) | Same isolated dummy-account mechanism | Explicit OpenRouter model/provider settings | Separate persistent local live-test DB | None |
| E2E fixture | Local dummy account | Controlled deterministic fixtures/faults | New ephemeral DB per run | None |

Keep `verify_telegram_init_data()` unchanged. Local signatures are accepted only by the local process configured with the dummy token. Production does not register local bootstrap/fault/reset routes and cannot accept a local signature with its real token. Do not enable local identity from hostname alone, a query parameter, or presence of a provider key. Production build must reject any local runtime configuration.

### Exact proposed startup contract

From `app/web`, `npm run dev` invokes a project launcher that owns both Python API and Next dev. A dedicated internal `dev:web` script can still run Next alone for the launcher. Default visible address: `http://localhost:3000`; Python API: `127.0.0.1:8097`. The launcher prints both addresses, runtime, and resolved local DB path. It waits for API readiness before advertising the frontend as ready, fails clearly on an occupied port, forwards Ctrl+C, and shuts down only its own children. Host binding stays loopback.

Default local DB: `app/.local/premium/fixture.sqlite3`, ignored by Git. It is created/migrated on first launch; one stable local account (`919191`) is created before the frontend can select a guide. Default account uses the existing tester quota path, not administrator privileges, so repeated examination of all eight spreads is available. E2E launches use `--ephemeral` and normal quotas where quota behavior is under test. An explicit reset operation rotates a database-instance ID; it does not silently delete history on startup.

Next dev rewrites `/api/:path*` and `/__local/:path*` to this loopback API. Those rewrites exist only in an explicit local runtime; production static export remains unchanged. Card/guide/premium assets continue to come from Next's existing public directory.

The launcher overwrites dummy `BOT_TOKEN`, disabled Zen fields, local account IDs, and isolated `DB_PATH` before importing config. Fixture mode explicitly overwrites/neutralizes OpenRouter configuration and installs model stubs for every reachable model-backed endpoint, not just spread/follow-up. It must not inherit usable keys through `.env`. A controlled live launch explicitly enables OpenRouter, retains dummy Telegram configuration, disables Zen, requires an operator-selected allowed model and finite request/token budget, and uses `app/.local/premium/openrouter.sqlite3`. Merely finding a key never changes fixture mode to live mode. Budget counts outbound provider attempts, including application retries and validation retries, not only user clicks.

Proposed explicit launch: `npm run dev:openrouter -- --model <allowed-id> --max-provider-calls <N>`. Secret values stay backend-only and are never emitted in a URL, frontend variable, bootstrap response, or startup log. This command is a design contract, not an existing command.

### Bootstrap and frontend identity interface

Local-only `GET /__local/bootstrap`, `Cache-Control: no-store`:

```ts
type LocalBootstrap = {
  runtime: 'local-fixture' | 'local-openrouter';
  account: { id: number; first_name: string };
  init_data: string; // fresh dummy signature; same normal API auth transport
  expires_at: string;
  storage_namespace: string; // runtime + stable account + DB instance ID
  capabilities: { live_model: boolean; telegram_share: false };
};
```

Frontend owns a centralized `RuntimeSession` with phases `loading | ready | unavailable`, the account/storage namespace, and an auth-header accessor. In local mode it fetches bootstrap before localStorage hydration, character fetch, session restoration, or any begin request. In production it uses actual SDK identity. `api.ts` reads this single identity source; callers no longer infer availability from `window.Telegram` or an arbitrary `NEXT_PUBLIC_DEV_MOCK_INITDATA` string. Local runtime need not counterfeit the whole Telegram SDK; optional ready/expand/haptic calls may remain production-only adapters.

Loading shows the actual application shell and a short connecting state. Local bootstrap/API failure shows “Не удалось подключиться к локальному серверу” and retry, preserves the draft, and never redirects the user to Telegram or a three-card preview. Re-bootstrap once for local auth expiration, then retry the same operation key. Production auth failure uses production-specific recovery copy. Browser storage keys include the local bootstrap namespace or actual Telegram account; local fixture, local live, preview (if retained separately), and production data never share a key.

## Session and persistence contracts

The server owns immutable question, spread ID, ordered cards, orientation, position keys/names, captured guide, original creation time, generation status, and interpretation. Browser storage owns an editable draft and presentation progress (screen, selected card, revealed indices); it may cache a complete session, but restores the canonical server document before treating it as authenticated saved content.

### Begin / replay

Keep `POST /api/spread/begin` and its durable idempotency key. Save an immutable operation snapshot before transport: spread, trimmed question, captured guide, operation key. Lock changes to that snapshot while transport outcome is uncertain; bottom navigation can remain visible and usable. A lost response, reload, or 5xx reconnect repeats the exact operation key. No new cards, quota charge, or model task is created by replay.

Return `character_id`, canonical `question`, and `created_at` in begin/replay responses, alongside existing `reading_id`, token, cards, positions, position keys, spread ID/name, and status. `sessionFromBegin` must use these fields rather than reconstructing guide/time locally. Store `reading_id`, `position_keys`, and server status in `PremiumSession`.

Fix fresh-account guide saving by ensuring the authenticated user exists before POST character update; this applies equally to Telegram and local accounts. The Guides tab updates the saved account preference; setup only displays its name. Begin must not POST a preference update as a hidden side effect.

For correct retry after the preference changed in another tab, resolve an existing `(owner, operation_key)` before looking at the current preference. Verify repeated spread/question and captured guide against the existing operation snapshot; then return that operation. A new operation captures the current authenticated saved preference. If the new-operation request sends an expected guide/version that no longer matches the preference, return a typed conflict before reserve/draw and allow the user to review it. Never change the guide of an already-created reading.

### Restore / polling / generation retry

`GET /api/spread/session?token=...` remains the canonical restore call; add `created_at`, saved follow-ups, and status metadata. Keep ownership checks. Production account mismatch/unknown session must never reveal another account's cached question/cards; local DB-reset detection can clear that namespace and explain “Локальные данные были сброшены”. Network failure preserves the draft/session cache and offers reconnect.

Distinguish these user actions:

1. **Reconnect/check** reads the existing session/poll with no provider call.
2. **Retry interpretation** is an explicit action for a terminal failed reading and reuses the same fixed cards/question/guide.
3. **New reading** intentionally creates a new operation and draw.

Proposed `POST /api/spread/retry` body `{ token, idempotency_key }`, authenticated as normal. It checks ownership, deduplicates by retry-operation key, atomically claims only a failed generation, reacquires quota eligibility if the earlier failure released it, and starts one interpretation attempt without redrawing. Processing/completed replay returns existing state. Response uses the same session shape. Local live retries obey the provider budget. A failed draw with no persisted cards cannot be repaired by interpretation retry: retain the error and explicitly start a new reading.

A retry claim needs attempt/start timestamp metadata separate from original `created_at`; stale sweeping must use current generation timing. On API restart, completed data remains readable. A local single-process startup can explicitly fail orphaned reserved/processing attempts as interrupted while retaining fixed cards; user retries interpretation. Do not silently resume paid requests on startup. Any production orphan recovery changes must account for multiple live workers, rather than treating all processing rows as locally orphaned.

Polling returns typed status/error codes and uses `ApiError` consistently. A frontend timeout does not mark the server failed and does not create a new session. After 180 seconds it stops active polling and offers check-later for the same token. Unknown/malformed spread IDs and empty required questions must be rejected before reserve; current `resolve_spread()` silently falls back to daily and makes the later missing-question guard ineffective.

### Follow-up and journal

Add a reading-linked path to existing `POST /api/ask`:

```ts
type ReadingFollowupRequest = {
  reading_id: number;
  question: string;
  card_index: number;
  idempotency_key: string;
};
type SavedFollowup = {
  id: number;
  idempotency_key: string;
  card_index: number;
  question: string;
  status: 'processing' | 'completed' | 'failed';
  answer: string | null;
  fallback: boolean;
  error: string | null;
  created_at: string;
};
```

Server verifies ownership and completed original interpretation, resolves selected card/position/question/summary/guide from the saved reading, and never draws another card. A small `reading_followups` table has a unique `(reading_id, idempotency_key)` claim. Initial synchronous success returns the persisted follow-up; duplicate in-flight returns 202 with operation status; reconnect reads canonical session/by-ID details until complete. This keeps repeated transport from creating another paid answer. Failed operations are visible and can be explicitly retried; canned fallback is saved and marked, never described as a live answer. Legacy `/api/ask` context callers can remain compatible separately; the new premium workflow uses the reading-linked contract.

Add `GET /api/readings/{reading_id}` returning the canonical session detail and saved follow-ups, authenticated and owner-checked, so historical readings do not rely on fake `history:<id>` tokens or complete journal-list payloads. Journal list keeps original reading data and guide, and opening an entry resolves this detail. On leaving/reopening a journal reading, its follow-ups come back from DB. An in-flight follow-up is bound to its reading ID/operation, even if the user navigates away or selects another active session; no reply is appended to the wrong session.

LocalStorage failure should show a small progress-saving notice if appropriate; server-saved completed content is still recoverable from journal. Revealed indices remain a same-browser convenience unless cross-device reveal-progress persistence is separately required. Reset card/follow-up selection indices when switching sessions, and avoid showing unrevealed cards through alternate pagination if the ritual requires sequential reveal.

## Coverage required after implementation

- Normal browser launch with no Telegram injection reaches every spread and all four persistent tabs, with Guides as the only selector.
- All eight IDs produce counts `daily=1`, `single=1`, `three=3`, `yesno=3`, `mfd=3`, `shadow=6`, `pentagram=6`, `horseshoe=7`, with correct position names/keys; required-question validation never silently changes spread.
- Fixture account can repeatedly draw across the complete deck, including reversed cards; deterministic E2E seed can exercise minor arcana and non-showcase major cards. Every deck asset resolves; no broken-image fallback is accepted as a passing asset test.
- Fresh-account guide selection before first draw, guide change after a completed reading, restart persistence, and simultaneous-tab preference/replay behavior retain correct captured voices.
- Lost begin response, double tap, reload before begin response, API restart mid-generation, poll timeout/outage, failed interpretation retry, unknown token, expired identity, and wrong owner have distinct recoverable states and never duplicate draw/charge.
- Draft/reveal/completed reading survive browser refresh; server DB survives ordinary developer restart; journal opening restores historical reading and saved follow-ups.
- Follow-up loss of response/reload/navigation/reopen reuses its saved operation and original reading/guide; only explicit retries can spend further provider attempts.
- Fixture mode blocks every model transport and Telegram side effect even if local environment has real secrets; production has no local bootstrap or identity fallback; local live request/attempt limits fail closed.
- Responsive ritual/reading/journal coverage at 320, 360, 390, and 430px. Existing E2E selectors must be revised: preview gate and setup `.p-guide-options` are removed. E2E should use the same local bootstrap path as a real browser rather than synthetic SDK/API route interception.

These checks are proposed acceptance criteria. The audit did not execute them and does not claim the existing application satisfies them.
