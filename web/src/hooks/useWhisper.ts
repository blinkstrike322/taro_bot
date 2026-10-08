'use client';

// ─────────────────────────────────────────────────────────────
// useWhisper — фоновый шёпот канала: стартует джобу с раздачей,
// поллит до готовности, обновляет whisperReady у записи.
// ─────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react';
import * as API from '@/lib/api';
import type { TarotSession } from '@/hooks/useTarotSession';

export interface TarotWhisper {
  whispersActive: number;
  startWhisper: (entryId: number, token: string) => void;
  resolveWhisper: (
    entryId: number,
    cached: API.Interpretation | null,
  ) => Promise<API.Interpretation | null>;
}

export function useWhisper(session: TarotSession): TarotWhisper {
  const { updateEntry, push } = session;
  const [whispersActive, setWhispersActive] = useState(0);
  const jobsRef = useRef<Map<number, Promise<API.Interpretation | null>>>(new Map());

  const trackActive = (delta: number) => {
    setWhispersActive((v) => Math.max(0, v + delta));
  };

  /** фоновый поллинг: как только шёпот готов — пометить запись */
  const startWhisper = useCallback(
    (entryId: number, token: string) => {
      trackActive(1);
      const job = API.pollInterpretation(token)
        .then((interp) => {
          updateEntry(entryId, { interpretation: interp, whisperReady: true } as any);
          return interp;
        })
        .catch((err) => {
          push({ kind: 'error', msg: err?.message ?? 'шёпот потерялся' });
          return null;
        })
        .finally(() => trackActive(-1));
      jobsRef.current.set(entryId, job);
    },
    [updateEntry, push],
  );

  /** дождаться готовности (для чтения после вскрытия всех карт) */
  const resolveWhisper = useCallback(
    async (entryId: number, cached: API.Interpretation | null): Promise<API.Interpretation | null> => {
      if (cached) return cached;
      const job = jobsRef.current.get(entryId);
      if (job) {
        const interp = await job;
        jobsRef.current.delete(entryId);
        return interp;
      }
      return null;
    },
    [],
  );

  return { whispersActive, startWhisper, resolveWhisper };
}
