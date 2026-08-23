'use client';

import { useState, useCallback } from 'react';
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
}

interface Spread1CardProps {
  apiCall: (question: string | null) => Promise<ReadingData>;
  characterId?: string;
  onError?: (msg: string) => void;
}

export default function Spread1Card({ apiCall, characterId, onError }: Spread1CardProps) {
  const { setPhase: setAtmoPhase } = useAtmosphere();
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
      onError?.(err?.message || 'Не получилось. Попробуй снова.');
    }
  }, [apiCall, onError]);

  const handleFlip = useCallback(() => {
    setFlipped(true);
    setAtmoPhase('reveal');
    setTimeout(() => setAtmoPhase('reading'), 1400);
  }, [setAtmoPhase]);

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
    const card = { ...data.cards[0], image_url: `/cards/${data.cards[0].id}.webp` };

    if (!flipped) {
      return (
        <div className="flex flex-col items-center pt-12 pb-2 px-3 w-full">
          <div className="flex flex-col items-center w-full">
            <div className="w-full max-w-[319px] sm:max-w-[370px]" style={{ transform: 'rotate(-2deg)' }}>
              <Card
                card={card}
                position="ТВОЯ КАРТА"
                flipped={false}
                onFlip={handleFlip}
                tilt={-2}
                characterId={characterId}
              />
            </div>
            <div className="tech-label mt-4 blink">
              коснись карты
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center pt-4 pb-2 px-3 w-full">
        {/* компактная карта сверху */}
        <div className="w-full max-w-[319px] sm:max-w-[370px] flex-shrink-0 pb-2" style={{ transform: 'rotate(-1.2deg)' }}>
          <Card
            card={card}
            flipped={true}
            tilt={-1.2}
            characterId={characterId}
          />
        </div>
        {/* толкование */}
        <div className="w-full">
          <ReadingResult
            interpretation={data.interpretation}
            characterId={characterId}
            readingId={data.readingId}
          />
        </div>
      </div>
    );
  }

  return null;
}
