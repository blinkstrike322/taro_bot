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

interface Spread1CardProps {
  apiCall: (question: string | null) => Promise<ReadingData>;
  characterId?: string;
  onError?: (msg: string) => void;
}

export default function Spread1Card({ apiCall, characterId, onError }: Spread1CardProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [data, setData] = useState<ReadingData | null>(null);
  const [flipped, setFlipped] = useState(false);

  const handleSubmit = useCallback(async (question: string | null) => {
    setPhase('loading');
    try {
      const result = await apiCall(question);
      setData(result);
      setFlipped(false);
      setPhase('cards');
    } catch (err: any) {
      setPhase('input');
      onError?.(err?.message || 'ПEЧАЛЬ. ПOПРOБУЙ СНOВА.');
    }
  }, [apiCall, onError]);

  const handleFlip = useCallback(() => {
    setFlipped(true);
  }, []);

  if (phase === 'input' || phase === 'loading') {
    return (
      <QuestionInput
        spreadType={1}
        onSubmit={handleSubmit}
        loading={phase === 'loading'}
        characterId={characterId}
      />
    );
  }

  if (phase === 'cards' && data) {
    const card = { ...data.cards[0], image_url: `/cards/${data.cards[0].id}.png` };

    return (
      <div className="flex flex-col items-center py-3 px-3 w-full h-full">
        {/* card area — shrinks after flip */}
        <div className={`${flipped ? 'flex-shrink-0 pb-2' : 'flex-1 min-h-0'} flex flex-col items-center w-full ${flipped ? 'justify-start' : 'justify-center'}`}>
          <div className="w-full max-w-[240px] sm:max-w-[326px] lg:max-w-[380px] max-h-full flex-shrink min-h-0">
            <Card
              card={card}
              position="ТВOЯ КАРТА"
              flipped={flipped}
              onFlip={handleFlip}
              characterId={characterId}
            />
          </div>
          {!flipped && (
            <div className="font-pixel text-[11px] text-white/40 mt-3 blink flex-shrink-0">
              НАЖМИ НА КАРТУ
            </div>
          )}
        </div>
        {/* result area — scrollable, takes remaining space */}
        {flipped && (
          <div className="flex-1 min-h-0 overflow-y-auto w-full">
            <ReadingResult interpretation={data.interpretation} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
