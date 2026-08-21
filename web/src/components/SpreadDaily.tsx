'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { TarotCard } from './Card';
import Card from './Card';
import ReadingResult from './ReadingResult';
import GuideLoading from './GuideLoading';
import { getGuide } from '@/lib/guides';
import * as API from '@/lib/api';

interface ReadingData {
  readingId: number;
  cards: TarotCard[];
  interpretation: {
    intro: string;
    short_answer: string;
    card_meaning: string[] | string;
    advice: string;
  };
}

interface SpreadDailyProps {
  characterId?: string;
  onError?: (msg: string) => void;
  apiCall: () => Promise<ReadingData>;
}

const POSITIONS = ['ЭНЕРГИЯ ДНЯ', 'ВЫЗОВ ДНЯ', 'СОВЕТ ДНЯ'];
const FLIP_ANIM_MS = 700;

export default function SpreadDaily({ characterId, onError, apiCall }: SpreadDailyProps) {
  const [data, setData] = useState<ReadingData | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false]);
  const [showResult, setShowResult] = useState(false);
  const [fetching, setFetching] = useState(true);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentToChat = useRef(false);
  const guide = getGuide(characterId);

  // Тянем карты дня сразу — пока грузятся, рубашки мерцают
  useEffect(() => {
    let cancelled = false;
    apiCall()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setFlipped([false, false, false]);
        }
      })
      .catch((err: any) => {
        if (!cancelled) onError?.(err?.message || 'Не получилось. Попробуй снова.');
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Все три карты открыты → показываем толкование
  useEffect(() => {
    if (flipped.every(Boolean)) {
      resultTimer.current = setTimeout(() => setShowResult(true), FLIP_ANIM_MS + 100);

      // Отправляем итог в чат с ботом (однократно)
      if (!sentToChat.current && data) {
        sentToChat.current = true;
        try {
          const tg = (window as any).Telegram?.WebApp;
          if (tg?.sendData) {
            const cardsLines = data.cards
              .map((c, i) => `${POSITIONS[i]}: ${c.name}${c.is_reversed ? ' (пер.)' : ''}`)
              .join('\n');
            tg.sendData(
              JSON.stringify({
                action: 'spread_done',
                type: 'daily',
                text: `РАСКЛАД ДНЯ\n\n${cardsLines}\n\n${data.interpretation.short_answer}${
                  data.interpretation.advice ? `\n\nРитуал дня: ${data.interpretation.advice}` : ''
                }`,
              }),
            );
          }
        } catch {}
      }
    } else {
      setShowResult(false);
      if (resultTimer.current) clearTimeout(resultTimer.current);
    }
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, [flipped, data]);

  const handleFlip = useCallback((index: number) => {
    if (!data) return; // карты ещё тянутся
    setFlipped((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, [data]);

  const allFlipped = flipped.every(Boolean);
  const revealCount = flipped.filter(Boolean).length;

  // ── Экран результата: карты остаются рядом, толкование ниже ──
  if (showResult && data) {
    return (
      <div className="flex flex-col items-center py-4 px-3 w-full">
        <div className="font-serif italic text-[17px] mb-3 text-center" style={{ color: guide.accentDeep }}>
          ✦ твой день раскладывается так ✦
        </div>
        <div className="flex items-start justify-center gap-3 w-full max-w-[420px] mb-4">
          {data.cards.map((c, i) => (
            <div key={i} className="flex-1 min-w-0">
              <Card
                card={{ ...c, image_url: `/cards/${c.id}.png` }}
                flipped={true}
                characterId={characterId}
              />
              <div className="font-pixel text-[8px] tracking-[0.14em] uppercase text-center mt-1 text-[color:var(--ink-soft)]">
                {POSITIONS[i]}
              </div>
            </div>
          ))}
        </div>
        <div className="w-full">
          <ReadingResult
            interpretation={data.interpretation}
            characterId={characterId}
            readingId={data.readingId}
          />
        </div>
      </div>
    );
  }

  // ── Экран раскрытия: три рубашки в ряд ──
  return (
    <div className="flex flex-col items-center py-4 px-3 w-full min-h-full">
      {/* приветствие проводницы */}
      <div className="text-center mb-4 max-w-[320px] relative z-10">
        <div className="font-serif text-[22px] font-semibold leading-tight text-[color:var(--ink)]">
          Расклад дня
        </div>
        <div className="font-serif italic text-[15px] leading-snug mt-1" style={{ color: guide.accentDeep }}>
          «{guide.greeting}»
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
        <div className="flex items-start justify-center gap-3 w-full max-w-[420px]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 min-w-0">
              <Card
                card={
                  data
                    ? { ...data.cards[i], image_url: `/cards/${data.cards[i].id}.png` }
                    : { id: `wait-${i}`, name: '', image_url: '', is_reversed: false }
                }
                position={POSITIONS[i]}
                flipped={flipped[i]}
                onFlip={() => handleFlip(i)}
                characterId={characterId}
              />
            </div>
          ))}
        </div>

        {/* статус-строка */}
        <div className="mt-5 relative z-10 flex flex-col items-center gap-1.5">
          {fetching ? (
            <GuideLoading guide={guide} />
          ) : !allFlipped ? (
            <div className="font-pixel text-[11px] text-[color:var(--ink-soft)] blink tracking-[0.14em]">
              открой все три — {3 - revealCount} осталось
            </div>
          ) : (
            <GuideLoading guide={guide} />
          )}
        </div>
      </div>
    </div>
  );
}
