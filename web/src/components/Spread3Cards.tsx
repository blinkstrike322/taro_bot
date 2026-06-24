'use client';

import { useState, useCallback } from 'react';
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

export default function Spread3Cards({ apiCall, characterId, onError }: Spread3CardsProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [data, setData] = useState<ReadingData | null>(null);
  const [flippedCards, setFlippedCards] = useState<boolean[]>([false, false, false]);

  const handleSubmit = useCallback(async (question: string | null) => {
    setPhase('loading');
    try {
      const result = await apiCall(question);
      setData(result);
      setFlippedCards([false, false, false]);
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

    // Triangle layout: card 1 (НАСТОЯЩЕЕ) on top, card 0 (ПРОШЛОЕ) bottom-left, card 2 (БУДУЩЕЕ) bottom-right.
    // Slightly irregular offsets (seeded) for organic feel — cards themselves stay straight.
    // Seeded irregular offsets (px) — applied to wrapper, not card
    const offsets = [
      { x: -6, y: 8 },    // card 1 (top) — slight left + down
      { x: 4, y: 0 },     // card 0 (bottom-left) — slight right
      { x: -3, y: 6 },    // card 2 (bottom-right) — slight left + down
    ];

    if (!allFlipped) {
      return (
        <div className="flex flex-col items-center py-3 px-3 w-full h-full">
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
            {/* Triangle layout — top vertex + 2 bottom cards */}
            <div className="flex flex-col items-center w-full max-w-[360px] sm:max-w-[400px] lg:max-w-[440px] px-2">
              {/* Top card (НАСТОЯЩЕЕ) */}
              <div
                className="w-full max-w-[150px] sm:max-w-[165px] lg:max-w-[180px] mb-2"
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
              <div className="flex items-start justify-center gap-2 sm:gap-3 lg:gap-4 w-full">
                <div
                  className="flex-1 min-w-0 max-w-[150px] sm:max-w-[165px] lg:max-w-[180px]"
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
                  className="flex-1 min-w-0 max-w-[150px] sm:max-w-[165px] lg:max-w-[180px]"
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

            <div className="font-pixel text-[11px] text-white/40 mt-3 blink flex-shrink-0">
              НАЖМИ НА ВСЕ КАРТЫ
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center py-3 px-3 w-full">
        {/* Triangle layout after flip — same triangle shape */}
        <div className="flex flex-col items-center w-full max-w-[360px] sm:max-w-[400px] lg:max-w-[440px] px-2 flex-shrink-0 pb-2">
          {/* Top card (НАСТОЯЩЕЕ) */}
          <div
            className="w-full max-w-[150px] sm:max-w-[165px] lg:max-w-[180px] mb-2"
            style={{ transform: `translate(${offsets[0].x}px, ${offsets[0].y}px)` }}
          >
            <Card
              card={{ ...data.cards[1], image_url: `/cards/${data.cards[1].id}.png` }}
              position={POSITIONS[1]}
              raised={true}
              flipped={true}
              characterId={characterId}
            />
          </div>

          {/* Bottom row: ПРОШЛОЕ + БУДУЩЕЕ */}
          <div className="flex items-start justify-center gap-2 sm:gap-3 lg:gap-4 w-full">
            <div
              className="flex-1 min-w-0 max-w-[150px] sm:max-w-[165px] lg:max-w-[180px]"
              style={{ transform: `translate(${offsets[1].x}px, ${offsets[1].y}px)` }}
            >
              <Card
                card={{ ...data.cards[0], image_url: `/cards/${data.cards[0].id}.png` }}
                position={POSITIONS[0]}
                raised={false}
                flipped={true}
                characterId={characterId}
              />
            </div>
            <div
              className="flex-1 min-w-0 max-w-[150px] sm:max-w-[165px] lg:max-w-[180px]"
              style={{ transform: `translate(${offsets[2].x}px, ${offsets[2].y}px)` }}
            >
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

        {/* result flows below */}
        <div className="w-full pb-4">
          <ReadingResult interpretation={data.interpretation} characterId={characterId} />
        </div>
      </div>
    );
  }

  return null;
}
