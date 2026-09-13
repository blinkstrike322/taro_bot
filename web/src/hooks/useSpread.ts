'use client';

// ─────────────────────────────────────────────────────────────
// useSpread — расклады: карта дня и вопрос-расклад (двухфазный
// spreadBegin + фоновый шёпот) плюс переворот карт для вскрытия.
// Один предмет — расклад/вскрытие.
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as API from '@/lib/api';
import * as SFX from '@/lib/sound';
import { randomWhisper, sleep, type Entry, type OutLine } from '@/lib/transcript';
import type { TarotSession } from '@/hooks/useTarotSession';
import type { TarotWhisper } from '@/hooks/useWhisper';

const toTarotCards = (cards: API.TarotCardData[]): API.TarotCardData[] =>
  cards.map((c) => ({ ...c, image_url: `/cards/${c.id}.png` }));

/** Остаток квоты после расклада — тихая строка под exit-статусом. */
function quotaLine(remaining: number | undefined | null, limit: number | undefined | null): OutLine | null {
  if (remaining == null || limit == null || limit <= 1) return null; // daily — не показываем
  return { text: `пелена: осталось ${remaining} из ${limit} призывов`, tone: 'faint' };
}

export interface TarotSpread {
  /** флоу: карта дня */
  runDaily: () => Promise<void>;
  /** флоу: расклад с вопросом */
  runAsk: (cards: 1 | 3, question: string | null) => Promise<void>;
  /** вскрытие карт (daily vs spread) */
  handleFlip: (entryId: number, index: number) => void;
}

export function useSpread(session: TarotSession, whisper: TarotWhisper): TarotSpread {
  const {
    characterId, push, pushOut, echoCmd, setBusy, busyRef, setMode,
    quotaRef, setEntries, setScrollTick,
  } = session;
  const { startWhisper, resolveWhisper } = whisper;

  // ── прогресс + параллельный запрос ──
  const progressWith = useCallback(async <T,>(label: string, durMs: number, job: Promise<T>): Promise<T> => {
    push({ kind: 'progress', label, durMs });
    setMode('ТАСОВАНИЕ');
    const [res] = await Promise.all([job, sleep(durMs + 120)]);
    return res;
  }, [push, setMode]);

  // ── ошибка канала: пелена → продуктовый paywall, остальное → обычный сбой ──
  const handleChannelError = useCallback((err: any) => {
    if (err?.needsSubscription) {
      push({ kind: 'paywall', msg: err?.message || 'призывы иссякли' });
    } else {
      push({ kind: 'error', msg: err?.message || 'канал недоступен' });
    }
    setMode('ОЖИДАНИЕ');
  }, [push, setMode]);

  // ── флоу: карта дня ──
  const runDaily = useCallback(async () => {
    setBusy(true); busyRef.current = true;
    try {
      const res = await progressWith('тасование колоды', 950, API.spreadBegin(1, null, characterId));
      pushOut([
        { text: 'карта выбрана. коснись, чтобы вскрыть.', tone: 'dim' },
      ]);
      const entryId = push({
        kind: 'daily',
        card: toTarotCards(res.cards)[0],
        flipped: false,
        interpretation: null,
      });
      setMode('РАСКЛАД');
      startWhisper(entryId, res.token);
    } catch (err: any) {
      SFX.sError();
      handleChannelError(err);
    } finally {
      setBusy(false); busyRef.current = false;
    }
  }, [characterId, progressWith, push, pushOut, startWhisper, handleChannelError, setBusy, busyRef, setMode]);

  // ── флоу: расклад с вопросом ──
  const runAsk = useCallback(async (cards: 1 | 3, question: string | null) => {
    setBusy(true); busyRef.current = true;
    setMode('ТАСОВАНИЕ');
    try {
      const cmdQuestion = question ? ` "${question}"` : '';
      const cmdCards = cards === 1 ? ' --cards 1' : '';
      await echoCmd(`taro ask${cmdQuestion}${cmdCards}`);
      if (question) {
        pushOut([{ text: 'вопрос принят · канал стабилен', tone: 'info' }]);
      }
      const res = await progressWith('тасование колоды', 1100, API.spreadBegin(cards, question, characterId));

      // динамический расклад: позиции вычислены бэкендом по вопросу
      const positions = res.positions;
      const dealLines: OutLine[] = [{
        text: cards === 3
          ? 'раздача: 3 аркана · динамический расклад'
          : 'раздача: 1 аркан',
        tone: 'dim',
      }];
      if (positions) {
        positions.forEach((p, i) => {
          dealLines.push({ text: `0${i + 1} · ${p}`, tone: 'faint' });
        });
      }
      pushOut(dealLines);

      const spreadCards = toTarotCards(res.cards);
      const entryId = push({
        kind: 'spread',
        cards: spreadCards,
        flipped: spreadCards.map(() => false),
        question,
        interpretation: null,
        spreadLabel: cards === 3 ? 'три карты' : 'одна карта',
        count: cards,
        positions,
      });
      quotaRef.current = { remaining: res.remaining, limit: res.limit };
      setMode('РАСКЛАД');
      startWhisper(entryId, res.token);
    } catch (err: any) {
      SFX.sError();
      handleChannelError(err);
    } finally {
      setBusy(false); busyRef.current = false;
    }
  }, [characterId, echoCmd, progressWith, push, pushOut, startWhisper, handleChannelError, setBusy, busyRef, setMode, quotaRef]);

  // ── переворот карт ──
  const handleFlip = useCallback((entryId: number, index: number) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (!entry) return prev;

      if (entry.kind === 'daily' && !entry.flipped) {
        // переворот карты дня → печатаем чтение (шёпот уже должен быть готов)
        setTimeout(() => {
          (async () => {
            const interp = await resolveWhisper(entryId, entry.interpretation);
            if (!interp) return;
            push({ kind: 'json', interpretation: interp, cards: [entry.card], question: null, spreadLabel: 'карта дня' });
            pushOut([{ text: randomWhisper(), tone: 'comment' }]);
            setMode('ОЖИДАНИЕ');
          })();
        }, 950);
        return prev.map((e) => (e.id === entryId ? ({ ...e, flipped: true } as Entry) : e));
      }

      if (entry.kind === 'spread') {
        if (entry.flipped[index]) return prev;
        const flipped = [...entry.flipped];
        flipped[index] = true;
        const allFlipped = flipped.every(Boolean);
        if (allFlipped) {
          setTimeout(() => {
            (async () => {
              const interp = await resolveWhisper(entryId, entry.interpretation);
              if (!interp) return;
              await echoCmd('taro read --json');
              push({ kind: 'json', interpretation: interp, cards: entry.cards, question: entry.question, spreadLabel: entry.spreadLabel });
              pushOut([{ text: randomWhisper(), tone: 'comment' }]);
              // тихий индикатор остатка квоты — без этого лимит не виден до отказа
              const qline = quotaLine(quotaRef.current.remaining, quotaRef.current.limit);
              if (qline) pushOut([qline]);
              setMode('ОЖИДАНИЕ');
            })();
          }, 950);
        }
        return prev.map((e) => (e.id === entryId ? ({ ...e, flipped } as Entry) : e));
      }

      return prev;
    });
    setScrollTick((t) => t + 1);
  }, [echoCmd, push, pushOut, resolveWhisper, setEntries, setScrollTick, quotaRef, setMode]);

  return { runDaily, runAsk, handleFlip };
}