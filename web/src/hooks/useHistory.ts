'use client';

// ─────────────────────────────────────────────────────────────
// useHistory — журнал сеансов: загрузка, выбор (разворот полного
// чтения в транскрипте).
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as API from '@/lib/api';
import { SPREADS } from '@/lib/spreads';
import type { HistoryRow } from '@/lib/transcript';
import type { TarotSession } from '@/hooks/useTarotSession';

export interface TarotHistory {
  runHistory: () => Promise<void>;
  handleHistorySelect: (row: HistoryRow) => void;
}

export function useHistory(session: TarotSession): TarotHistory {
  const { push, echoCmd, setMode, setBusy, busyRef } = session;

  const runHistory = useCallback(async () => {
    setBusy(true);
    busyRef.current = true;
    try {
      await echoCmd('taro history');
      const readings = await API.getReadings();
      push({ kind: 'history', rows: readings as HistoryRow[] });
      setMode('ЖУРНАЛ');
    } catch (err: any) {
      push({ kind: 'error', msg: err?.message ?? 'журнал недоступен' });
      setMode('ОЖИДАНИЕ');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [push, echoCmd, setMode, setBusy, busyRef]);

  /** тап по строке → полный сеанс в транскрипте */
  const handleHistorySelect = useCallback(
    (row: HistoryRow) => {
      const data = row.cards_data;
      const cards: API.TarotCardData[] = Array.isArray(data)
        ? (data as API.TarotCardData[])
        : Array.isArray(data?.cards)
          ? (data.cards as API.TarotCardData[])
          : [];
      const norm = cards.map((c) => ({
        ...c,
        image_url: c.image_url || `/cards/${c.id}.png`,
      }));
      push({
        kind: 'json',
        interpretation: row.interpretation ?? {
          intro: '(толкование не сохранилось)',
          short_answer: '',
        },
        cards: norm,
        question: row.question,
        spreadLabel: labelFromRow(row),
        instant: true,
        characterId: row.character_id,
        // свиток из журнала помнит дату исходного чтения
        readAt: row.created_at,
        // строка БД — чтобы отголосок не нашёл самого себя
        dbId: row.id,
      });
      setMode('ЧТЕНИЕ');
    },
    [push, setMode],
  );

  return { runHistory, handleHistorySelect };
}

function labelFromRow(row: HistoryRow): string {
  const t = row.type || '';
  const spread = SPREADS[t];
  if (spread) return spread.name;
  const st = Array.isArray(row.cards_data) ? undefined : row.cards_data?.spread_type;
  if (st && SPREADS[st]) return SPREADS[st].name;
  return t;
}
