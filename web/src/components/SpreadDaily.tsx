'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { TarotCard } from './Card';
import Card from './Card';
import ReadingResult from './ReadingResult';
import GuideLoading from './GuideLoading';
import PixelFlower from './PixelFlower';
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

const POSITIONS = ['энергия дня', 'вызов дня', 'совет дня'];
const FLIP_ANIM_MS = 700;

// Органичная композиция: карты будто положены рукой — наклоны, перекрытия, разные уровни
const FAN = [
  { w: 44, tilt: -7, dx: 0, dy: 44, z: 10, overlapR: -9 },
  { w: 50, tilt: 2, dx: 0, dy: 0, z: 30, overlapL: -10, overlapR: -10 },
  { w: 44, tilt: 6, dx: 0, dy: 50, z: 20, overlapL: -9 },
];

export default function SpreadDaily({ characterId, onError, apiCall }: SpreadDailyProps) {
  const [data, setData] = useState<ReadingData | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([false, false, false]);
  const [showResult, setShowResult] = useState(false);
  const [fetching, setFetching] = useState(true);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentToChat = useRef(false);
  const guide = getGuide(characterId);

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

  useEffect(() => {
    if (flipped.every(Boolean)) {
      resultTimer.current = setTimeout(() => setShowResult(true), FLIP_ANIM_MS + 100);

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
    if (!data) return;
    setFlipped((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, [data]);

  const allFlipped = flipped.every(Boolean);
  const revealCount = flipped.filter(Boolean).length;

  // ── Результат: карты остаются веером, толкование editorial-лентой ниже ──
  if (showResult && data) {
    return (
      <div className="relative flex flex-col items-center py-2 px-5 w-full">
        <div className="tech-label self-start mb-2" style={{ color: guide.accentDeep }}>
          ✦ твой день раскладывается так
        </div>
        <div className="flex items-end justify-center w-full max-w-[440px] -mt-2">
          {data.cards.map((c, i) => (
            <div
              key={i}
              className={i === 1 ? 'z-30' : 'z-10'}
              style={{
                width: `${FAN[i].w}%`,
                marginLeft: FAN[i].overlapL ? `${FAN[i].overlapL}%` : undefined,
                marginRight: FAN[i].overlapR ? `${FAN[i].overlapR}%` : undefined,
                transform: `translateY(${FAN[i].dy * 0.55}px)`,
              }}
            >
              <Card
                card={{ ...c, image_url: `/cards/${c.id}.png` }}
                flipped={true}
                tilt={FAN[i].tilt * 0.6}
                characterId={characterId}
              />
              <div className="tech-label text-center mt-1.5" style={{ letterSpacing: '0.14em' }}>
                {POSITIONS[i]}
              </div>
            </div>
          ))}
        </div>
        <div className="w-full mt-4">
          <ReadingResult
            interpretation={data.interpretation}
            characterId={characterId}
            readingId={data.readingId}
          />
        </div>
      </div>
    );
  }

  // ── Сцена выбора: curiosity → anticipation → reveal ──
  return (
    <div className="relative flex flex-col items-center py-3 px-5 w-full min-h-full">
      {/* editorial-заголовок: асимметрия */}
      <div className="w-full max-w-[460px] relative z-10">
        <h2 className="display-xl">расклад дня</h2>
        <div
          className="font-serif italic text-[17px] leading-snug mt-1.5"
          style={{ color: 'var(--ink-soft)', maxWidth: 300, transform: 'rotate(-0.8deg)' }}
        >
          «{guide.greeting}»
        </div>
      </div>

      {/* веер карт */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
        <div className="relative flex items-end justify-center w-full max-w-[460px] py-6">
          {/* цветок прорастает из-под карт */}
          <div
            className="absolute pointer-events-none z-0"
            style={{ bottom: '-30%', left: '-18%', width: '56vmin', height: '56vmin' }}
            aria-hidden="true"
          >
            <PixelFlower seed={11} size={560} color={guide.accent} opacity={0.18} dense />
          </div>

          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="relative"
              style={{
                width: `${FAN[i].w}%`,
                zIndex: FAN[i].z,
                marginLeft: FAN[i].overlapL ? `${FAN[i].overlapL}%` : undefined,
                marginRight: FAN[i].overlapR ? `${FAN[i].overlapR}%` : undefined,
                transform: `translateY(${FAN[i].dy}px)`,
              }}
            >
              <Card
                card={
                  data
                    ? { ...data.cards[i], image_url: `/cards/${data.cards[i].id}.png` }
                    : { id: `wait-${i}`, name: '', image_url: '', is_reversed: false }
                }
                position={flipped[i] ? undefined : POSITIONS[i]}
                flipped={flipped[i]}
                onFlip={() => handleFlip(i)}
                tilt={FAN[i].tilt}
                characterId={characterId}
              />
            </div>
          ))}
        </div>

        {/* статус-строка */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 pb-4">
          {fetching ? (
            <GuideLoading guide={guide} />
          ) : !allFlipped ? (
            <div className="tech-label blink">
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
