// ─────────────────────────────────────────────────────────────
// useSpread — вскрытие карт: чтение гейтится готовностью шёпота,
// а не мёртвым 950мс-таймером. Один предмет — тайминг reveal.
// ─────────────────────────────────────────────────────────────
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/sound', () => ({ sError: vi.fn(), sWhisper: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import type { Entry, OutLine } from '@/lib/transcript';
import type { TarotSession } from '@/hooks/useTarotSession';
import type { TarotWhisper } from '@/hooks/useWhisper';
import type { Interpretation, TarotCardData } from '@/lib/api';
import { useSpread } from '@/hooks/useSpread';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ждать условие, вернуть время момента, когда оно впервые выполнилось */
async function until(cond: () => boolean, timeoutMs = 5000): Promise<number> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('условие не наступило');
    await wait(25);
  }
  return Date.now();
}

const interp: Interpretation = {
  intro: 'и',
  short_answer: 'а',
  card_meaning: ['м'],
  advice: 'с',
};

const card: TarotCardData = {
  id: 'the-moon', name: 'Луна', upright: 'у', reversed: 'р',
  is_reversed: false, orientation: 'upright', image_url: '/cards/the-moon.png',
};

interface SessionHarness {
  spread: ReturnType<typeof useSpread>;
  pushed: { kind: string; at: number }[];
  outs: OutLine[][];
  echoCmd: ReturnType<typeof vi.fn>;
  resolveWhisper: ReturnType<typeof vi.fn>;
}

/** минимальный фейк TarotSession + TarotWhisper: ровно то, что читает useSpread */
function makeHarness(entries: Entry[], resolveImpl: () => Promise<Interpretation | null>): SessionHarness {
  let state = entries;
  const pushed: { kind: string; at: number }[] = [];
  const outs: OutLine[][] = [];
  const session = {
    characterId: 'shadow_walker',
    push: vi.fn((partial: { kind: string }) => {
      pushed.push({ kind: partial?.kind, at: Date.now() });
      return 999;
    }),
    pushOut: vi.fn((lines: OutLine[]) => { outs.push(lines); }),
    echoCmd: vi.fn(async () => {}),
    setBusy: vi.fn(),
    busyRef: { current: false },
    setMode: vi.fn(),
    quotaRef: { current: { remaining: 9, limit: 10 } },
    setEntries: vi.fn((fn: (prev: Entry[]) => Entry[]) => { state = fn(state); }),
    setScrollTick: vi.fn(),
  } as unknown as TarotSession;
  const whisper = {
    startWhisper: vi.fn(),
    resolveWhisper: vi.fn(resolveImpl),
  } as unknown as TarotWhisper;
  return { spread: renderHook(() => useSpread(session, whisper)).result.current, pushed, outs, echoCmd: session.echoCmd as ReturnType<typeof vi.fn>, resolveWhisper: whisper.resolveWhisper as ReturnType<typeof vi.fn> };
}

const jsonAt = (h: SessionHarness) => h.pushed.find((p) => p.kind === 'json')?.at ?? 0;

describe('useSpread handleFlip — reveal по готовности шёпота', () => {
  it('шёпот готов: чтение после паузы ~1с (250мс флип + 750мс тишины), без повторного резолва', async () => {
    const t0 = Date.now();
    const h = makeHarness(
      [{ id: 7, kind: 'daily', card, flipped: false, interpretation: interp, whisperReady: true } as Entry],
      async () => interp,
    );
    h.spread.handleFlip(7, 0);

    await wait(400);
    expect(jsonAt(h)).toBe(0); // тишина: чтение не приходит мгновенно

    await until(() => jsonAt(h) > 0);
    expect(jsonAt(h) - t0).toBeGreaterThanOrEqual(1000); // 250 + 750, не старые 950
    expect(h.resolveWhisper).toHaveBeenCalledTimes(1);
    expect(h.resolveWhisper).toHaveBeenCalledWith(7, interp);
  });

  it('шёпот не готов: резолв ровно один раз, минимум 600мс после готовности', async () => {
    const t0 = Date.now();
    const h = makeHarness(
      [{ id: 7, kind: 'daily', card, flipped: false, interpretation: null } as Entry],
      async () => { await wait(40); return interp; },
    );
    h.spread.handleFlip(7, 0);

    await until(() => jsonAt(h) > 0);
    expect(h.resolveWhisper).toHaveBeenCalledTimes(1); // джоба одна — ошибки не дублируются
    expect(jsonAt(h) - t0).toBeGreaterThanOrEqual(890); // 250 + 40 + 600
  });

  it('расклад: после флипа последней карты — чтение, echo и строка квоты', async () => {
    const t0 = Date.now();
    const h = makeHarness(
      [{
        id: 7, kind: 'spread', cards: [card, card, card], flipped: [true, true, false],
        question: 'вопрос', interpretation: interp, spreadLabel: 'три карты', count: 3, whisperReady: true,
      } as Entry],
      async () => interp,
    );
    h.spread.handleFlip(7, 2);

    await until(() => h.echoCmd.mock.calls.some((c) => c[0] === 'taro read --json'));
    await until(() => jsonAt(h) > 0);
    expect(jsonAt(h) - t0).toBeGreaterThanOrEqual(1000);
    expect(h.outs.some((lines) => lines.some((l) => l.text === 'пелена: осталось 9 из 10 призывов'))).toBe(true);
  });
});
