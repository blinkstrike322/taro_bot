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
    card_meaning: string[];
    advice: string;
  };
}

interface Spread1CardProps {
  apiCall: (question: string | null) => Promise<ReadingData>;
}

export default function Spread1Card({ apiCall }: Spread1CardProps) {
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
    } catch {
      setPhase('input');
    }
  }, [apiCall]);

  const handleFlip = useCallback(() => {
    setFlipped(true);
  }, []);

  if (phase === 'input' || phase === 'loading') {
    return (
      <QuestionInput
        spreadType={1}
        onSubmit={handleSubmit}
        loading={phase === 'loading'}
      />
    );
  }

  if (phase === 'cards' && data) {
    const card = { ...data.cards[0], image_url: `/cards/${data.cards[0].id}.png` };

    return (
      <div className="flex flex-col items-center py-4 px-3 w-full">
        <div className="w-48 sm:w-56">
          <Card
            card={card}
            position="ТВOЯ КАРТА"
            flipped={flipped}
            onFlip={handleFlip}
          />
        </div>
        {!flipped && (
          <div className="font-pixel text-[11px] text-white/40 mt-3 blink">
            НАЖМИ НА КАРТУ
          </div>
        )}
        {flipped && <ReadingResult interpretation={data.interpretation} />}
      </div>
    );
  }

  return null;
}
