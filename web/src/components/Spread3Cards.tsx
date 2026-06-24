'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { TarotCard } from './Card';
import Card from './Card';
import QuestionInput from './QuestionInput';
import ReadingResult from './ReadingResult';

type Phase = 'input' | 'loading' | 'cards' | 'result';

interface ReadingData {
  cards: TarotCard[];
  interpretation: {
    intro: string;
    short_answer: string;
    card_meaning: string[] | string;
    advice: string;
  };
}

interface Spread3CardsProps {
  apiCall: (question: string | null) => Promise<ReadingData>;
  characterId?: string;
  onError?: (msg: string) => void;
}

const POSITIONS = ['ПРOШЛOЕ', 'НАСТOЯЩЕЕ', 'БУДУЩЕЕ'];

const FLIP_ANIM_MS = 700;

export default function Spread3Cards({ apiCall, characterId, onError }: Spread3CardsProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [data, setData] = useState<ReadingData | null>(null);
  const [flippedCards, setFlippedCards] = useState<boolean[]>([false, false, false]);
  const [showResult, setShowResult] = useState(false);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (flippedCards.every(Boolean)) {
      resultTimer.current = setTimeout(() => setShowResult(true), FLIP_ANIM_MS + 50);
    } else {
      setShowResult(false);
      if (resultTimer.current) clearTimeout(resultTimer.current);
    }
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, [flippedCards]);

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
      onError?.(err?.message || 'ПEЧАЛЬ. ПOПРOБУЙ СНOВА.');
    }
  }, [apiCall, onError]);

  const handleFlip = useCallback((index: number) => {
    setFlippedCards(prev => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, []);

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

    // Seeded irregular offsets (px) — applied to wrapper, not card
    const offsets = [
      { x: -6, y: 8 },    // card 1 (top) — slight left + down
      { x: 4, y: 0 },     // card 0 (bottom-left) — slight right
      { x: -3, y: 6 },    // card 2 (bottom-right) — slight left + down
    ];

    if (showResult) {
      return (
        <div className="flex flex-col items-center py-3 px-3 w-full">
          <div className="flex flex-col items-center w-full max-w-[396px] sm:max-w-[440px] lg:max-w-[484px] px-2 flex-shrink-0 pb-2">
            <div
              className="w-full max-w-[165px] sm:max-w-[182px] lg:max-w-[198px] mb-2"
            >
              <Card
                card={{ ...data.cards[1], image_url: `/cards/${data.cards[1].id}.png` }}
                position={POSITIONS[1]}
                raised={true}
                flipped={true}
                characterId={characterId}
              />
            </div>
            <div className="flex items-start justify-center gap-4 sm:gap-5 lg:gap-6 w-full">
              <div className="flex-1 min-w-0 max-w-[165px] sm:max-w-[182px] lg:max-w-[198px]">
                <Card
                  card={{ ...data.cards[0], image_url: `/cards/${data.cards[0].id}.png` }}
                  position={POSITIONS[0]}
                  raised={false}
                  flipped={true}
                  characterId={characterId}
                />
              </div>
              <div className="flex-1 min-w-0 max-w-[165px] sm:max-w-[182px] lg:max-w-[198px]">
                <Card
                  card={{ ...data.cards[2], image_url: `/cards/${data.cards[2].id}.png` }}
                  position={POSITIONS[2]}
                  raised={false}
                  flipped={true}
                  characterId={characterId}
                />
              </div>
            </div>
          </div>
          <div className="w-full pb-4">
            <ReadingResult interpretation={data.interpretation} characterId={characterId} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center py-3 px-3 w-full h-full">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
          <div className="flex flex-col items-center w-full max-w-[396px] sm:max-w-[440px] lg:max-w-[484px] px-2">
            {/* Top card (НАСТОЯЩЕЕ) */}
            <div
              className="w-full max-w-[165px] sm:max-w-[182px] lg:max-w-[198px] mb-2"
              style={{ transform: `translate(${offsets[0].x}px, ${offsets[0].y}px)` }}
            >
              <Card
                card={{ ...data.cards[1], image_url: `/cards/${data.cards[1].id}.png` }}
                position={POSITIONS[1]}
                raised={true}
                flipped={flippedCards[1]}
                onFlip={() => handleFlip(1)}
                characterId={characterId}
              />
            </div>

            {/* Bottom row: ПРОШЛОЕ + БУДУЩЕЕ */}
            <div className="flex items-start justify-center gap-4 sm:gap-5 lg:gap-6 w-full">
              <div
                className="flex-1 min-w-0 max-w-[165px] sm:max-w-[182px] lg:max-w-[198px]"
                style={{ transform: `translate(${offsets[1].x}px, ${offsets[1].y}px)` }}
              >
                <Card
                  card={{ ...data.cards[0], image_url: `/cards/${data.cards[0].id}.png` }}
                  position={POSITIONS[0]}
                  raised={false}
                  flipped={flippedCards[0]}
                  onFlip={() => handleFlip(0)}
                  characterId={characterId}
                />
              </div>
              <div
                className="flex-1 min-w-0 max-w-[165px] sm:max-w-[182px] lg:max-w-[198px]"
                style={{ transform: `translate(${offsets[2].x}px, ${offsets[2].y}px)` }}
              >
                <Card
                  card={{ ...data.cards[2], image_url: `/cards/${data.cards[2].id}.png` }}
                  position={POSITIONS[2]}
                  raised={false}
                  flipped={flippedCards[2]}
                  onFlip={() => handleFlip(2)}
                  characterId={characterId}
                />
              </div>
            </div>
          </div>

          {!allFlipped && (
            <div className="font-pixel text-[11px] text-white/40 mt-3 blink flex-shrink-0">
              НАЖМИ НА ВСЕ КАРТЫ
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
