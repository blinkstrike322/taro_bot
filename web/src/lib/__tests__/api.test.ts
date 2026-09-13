// API error contract — the product paywall flag (`needs_subscription`) and the
// `needs_subscription` → `ApiError.needsSubscription` mapping from the response
// body are locked through the public `spreadBegin` boundary (readErrorBody is
// internal). No fetch.callbacks leak into these tests — fetch is stubbed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { spreadBegin, ApiError } from '@/lib/api';

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiError / contract', () => {
  it('carries needsSubscription and status from constructor opts', () => {
    const err = new ApiError('пелена', { needsSubscription: true, status: 402 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('пелена');
    expect(err.needsSubscription).toBe(true);
    expect(err.status).toBe(402);
  });

  it('leaves needsSubscription undefined when not provided', () => {
    const err = new ApiError('generic');
    expect(err.needsSubscription).toBeUndefined();
    expect(err.status).toBeUndefined();
  });
});

describe('spreadBegin / error boundary reads needs_subscription', () => {
  it('maps needs_subscription=true to ApiError.needsSubscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'лимит исчерпан', needs_subscription: true }, 402),
      ),
    );
    await expect(spreadBegin(3, 'вопрос')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'лимит исчерпан',
      needsSubscription: true,
      status: 402,
    });
  });

  it('maps needs_subscription=false to ApiError.needsSubscription=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'блок', needs_subscription: false }, 403),
      ),
    );
    await expect(spreadBegin(1, null)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'блок',
      needsSubscription: false,
      status: 403,
    });
  });

  it('keeps needsSubscription undefined when the body omits the flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'что-то пошло не так' }, 500)),
    );
    await expect(spreadBegin(3, null)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'что-то пошло не так',
      needsSubscription: undefined,
      status: 500,
    });
  });

  it('falls back to a default message when the body has no error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({}, 500)),
    );
    await expect(spreadBegin(3, null)).rejects.toMatchObject({
      message: 'Spread failed',
      status: 500,
    });
  });
});