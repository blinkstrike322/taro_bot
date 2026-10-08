'use client';

// ─────────────────────────────────────────────────────────────
// useSpread — расклады: раздача + фоновый шёпот + вскрытие.
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as API from '@/lib/api';
import * as SFX from '@/lib/sound';
import { randomWhisper, sleep, type Entry, type OutLine, type TarotCard } from '@/lib/transcript';
import { getFrontSpread } from '@/lib/spreads';
import type { TarotSession } from '@/hooks/useTarotSession';
import type { TarotWhisper } from '@/hooks/useWhisper';

function arcanaWord(n: number): string {
  if (n === 1) return 'аркан';
  if (n < 5) return 'аркана';
  return 'арканов';
}

/** последний выбранный расклад — сохраняется при старте чтения;
 *  «спросить снова» и каталог используют его после перезапуска */
const LAST_SPREAD_KEY = 'taro_last_spread';

function rememberLastSpread(spreadId: string): void {
  try {
    localStorage.setItem(LAST_SPREAD_KEY, spreadId);
  } catch {}
}

export function readLastSpread(): string | null {
  try {
    return localStorage.getItem(LAST_SPREAD_KEY);
  } catch {
    return null;
  }
}

const toTarotCards = (cards: API.TarotCardData[]): TarotCard[] =>
  cards.map((c) => ({ ...c, image_url: c.image_url || `/cards/${c.id}.png` }));

/** готовность шёпота к моменту вскрытия последней карты */
async function waitWhisperReady(
  entryId: number,
  entry: { interpretation: API.Interpretation | null; whisperReady?: boolean },
  resolveWhisper: (id: number, cached: API.Interpretation | null) => Promise<API.Interpretation | null>,
): Promise<API.Interpretation | null> {
  if (entry.whisperReady) {
    await sleep(700);
    return resolveWhisper(entryId, entry.interpretation);
  }
  const interp = await resolveWhisper(entryId, entry.interpretation);
  await sleep(450);
  return interp;
}

export interface TarotSpread {
  runDaily: () => Promise<void>;
  runAsk: (cards: 1 | 3, question: string | null) => Promise<void>;
  runSpread: (spreadId: string, question: string | null) => Promise<void>;
  handleFlip: (entryId: number, index: number) => void;
}

