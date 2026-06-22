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
      <div className="flex flex-col items-center py-4 px-3 w-full">
        <div className="flex items-end justify-center gap-3 w-full max-w-md">
          {data.cards.map((rawCard, i) => {
            const card = { ...rawCard, image_url: `/cards/${rawCard.id}.png` };
            const isCenter = i === 1;

            return (
              <div key={rawCard.id} className="w-28 sm:w-32 flex-shrink-0 overflow-x-hidden">
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
          <div className="font-pixel text-[11px] text-white/40 mt-3 blink">
            НАЖМИ НА ВСЕ КАРТЫ
          </div>
        )}

        {allFlipped && <ReadingResult interpretation={data.interpretation} />}
      </div>
    );
  }

  return null;
}
