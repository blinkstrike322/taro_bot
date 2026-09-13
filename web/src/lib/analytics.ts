'use client';

// ─────────────────────────────────────────────────────────────
// analytics — provider-agnostic product-analytics beacon.
// Observe-only: fires a fire-and-forget POST to /api/events, which
// the backend persists into the `events` table. No external vendor
// SDK; a vendor can be attached later by handling /api/events or
// consuming the events table — without touching these call sites.
//
// PRIVACY (non-negotiable): only *shapes* are passed as props —
// spread_type, count, guide, error_type. Never log question text,
// card names, or interpretation content. The event names below are
// a closed union, so call sites cannot invent free-form strings.
// ─────────────────────────────────────────────────────────────
import { getInitData } from '@/lib/api';

/** Closed union of client-side analytics events (mirrors the backend catalog). */
export type AnalyticsEvent =
  | 'guide_selected'
  | 'daily_started'
  | 'spread_started'
  | 'card_revealed'
  | 'interpretation_ready'
  | 'interpretation_failed'
  | 'history_opened'
  | 'paywall_shown';

/** Shape-only props: scalars only — no question text, cards, or prose. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const ENDPOINT = '/api/events';
const CLIENT_RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

// Client-side safety valve. The authoritative per-user limit lives on the
// server (beacon endpoint); this only reduces needless network chatter.
let hits: number[] = [];

function overLimit(): boolean {
  const now = Date.now();
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= CLIENT_RATE_LIMIT) return true;
  hits.push(now);
  return false;
}

/**
 * Emit a product-analytics event. Fire-and-forget: never throws, never blocks
 * a spread/payment/render. Fails silently — the server logs dropped events.
 */
export async function track(event: AnalyticsEvent, props: AnalyticsProps = {}): Promise<void> {
  try {
    if (overLimit()) return;
    const initData = getInitData();
    if (!initData) return;
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData, event, props }),
    });
  } catch {
    // Swallowed: the beacon must never break the UI; server logs the failure.
  }
}