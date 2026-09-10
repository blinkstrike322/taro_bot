'use client';

// SpreadBlock — интерактивные карты внутри транскрипта:
// карта дня (1), расклад на 1 карту и пирамида из 3 карт.
// Использует существующий Card (флип, аура, бурст) — только обрамление терминальное.
import Card from '@/components/Card';
import type { TarotCard } from '@/components/Card';

// Фолбэк-позиции для старых записей без серверных позиций — нейтральные,
// не навязывают модель «прошлое-настоящее-будущее».
const FALLBACK_POSITIONS3 = ['нить первая', 'узор дня', 'вектор'];

interface SpreadBlockProps {
  cards: TarotCard[];
  flipped: boolean[];
  count: 1 | 3;
  /** метка позиции для одиночной карты */
  singleLabel?: string;
  /** динамические позиции от бэкенда — вычислены по вопросу пользователя */
  positions?: string[];
  /** фоновый шёпот уже доставлен из канала */
  whisperReady?: boolean;
  /** проводник — определяет цвет ауры/уголков карт */
  characterId?: string;
  onFlip: (index: number) => void;
}

// рассинхрон карточек — лёгкая рукотворность расклада
const OFFSETS = [
  { x: -6, y: 6 },
  { x: 4, y: 5 },
  { x: -3, y: -4 },
];

export default function SpreadBlock({ cards, flipped, count, singleLabel, positions, whisperReady, characterId, onFlip }: SpreadBlockProps) {
  if (count === 3) {
    const allFlipped = flipped.every(Boolean);
    const pos = (i: number) =>
      positions && positions[i] ? positions[i] : FALLBACK_POSITIONS3[i];
    return (
      <div className="spread-wrap">
        <div className="flex flex-col items-center w-full">
          {/* верхняя карта — вторая позиция расклада */}
          <div
            className="w-full max-w-[158px] mb-2"
            style={{ transform: `translate(${OFFSETS[1].x}px, ${OFFSETS[1].y}px)` }}
          >
            <Card
              card={cards[1]}
              position={pos(1)}
              raised
              flipped={flipped[1]}
              onFlip={() => onFlip(1)}
              characterId={characterId}
              floatSeed={11}
            />
          </div>
          {/* нижний ряд — первая и третья позиции */}
          <div className="flex items-start justify-center gap-3 w-full">
            <div
              className="flex-1 min-w-0 max-w-[168px]"
              style={{ transform: `translate(${OFFSETS[0].x}px, ${OFFSETS[0].y}px)` }}
            >
              <Card
                card={cards[0]}
                position={pos(0)}
                flipped={flipped[0]}
                onFlip={() => onFlip(0)}
                characterId={characterId}
                floatSeed={2}
              />
            </div>
            <div
              className="flex-1 min-w-0 max-w-[168px]"
              style={{ transform: `translate(${OFFSETS[2].x}px, ${OFFSETS[2].y}px)` }}
            >
              <Card
                card={cards[2]}
                position={pos(2)}
                flipped={flipped[2]}
                onFlip={() => onFlip(2)}
                characterId={characterId}
                comma={false}
                floatSeed={23}
              />
            </div>
          </div>
        </div>
        {!allFlipped && (
          <div className={`tl tl-comment spread-hint${whisperReady ? ' spread-hint--ready' : ''}`}>
            {whisperReady ? (
              <><span className="blink">//</span> шёпот уже здесь · переверни остальные</>
            ) : (
              <><span className="blink">//</span> переверни карты · канал шепчет</>
            )}
          </div>
        )}
      </div>
    );
  }

  // одиночная карта (день / ask1)
  const isFlipped = flipped[0];
  return (
    <div className="spread-wrap spread-wrap--single">
      <div className="w-full max-w-[224px] mx-auto">
        <Card
          card={cards[0]}
          position={singleLabel}
          flipped={isFlipped}
          onFlip={() => onFlip(0)}
          characterId={characterId}
          comma={false}
          floatSeed={7}
        />
      </div>
      {!isFlipped && (
        <div className={`tl tl-comment spread-hint${whisperReady ? ' spread-hint--ready' : ''}`}>
          {whisperReady ? (
            <><span className="blink">//</span> шёпот уже здесь · коснись, чтобы вскрыть</>
          ) : (
            <><span className="blink">//</span> коснись карты, чтобы вскрыть · канал шепчет</>
          )}
        </div>
      )}
    </div>
  );
}