export function useSpread(session: TarotSession, whisper: TarotWhisper): TarotSpread {
  const {
    characterId, push, pushOut, echoCmd, setBusy, busyRef, setMode,
    setEntries, bumpScroll, setStreak, setMorningStreak,
  } = session;
  const { startWhisper, resolveWhisper } = whisper;

  // прогресс тасования + параллельная раздача
  const progressWith = useCallback(
    async <T,>(label: string, durMs: number, job: Promise<T>): Promise<T> => {
      push({ kind: 'progress', label, durMs });
      setMode('ТАСОВАНИЕ');
      SFX.sShuffle(durMs);
      const [res] = await Promise.all([job, sleep(durMs + 100)]);
      return res;
    },
    [push, setMode],
  );

  const handleChannelError = useCallback(
    (err: any) => {
      push({ kind: 'error', msg: err?.message || 'канал недоступен' });
      setMode('ОЖИДАНИЕ');
    },
    [push, setMode],
  );

  // ── флоу: карта дня ──
  // локальный час едет на сервер — мини-игра «рассвет»:
  // серия утренних ритуалов растёт только до полудня
  const runDaily = useCallback(async () => {
    setBusy(true);
    busyRef.current = true;
    try {
      const localHour = new Date().getHours();
      const res = await progressWith(
        'тасование колоды',
        950,
        API.spreadBegin('daily', null, characterId, localHour),
      );
      pushOut([{ text: 'карта выбрана · коснись, чтобы вскрыть', tone: 'dim' }]);

      // итог ритуала: рассвет пойман или день закрыт впустую
      const ritual = res.daily_ritual;
      if (ritual && ritual.counted) {
        setStreak(ritual.streakDays);
        setMorningStreak(ritual.morningStreak);
        if (ritual.morning) {
          SFX.sDawn();
          pushOut([
            {
              text: `☀ рассвет пойман · серия рассветов ${ritual.morningStreak}`,
              tone: 'ok',
            },
          ]);
        } else if (ritual.morningStreak > 0) {
          pushOut([
            {
              text: `день закрыт · но рассвет ушёл — серия рассветов замерла на ${ritual.morningStreak}`,
              tone: 'faint',
            },
          ]);
        } else {
          pushOut([
            {
              text: 'день закрыт · полдень уже прошёл — рассветы ловят по утрам',
              tone: 'faint',
            },
          ]);
        }
      } else {
        setStreak((s) => (s === 0 ? 1 : s));
      }

      const entryId = push({
        kind: 'daily',
        card: toTarotCards(res.cards)[0],
        flipped: false,
        interpretation: null,
        token: res.token,
      });
      setMode('РАСКЛАД');
      startWhisper(entryId, res.token);
    } catch (err: any) {
      SFX.sError();
      handleChannelError(err);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [characterId, progressWith, push, pushOut, startWhisper, handleChannelError, setBusy, busyRef, setMode, setStreak, setMorningStreak]);

  // ── флоу: легаси-расклад ask (1|3) ──
  const runAsk = useCallback(
    async (cards: 1 | 3, question: string | null) => {
      setBusy(true);
      busyRef.current = true;
      setMode('ТАСОВАНИЕ');
      try {
        const cmdQuestion = question ? ` "${question}"` : '';
        const cmdCards = cards === 1 ? ' --cards 1' : '';
        await echoCmd(`taro ask${cmdQuestion}${cmdCards}`);

        const res = await progressWith(
          'тасование колоды',
          1100,
          API.spreadBegin(cards === 1 ? 'single' : 'three', question, characterId),
        );

        const positions = res.positions;
        const spreadId = res.spread_id ?? (cards === 1 ? 'single' : 'three');
        const spread = getFrontSpread(spreadId);

        pushOut([
          {
            text: `раздача: ${cards} ${arcanaWord(cards)} · ${spread?.name ?? 'динамический расклад'}`,
            tone: 'dim',
          },
        ]);

        const spreadCards = toTarotCards(res.cards);
        rememberLastSpread(spreadId);
        const entryId = push({
          kind: 'spread',
          cards: spreadCards,
          flipped: spreadCards.map(() => false),
          question,
          interpretation: null,
          spreadLabel: spread?.name ?? (cards === 3 ? 'три карты' : 'одна карта'),
          count: cards,
          spreadId,
          layout: spread?.layout ?? (cards === 3 ? 'pyramid' : 'column1'),
          flipOrder: spread?.flipOrder,
          positionKeys: res.position_keys,
          positions,
          token: res.token,
        });
        setMode('РАСКЛАД');
        startWhisper(entryId, res.token);
      } catch (err: any) {
        SFX.sError();
        handleChannelError(err);
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [characterId, echoCmd, progressWith, push, pushOut, startWhisper, handleChannelError, setBusy, busyRef, setMode],
  );

  // ── флоу: расклад каталога ──
  const runSpread = useCallback(
    async (spreadId: string, question: string | null) => {
      const spread = getFrontSpread(spreadId);
      if (!spread) {
        pushOut([{ text: `расклад «${spreadId}» не найден в каталоге`, tone: 'err' }]);
        setMode('ОЖИДАНИЕ');
        return;
      }
      setBusy(true);
      busyRef.current = true;
      setMode('ТАСОВАНИЕ');
      try {
        await echoCmd(spread.cmd + (question ? ` "${question}"` : ''));
        const res = await progressWith('тасование колоды', 1100, API.spreadBegin(spreadId, question, characterId));

        const positions = res.positions;
        pushOut([
          {
            text: `раздача: ${spread.count} ${arcanaWord(spread.count)} · ${spread.name}`,
            tone: 'dim',
          },
        ]);

        const spreadCards = toTarotCards(res.cards);
        rememberLastSpread(spreadId);
        const entryId = push({
          kind: 'spread',
          cards: spreadCards,
          flipped: spreadCards.map(() => false),
          question,
          interpretation: null,
          spreadLabel: spread.name,
          count: spread.count,
          spreadId,
          layout: spread.layout,
          flipOrder: spread.flipOrder,
          positionKeys: res.position_keys,
          positions,
          token: res.token,
        });
        setMode('РАСКЛАД');
        startWhisper(entryId, res.token);
      } catch (err: any) {
        SFX.sError();
        handleChannelError(err);
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [characterId, echoCmd, progressWith, push, pushOut, startWhisper, handleChannelError, setBusy, busyRef, setMode],
  );

  // ── вскрытие карт ──
  const handleFlip = useCallback(
    (entryId: number, index: number) => {
      setEntries((prev) => {
        const entry = prev.find((e) => e.id === entryId);
        if (!entry) return prev;

        if (entry.kind === 'daily' && !entry.flipped) {
          const reveal = async () => {
            const interp = await waitWhisperReady(entryId, entry, resolveWhisper);
            if (!interp) return;
            push({
              kind: 'json',
              interpretation: interp,
              cards: [entry.card],
              question: null,
              spreadLabel: 'карта дня',
              token: entry.token,
            });
            pushOut([{ text: randomWhisper(characterId), tone: 'comment' }]);
            setMode('ОЖИДАНИЕ');
          };
          setTimeout(() => { void reveal(); }, 250);
          return prev.map((e) => (e.id === entryId ? ({ ...e, flipped: true } as Entry) : e));
        }

        if (entry.kind === 'spread') {
          if (entry.flipped[index]) return prev;
          const flipped = [...entry.flipped];
          flipped[index] = true;
          const allFlipped = flipped.every(Boolean);
          if (allFlipped) {
            const reveal = async () => {
              const interp = await waitWhisperReady(entryId, entry, resolveWhisper);
              if (!interp) return;
              push({
                kind: 'json',
                interpretation: interp,
                cards: entry.cards,
                question: entry.question,
                spreadLabel: entry.spreadLabel,
                spreadId: entry.spreadId,
                token: entry.token,
              });
              pushOut([{ text: randomWhisper(characterId), tone: 'comment' }]);
              setMode('ОЖИДАНИЕ');
            };
            setTimeout(() => { void reveal(); }, 300);
          }
          return prev.map((e) => (e.id === entryId ? ({ ...e, flipped } as Entry) : e));
        }

        return prev;
      });
      bumpScroll();
    },
    [resolveWhisper, push, pushOut, setEntries, bumpScroll, setMode, characterId],
  );

  return { runDaily, runAsk, runSpread, handleFlip };
}
