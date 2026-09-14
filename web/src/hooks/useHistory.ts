'use client';

// ─────────────────────────────────────────────────────────────
// useHistory — журнал сеансов: чтение из API и мгновенный
// повторный рендер старого чтения. Один предмет — журнал сеансов.
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as API from '@/lib/api';
import { spreadLabelFromType, type HistoryRow } from '@/lib/transcript';
import { track } from '@/lib/analytics';
import type { TarotCard } from '@/components/Card';
import type { TarotSession } from '@/hooks/useTarotSession';

/** Карты из записи журнала → формат рендера (два исторических формата). */
export function cardsFromHistory(cardsData: any): TarotCard[] {
  const toCard = (c: any): TarotCard | null => {
    if (!c || !c.id || !c.name) return null;
    return {
      id: c.id,
      name: c.name,
      image_url: `/cards/${c.id}.png`,
      is_reversed: Boolean(c.is_reversed ?? (c.orientation === 'reversed')),
    };
  };
  const raw: any[] = Array.isArray(cardsData?.cards)
    ? cardsData.cards                      // новый формат: {cards: [...], spread_type}
    : cardsData?.chosen_card               // легаси карты дня: {chosen_index, chosen_card}
      ? [cardsData.chosen_card]
      : [];
  return raw.map(toCard).filter((c: TarotCard | null): c is TarotCard => c !== null);
}

export interface TarotHistory {
  runHistory: () => Promise<void>;
  /** тап по строке журнала → развернуть полный сеанс */
  handleHistorySelect: (row: HistoryRow) => Promise<void>;
}

export function useHistory(session: TarotSession): TarotHistory {
  const { push, pushOut, echoCmd, busyRef, setBusy, setMode } = session;

  // ── флоу: журнал сеансов ──
  const runHistory = useCallback(async () => {
    setBusy(true); busyRef.current = true;
    setMode('ЖУРНАЛ');
    try {
      pushOut([{ text: 'чтение журнала ~/сеансы.log …', tone: 'dim' }]);
      const now = new Date();
      const res = await API.getReadings(now.getFullYear(), now.getMonth() + 1);
      // журнал несёт полные данные чтений — тап разворачивает сеанс целиком
      const rows: HistoryRow[] = (res.readings || []).map((r) => ({
        id: r.id,
        type: r.type,
        question: r.question,
        created_at: r.created_at,
        cards_data: r.cards_data,
        interpretation: r.interpretation,
        character_id: r.character_id,
      }));
      push({ kind: 'history', rows });
      track('history_open', {});
    } catch {
      push({ kind: 'history', rows: [] });
    } finally {
      setBusy(false); busyRef.current = false;
      setMode('ОЖИДАНИЕ');
    }
  }, [push, pushOut, busyRef, setBusy, setMode]);

  // ── разворачивание старого сеанса: тот же рендер, мгновенно, без звука печати ─
  const handleHistorySelect = useCallback(async (row: HistoryRow) => {
    if (busyRef.current) return;
    const cards = cardsFromHistory(row.cards_data);
    if (!cards.length || !row.interpretation) {
      pushOut([{ text: `cat: сеанс #${row.id}: запись без карт`, tone: 'err' }]);
      return;
    }
    await echoCmd(`taro show ${row.id}`);
    pushOut([
      { text: `сеанс #${row.id} · ${spreadLabelFromType(row.type)}`, tone: 'dim' },
    ]);
    push({
      kind: 'json',
      interpretation: row.interpretation,
      cards,
      question: row.question,
      spreadLabel: spreadLabelFromType(row.type),
      instant: true,
      characterId: row.character_id,
    });
    setMode('ОЖИДАНИЕ');
  }, [echoCmd, push, pushOut, busyRef, setMode]);

  return { runHistory, handleHistorySelect };
}