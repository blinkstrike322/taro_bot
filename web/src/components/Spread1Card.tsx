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

    if (!flipped) {
      return (
        <div className="flex flex-col items-center py-3 px-3 w-full h-full">
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
            <div className="w-full max-w-[332px] sm:max-w-[448px] lg:max-w-[524px]">
              <Card
                card={card}
                position="ТВOЯ КАРТА"
                flipped={false}
                onFlip={handleFlip}
                characterId={characterId}
              />
            </div>
            <div className="font-pixel text-[11px] text-white/40 mt-3 blink flex-shrink-0">
              НАЖМИ НА КАРТУ
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center py-3 px-3 w-full">
        {/* compact card at top — same width as before flip */}
        <div className="w-full max-w-[332px] sm:max-w-[448px] lg:max-w-[524px] flex-shrink-0 pb-3">
          <Card
            card={card}
            flipped={true}
            characterId={characterId}
          />
        </div>
        {/* result flows below — parent scrolls */}
        <div className="w-full pb-4">
          <ReadingResult interpretation={data.interpretation} characterId={characterId} />
        </div>
      </div>
    );
  }

  return null;
}
