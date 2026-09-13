// Analytics beacon contract: track() is fire-and-forget — it must never throw
// (even against a dead endpoint), posts a shape-only event to /api/events, and
// silently skips when no Telegram identity is available.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { track } from '@/lib/analytics';

const json204 = (): Response => new Response(null, { status: 204 });

afterEach(() => {
  vi.unstubAllGlobals();
  (window as any).Telegram = undefined;
});

describe('analytics / track', () => {
  it('resolves without throwing against a dead endpoint', async () => {
    (window as any).Telegram = { WebApp: { initData: 'initdata' } };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(track('guide_selected', { guide: 'shadow_walker' })).resolves.toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('posts event + props + init_data to /api/events', async () => {
    (window as any).Telegram = { WebApp: { initData: 'secret' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json204()));
    await track('spread_started', { guide: 'shadow_walker', spread_type: 3, count: 3 });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/events');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.init_data).toBe('secret');
    expect(body.event).toBe('spread_started');
    expect(body.props).toEqual({ guide: 'shadow_walker', spread_type: 3, count: 3 });
  });

  it('skips fetch entirely when there is no Telegram identity', async () => {
    (window as any).Telegram = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await track('history_opened', {});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});