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
}

const POSITIONS = ['ПРOШЛOЕ', 'НАСТOЯЩЕЕ', 'БУДУЩЕЕ'];

export default function Spread3Cards({ apiCall, characterId }: Spread3CardsProps) {
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
    } catch {
      setPhase('input');
    }
  }, [apiCall]);

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
      <div className="flex flex-col items-center py-3 px-3 w-full h-full overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
          <div className="flex flex-wrap items-end justify-center gap-2 sm:gap-3 w-full max-w-lg px-2 flex-shrink min-h-0">
            {data.cards.map((rawCard, i) => {
              const card = { ...rawCard, image_url: `/cards/${rawCard.id}.png` };
              const isCenter = i === 1;

              return (
                <div key={rawCard.id} className="flex-[1_1_120px] max-w-[140px] sm:max-w-[180px] lg:max-w-[200px] min-w-0 max-h-full">
                  <Card
                    card={card}
                    position={POSITIONS[i]}
                    raised={isCenter}
                    flipped={flippedCards[i]}
                    onFlip={() => handleFlip(i)}
                    characterId={characterId}
                  />
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

        {allFlipped && <ReadingResult interpretation={data.interpretation} />}
      </div>
    );
  }

  return null;
}
