'use client';

// SpreadBlock — интерактивные карты внутри транскрипта:
// карта дня (1), расклад на 1 карту и пирамида из 3 карт.
// Использует существующий Card (флип, аура, бурст) — только обрамление терминальное.
import Card from '@/components/Card';
import type { TarotCard } from '@/components/Card';

const POSITIONS3 = ['прошлое', 'настоящее', 'будущее'];

interface SpreadBlockProps {
  cards: TarotCard[];
  flipped: boolean[];
  count: 1 | 3;
  /** метка позиции для одиночной карты */
  singleLabel?: string;
  onFlip: (index: number) => void;
}

// рассинхрон карточек — лёгкая рукотворность расклада
const OFFSETS = [
  { x: -6, y: 6 },
  { x: 4, y: 5 },
  { x: -3, y: -4 },
];

export default function SpreadBlock({ cards, flipped, count, singleLabel, onFlip }: SpreadBlockProps) {
  if (count === 3) {
    const allFlipped = flipped.every(Boolean);
    return (
      <div className="spread-wrap">
        <div className="flex flex-col items-center w-full">
          {/* верхняя карта — настоящее */}
          <div
            className="w-full max-w-[150px] mb-2"
            style={{ transform: `translate(${OFFSETS[1].x}px, ${OFFSETS[1].y}px)` }}
          >
            <Card
              card={cards[1]}
              position={POSITIONS3[1]}
              raised
              flipped={flipped[1]}
              onFlip={() => onFlip(1)}
              floatSeed={11}
            />
          </div>
          {/* нижний ряд — прошлое + будущее */}
          <div className="flex items-start justify-center gap-3 w-full">
            <div
              className="flex-1 min-w-0 max-w-[160px]"
              style={{ transform: `translate(${OFFSETS[0].x}px, ${OFFSETS[0].y}px)` }}
            >
              <Card
                card={cards[0]}
                position={POSITIONS3[0]}
                flipped={flipped[0]}
                onFlip={() => onFlip(0)}
                floatSeed={2}
              />
            </div>
            <div
              className="flex-1 min-w-0 max-w-[160px]"
              style={{ transform: `translate(${OFFSETS[2].x}px, ${OFFSETS[2].y}px)` }}
            >
              <Card
                card={cards[2]}
                position={POSITIONS3[2]}
                flipped={flipped[2]}
                onFlip={() => onFlip(2)}
                comma={false}
                floatSeed={23}
              />
            </div>
          </div>
        </div>
        {!allFlipped && (
          <div className="tl tl-comment spread-hint">
            <span className="blink">//</span> переверни все карты
          </div>
        )}
      </div>
    );
  }

  // одиночная карта (день / ask1)
  const isFlipped = flipped[0];
  return (
    <div className="spread-wrap spread-wrap--single">
      <div className="w-full max-w-[172px] mx-auto">
        <Card
          card={cards[0]}
          position={singleLabel}
          flipped={isFlipped}
          onFlip={() => onFlip(0)}
          comma={false}
          floatSeed={7}
        />
      </div>
      {!isFlipped && (
        <div className="tl tl-comment spread-hint">
          <span className="blink">//</span> коснись карты, чтобы вскрыть
        </div>
      )}
    </div>
  );
}
