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
  mood?: { id: string; name: string } | null;
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
    const card = { ...data.cards[0], image_url: `/cards/${data.cards[0].id}.webp?v=2` };

    // Единое дерево на весь цикл: карта не перемонтируется и не сдвигается,
    // толкование просто въезжает снизу. pt-14 и до, и после — без рывка.
    return (
      <div className="flex flex-col items-center pt-14 pb-2 px-3 w-full">
        <div
          className="w-full flex-shrink-0 pb-2"
          style={{
            maxWidth: 'min(440px, 92vw)',
            transform: `rotate(${flipped ? -1.2 : -2}deg)`,
            transition: 'transform 0.9s cubic-bezier(0.34, 1.2, 0.64, 1)',
          }}
        >
          <Card
            card={card}
            position="ТВОЯ КАРТА"
            flipped={flipped}
            onFlip={handleFlip}
            tilt={flipped ? -1.2 : -2}
            characterId={characterId}
          />
        </div>
        {!flipped ? (
          <div className="tech-label mt-4 blink">
            коснись карты
          </div>
        ) : (
          <div className="w-full result-in">
            <ReadingResult
              interpretation={data.interpretation}
              characterId={characterId}
              readingId={data.readingId}
              moodName={data.mood?.name}
            />
          </div>
        )}
      </div>
    );
  }

  return null;
}
