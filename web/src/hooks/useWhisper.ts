'use client';

// ─────────────────────────────────────────────────────────────
// useWhisper — параллельный канал шёпота: ЛЛМ готовит толкование,
// пока оператор вскрывает карты. Один предмет — фоновый канал.
// ─────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react';
import * as SFX from '@/lib/sound';
import * as API from '@/lib/api';
import { track } from '@/lib/analytics';
import type { Interpretation } from '@/lib/api';
import type { TarotSession } from '@/hooks/useTarotSession';

export interface TarotWhisper {
  /** entryId → промис доставленного шёпота (параллельный канал) */
  whisperJobsRef: { current: Map<number, Promise<Interpretation>> };
  /** сколько шёпотов сейчас формируется в канале (для индикатора статус-лайна) */
  whispersActive: number;
  startWhisper: (entryId: number, token: string) => void;
  resolveWhisper: (entryId: number, cached: Interpretation | null) => Promise<Interpretation | null>;
  /** сброс канала при «clear» */
  clearWhispers: () => void;
}

export function useWhisper(session: TarotSession): TarotWhisper {
  const { updateEntry, push, setMode, setEntries, setScrollTick } = session;

  /** entryId → промис доставленного шёпота (параллельный канал) */
  const whisperJobsRef = useRef<Map<number, Promise<Interpretation>>>(new Map());
  /** сколько шёпотов сейчас формируется в канале (для индикатора статус-лайна) */
  const [whispersActive, setWhispersActive] = useState(0);

  // ── параллельный шёпот: ЛЛМ работает, пока оператор вскрывает карты ──
  const startWhisper = useCallback((entryId: number, token: string) => {
    setWhispersActive((n) => n + 1);
    const job = API.pollInterpretation(token)
      .then((interp) => {
        updateEntry(entryId, { interpretation: interp, whisperReady: true });
        SFX.sWhisper(); // тихий сигнал: шёпот доставлен
        return interp;
      })
      .finally(() => setWhispersActive((n) => n - 1));
    whisperJobsRef.current.set(entryId, job);
    // если оператор так и не вскроет карты — ошибка не должна остаться необработанной
    job.catch(() => {});
  }, [updateEntry]);

  // дождаться шёпота к моменту вскрытия: если канал ещё думает — рыщущий бар
  const resolveWhisper = useCallback(async (
    entryId: number,
    cached: Interpretation | null,
  ): Promise<Interpretation | null> => {
    if (cached) {
      whisperJobsRef.current.delete(entryId);
      return cached;
    }
    const job = whisperJobsRef.current.get(entryId);
    if (!job) return null;
    const pendingId = push({ kind: 'pending', label: 'расшифровка шёпота' });
    setMode('ЧТЕНИЕ');
    try {
      const interp = await job;
      setEntries((prev) => prev.filter((e) => e.id !== pendingId));
      setScrollTick((t) => t + 1);
      whisperJobsRef.current.delete(entryId);
      track('interpretation_ready', {});
      return interp;
    } catch (err: any) {
      setEntries((prev) => prev.filter((e) => e.id !== pendingId));
      setScrollTick((t) => t + 1);
      SFX.sError();
      track('interpretation_failed', { error_type: err?.name || 'Error' });
      push({ kind: 'error', msg: err?.message || 'шёпот не вернулся' });
      setMode('ОЖИДАНИЕ');
      return null;
    }
  }, [push, setMode, setEntries, setScrollTick]);

  // ── сброс параллельного канала при очистке экрана ──
  const clearWhispers = useCallback(() => {
    whisperJobsRef.current.clear();
    setWhispersActive(0);
  }, []);

  return { whisperJobsRef, whispersActive, startWhisper, resolveWhisper, clearWhispers };
}