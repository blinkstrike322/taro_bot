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

    if (!allFlipped) {
      return (
        <div className="flex flex-col items-center py-3 px-3 w-full h-full">
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
            {/* 3 cards auto-fit row — flex-1 распределяет ширину равномерно */}
            <div className="flex items-end justify-center gap-2 sm:gap-3 w-full max-w-[590px] sm:max-w-[662px] lg:max-w-[772px] px-2">
              {data.cards.map((rawCard, i) => {
                const card = { ...rawCard, image_url: `/cards/${rawCard.id}.png` };
                const isCenter = i === 1;

                return (
                  <div key={rawCard.id} className={`flex-1 min-w-0 overflow-hidden ${isCenter ? 'pt-[12px]' : ''}`}>
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

            <div className="font-pixel text-[11px] text-white/40 mt-3 blink flex-shrink-0">
              НАЖМИ НА ВСЕ КАРТЫ
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center py-3 px-3 w-full">
        {/* 3 cards auto-fit row после флипа — чуть меньше, чтобы результат помещался */}
        <div className="flex items-end justify-center gap-2 sm:gap-3 w-full max-w-[442px] sm:max-w-[516px] lg:max-w-[590px] px-2 flex-shrink-0 pb-2">
          {data.cards.map((rawCard, i) => {
            const card = { ...rawCard, image_url: `/cards/${rawCard.id}.png` };
            const isCenter = i === 1;

            return (
              <div key={rawCard.id} className="flex-1 min-w-0 overflow-hidden">
                <Card
                  card={card}
                  position={POSITIONS[i]}
                  raised={isCenter}
                  flipped={true}
                  characterId={characterId}
                />
              </div>
            );
          })}
        </div>

        {/* result flows below */}
        <div className="w-full pb-4">
          <ReadingResult interpretation={data.interpretation} />
        </div>
      </div>
    );
  }

  return null;
}
