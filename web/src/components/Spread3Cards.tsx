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

    return (
      <div className="flex flex-col items-center py-3 px-3 w-full h-full">
        {/* cards area — shrinks to content after flip */}
        <div className={`${allFlipped ? 'flex-shrink-0 pb-2' : 'flex-1 min-h-0'} flex flex-col items-center justify-center w-full`}>
          {/* 2-column grid: 2 наверху, 1 снизу по центру */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-[300px] px-2 place-items-center">
            {data.cards.map((rawCard, i) => {
              const card = { ...rawCard, image_url: `/cards/${rawCard.id}.png` };
              const isCenter = i === 1;
              const isLast = i === 2;

              return (
                <div key={rawCard.id} className={isLast ? 'col-span-2 flex justify-center w-full' : 'w-full'}>
                  <div className="max-w-[140px] sm:max-w-[180px] mx-auto">
                    <Card
                      card={card}
                      position={POSITIONS[i]}
                      raised={isCenter}
                      flipped={flippedCards[i]}
                      onFlip={() => handleFlip(i)}
                      characterId={characterId}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {!allFlipped && (
            <div className="font-pixel text-[11px] text-white/40 mt-3 blink flex-shrink-0">
              НАЖМИ НА ВСЕ КАРТЫ
            </div>
          )}
        </div>

        {/* result area — scrollable, takes remaining space */}
        {allFlipped && (
          <div className="flex-1 min-h-0 overflow-y-auto w-full">
            <ReadingResult interpretation={data.interpretation} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
