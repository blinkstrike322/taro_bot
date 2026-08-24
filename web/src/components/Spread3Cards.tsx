'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { TarotCard } from './Card';
import Card from './Card';
import QuestionInput from './QuestionInput';
import ReadingResult from './ReadingResult';
import { useAtmosphere } from './atmosphere/AtmosphereContext';

type Phase = 'input' | 'loading' | 'cards' | 'result';

interface ReadingData {
  readingId: number | null;
  cards: TarotCard[];
  interpretation: {
    intro: string;
    short_answer: string;
    card_meaning: string[] | string;
    advice: string;
  };
  mood?: { id: string; name: string } | null;
}

interface Spread3CardsProps {
  apiCall: (question: string | null) => Promise<ReadingData>;
  characterId?: string;
  onError?: (msg: string) => void;
}

const POSITIONS = ['ПРОШЛОЕ', 'НАСТОЯЩЕЕ', 'БУДУЩЕЕ'];

const FLIP_ANIM_MS = 700;

export default function Spread3Cards({ apiCall, characterId, onError }: Spread3CardsProps) {
  const { setPhase: setAtmoPhase } = useAtmosphere();
  const [phase, setPhase] = useState<Phase>('input');
  const [data, setData] = useState<ReadingData | null>(null);
  const [flippedCards, setFlippedCards] = useState<boolean[]>([false, false, false]);
  const [showResult, setShowResult] = useState(false);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (flippedCards.every(Boolean)) {
      setAtmoPhase('reading');
      resultTimer.current = setTimeout(() => setShowResult(true), FLIP_ANIM_MS + 50);
    } else {
      setShowResult(false);
      if (resultTimer.current) clearTimeout(resultTimer.current);
    }
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, [flippedCards, setAtmoPhase]);

  const handleSubmit = useCallback(async (question: string | null) => {
    setPhase('loading');
    try {
      const result = await apiCall(question);
      setData(result);
      setFlippedCards([false, false, false]);
      setShowResult(false);
      setPhase('cards');
    } catch (err: any) {
      setPhase('input');
      onError?.(err?.message || 'Не получилось. Попробуй снова.');
    }
  }, [apiCall, onError]);

  const handleFlip = useCallback((index: number) => {
    setFlippedCards((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
    setAtmoPhase('reveal');
  }, [setAtmoPhase]);

  if (phase === 'input' || phase === 'loading') {
    return (
      <QuestionInput
        spreadType={3}
        onSubmit={handleSubmit}
        loading={phase === 'loading'}
        characterId={characterId}
      />
    );
  }

  if (phase === 'cards' && data) {
    const allFlipped = flippedCards.every(Boolean);

    // Лёгкий асимметричный сдвиг — карты будто положены рукой
    const offsets = [
      { x: -6, y: 10, r: -2 },
      { x: 5, y: 5, r: 2.5 },
      { x: -3, y: -5, r: 4 },
    ];

    // Единое дерево на весь цикл: расклад не перемонтируется и не сдвигается
    // при появлении толкования — оно въезжает снизу (result-in). pt-14 —
    // карты чуть ниже, верх не упирается в шапку.
    return (
      <div className="flex flex-col items-center pt-14 pb-2 px-3 w-full">
        <div className="flex flex-col items-center w-full">
          <div className="flex flex-col items-center w-full max-w-[480px] sm:max-w-[520px] px-2">
            {/* Верхняя карта (НАСТОЯЩЕЕ) */}
            <div
              className="w-full max-w-[224px] sm:max-w-[246px] mb-2"
              style={{ transform: `translate(${offsets[0].x}px, ${offsets[0].y}px) rotate(${offsets[0].r}deg)` }}
            >
              <Card
                card={{ ...data.cards[1], image_url: `/cards/${data.cards[1].id}.webp` }}
                position={POSITIONS[1]}
                raised={true}
                flipped={flippedCards[1]}
                onFlip={() => handleFlip(1)}
                characterId={characterId}
              />
            </div>

            {/* Нижний ряд: ПРОШЛОЕ + БУДУЩЕЕ */}
            <div className="flex items-start justify-center gap-3.5 sm:gap-4 w-full">
              <div
                className="flex-1 min-w-0 max-w-[238px] sm:max-w-[262px]"
                style={{ transform: `translate(${offsets[1].x}px, ${offsets[1].y}px) rotate(${offsets[1].r}deg)` }}
              >
                <Card
                  card={{ ...data.cards[0], image_url: `/cards/${data.cards[0].id}.webp` }}
                  position={POSITIONS[0]}
                  raised={false}
                  flipped={flippedCards[0]}
                  onFlip={() => handleFlip(0)}
                  characterId={characterId}
                />
              </div>
              <div
                className="flex-1 min-w-0 max-w-[238px] sm:max-w-[262px]"
                style={{ transform: `translate(${offsets[2].x}px, ${offsets[2].y}px) rotate(${offsets[2].r}deg)` }}
              >
                <Card
                  card={{ ...data.cards[2], image_url: `/cards/${data.cards[2].id}.webp` }}
                  position={POSITIONS[2]}
                  raised={false}
                  flipped={flippedCards[2]}
                  onFlip={() => handleFlip(2)}
                  characterId={characterId}
                />
              </div>
            </div>
          </div>

          {showResult ? (
            <div className="w-full result-in">
              <ReadingResult
                interpretation={data.interpretation}
                characterId={characterId}
                readingId={data.readingId}
                moodName={data.mood?.name}
              />
            </div>
          ) : (
            !allFlipped && (
              <div className="tech-label mt-4 blink">
                открой все три карты
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  return null;
}
