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
  mood?: { id: string; name: string } | null;
}

interface SpreadDailyProps {
  characterId?: string;
  onError?: (msg: string) => void;
  apiCall: () => Promise<ReadingData>;
}

const POSITIONS = ['энергия дня', 'вызов дня', 'совет дня'];
const FLIP_ANIM_MS = 700;

// Органичная композиция-пирамида: центрральная карта приподнята,
// боковые лежат ниже — подписи сверху не перекрываются соседними картами.
// Ширины +10% к прошлой итерации, перекрытия чуть глубже.
const FAN = [
  { w: 46, tilt: -7, dy: 30, z: 10, overlapR: -7 },
  { w: 52, tilt: 2, dy: -12, z: 30, overlapL: -8, overlapR: -8 },
  { w: 46, tilt: 6, dy: 34, z: 20, overlapL: -7 },
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

  // ── Единая сцена: веер остаётся ровно там, где его открыли. Толкование —
  // абсолютный блок под сценой (top-full): раскладку сцены не трогает,
  // появляется под сгибом, до него доскролливается. ──
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
        <div className="relative flex items-end justify-center w-full max-w-[500px] py-6">
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
                    ? { ...data.cards[i], image_url: `/cards/${data.cards[i].id}.webp` }
                    : { id: `wait-${i}`, name: '', image_url: '', is_reversed: false }
                }
                position={POSITIONS[i]}
                keepLabel={true}
                flipped={flipped[i]}
                onFlip={() => handleFlip(i)}
                tilt={FAN[i].tilt}
                characterId={characterId}
              />
            </div>
          ))}
        </div>

        {/* статус-строка: фиксированная высота — смена содержимого не двигает веер */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 mt-9 h-14 w-full">
          {fetching ? (
            <GuideLoading guide={guide} />
          ) : showResult ? (
            <div className="tech-label" style={{ color: guide.accentDeep }}>
              толкование ниже ↓
            </div>
          ) : !allFlipped ? (
            <div className="tech-label blink">
              открой все три — {3 - revealCount} осталось
            </div>
          ) : (
            <GuideLoading guide={guide} />
          )}
        </div>
      </div>

      {/* толкование — под сгибом, сцена не перестраивается */}
      {showResult && data && (
        <div className="result-in absolute left-0 right-0 top-full px-5 pb-5 z-10">
          <div className="tech-label mb-2" style={{ color: guide.accentDeep }}>
            ✦ твой день раскладывается так
          </div>
          <ReadingResult
            interpretation={data.interpretation}
            characterId={characterId}
            readingId={data.readingId}
            moodName={data.mood?.name}
          />
        </div>
      )}
    </div>
  );
}
