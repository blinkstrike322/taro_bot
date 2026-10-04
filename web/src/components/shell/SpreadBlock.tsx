'use client';

// SpreadBlock — интерактивные карты внутри транскрипта.
// Геометрии раскладов из каталога (layout): column1 | trio | pyramid |
// spine | pentagram | arc. Вскрытие строго по flipOrder (ключи позиций →
// индексы через positionKeys: cards[i] ↔ positionKeys[i]); без flipOrder —
// слева направо. Клик мимо очереди игнорируется с однократным shake.
// Позиции-имена приходят от бэкенда (positions[i] ↔ cards[i]).
import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/Card';
import type { TarotCard } from '@/components/Card';

// Фолбэк-позиции для старых записей без серверных позиций — нейтральные,
// не навязывают модель «прошлое-настоящее-будущее».
const FALLBACK_POSITIONS3 = ['нить первая', 'узор дня', 'вектор'];

interface SpreadBlockProps {
  cards: TarotCard[];
  flipped: boolean[];
  count: number;
  /** макет расклада из каталога (column1/trio/pyramid/spine/pentagram/arc) */
  layout?: string;
  /** имена позиций от бэкенда — cards[i] ↔ positions[i] */
  positions?: string[];
  /** ключи позиций от бэкенда — cards[i] ↔ positionKeys[i] */
  positionKeys?: string[];
  /** порядок вскрытия — ключи позиций каталога */
  flipOrder?: string[];
  /** метка позиции для одиночной карты */
  singleLabel?: string;
  /** фоновый шёпот уже доставлен из канала */
  whisperReady?: boolean;
  /** проводник — определяет цвет ауры/уголков карт */
  characterId?: string;
  onFlip: (index: number) => void;
}

// дуга подковы: вертикальные микросдвиги 7 карт (края ниже, центр выше)
const ARC_DY = [14, 4, -2, -6, -2, 4, 14];

// слоты пентаграммы по ключам позиций каталога
const PG_SLOTS = ['center', 'spirit', 'fire', 'water', 'earth', 'air'];

export default function SpreadBlock({
  cards,
  flipped,
  count,
  layout,
  positions,
  positionKeys,
  flipOrder,
  singleLabel,
  whisperReady,
  characterId,
  onFlip,
}: SpreadBlockProps) {
  // ── порядок вскрытия: ключи flipOrder → индексы карт через positionKeys.
  // Ключи вида p1..pN (каталожная конвенция) мапятся сами, если positionKeys
  // не дошли; непонятые ключи пропускаются, остаток добивается слева направо.
  const sequence = useMemo<number[]>(() => {
    const n = cards.length;
    if (!flipOrder || flipOrder.length === 0) {
      return Array.from({ length: n }, (_, i) => i);
    }
    const byKey = new Map<string, number>();
    (positionKeys ?? []).forEach((k, i) => byKey.set(k, i));
    const seq: number[] = [];
    for (const key of flipOrder) {
      let idx = byKey.get(key);
      if (idx === undefined) {
        const m = /^p(\d+)$/.exec(key);
        if (m) idx = Number(m[1]) - 1;
      }
      if (idx !== undefined && idx >= 0 && idx < n && !seq.includes(idx)) {
        seq.push(idx);
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (!seq.includes(i)) seq.push(i);
    }
    return seq;
  }, [cards.length, flipOrder, positionKeys]);

  // первый нефтёркнутый в порядке вскрытия; undefined → все вскрыты
  const nextIdx = sequence.find((i) => !flipped[i]);
  const nextName =
    nextIdx === undefined
      ? ''
      : singleLabel
        ?? positions?.[nextIdx]
        ?? FALLBACK_POSITIONS3[nextIdx]
        ?? `карта ${nextIdx + 1}`;

  // ── клик мимо очереди: игнор + однократный shake (класс на 300мс) ──
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    },
    [],
  );
  const handleCardClick = (index: number) => {
    if (index !== nextIdx) {
      setShakeIdx(index);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShakeIdx(null), 300);
      return;
    }
    onFlip(index);
  };

  // ── макет: строка каталога; легаси без layout — старое поведение
  // (3 карты → пирамида, остальное → одиночная колонка) ──
  const resolved =
    layout === 'trio' || layout === 'pyramid' || layout === 'spine' ||
    layout === 'pentagram' || layout === 'arc'
      ? layout
      : count === 3
        ? 'pyramid'
        : 'column1';

  const posName = (i: number): string =>
    positions?.[i] ?? FALLBACK_POSITIONS3[i] ?? `позиция ${i + 1}`;
  const shakeCls = (i: number): string =>
    shakeIdx === i ? ' spread-shake' : '';
  const floatSeed = (i: number): number => i * 11 + 7;

  // ── подсказка: имя следующей позиции; ready-вариант светится акцентом ──
  const hint = nextIdx !== undefined && (
    <div className={`tl tl-comment spread-hint${whisperReady ? ' spread-hint--ready' : ''}`}>
      {whisperReady ? (
        <><span className="blink">//</span> шепот уже здесь · вскрой: {nextName}</>
      ) : (
        <><span className="blink">//</span> вскрой: {nextName}</>
      )}
    </div>
  );

  // одиночная колонка — карта дня / одна карта (column1)
  if (resolved === 'column1') {
    return (
      <div className="spread-wrap spread-wrap--single">
        <div className={`w-full max-w-[224px] mx-auto${shakeCls(0)}`}>
          <Card
            card={cards[0]}
            position={singleLabel ?? positions?.[0]}
            flipped={flipped[0]}
            onFlip={() => handleCardClick(0)}
            characterId={characterId}
            floatSeed={floatSeed(0)}
          />
        </div>
        {hint}
      </div>
    );
  }

  // трио — три карты в ряд, метки позиций под картами
  if (resolved === 'trio') {
    return (
      <div className="spread-wrap">
        <div className="spread-trio">
          {cards.map((_, i) => (
            <div key={i} className={`spread-cell${shakeCls(i)}`}>
              <Card
                card={cards[i]}
                flipped={flipped[i]}
                onFlip={() => handleCardClick(i)}
                characterId={characterId}
                floatSeed={floatSeed(i)}
              />
              {!flipped[i] && (
                <div className="card-label">
                  <span className="cl-punct">{'// '}</span>
                  <span className="cl-key">{posName(i)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        {hint}
      </div>
    );
  }

  // пирамида — верх (позиция 2) над нижними [0] и [2], без рукотворных сдвигов
  if (resolved === 'pyramid') {
    return (
      <div className="spread-wrap spread-pyramid">
        <div className="flex flex-col items-center w-full">
          {/* верхняя карта — вторая позиция расклада */}
          <div className={`w-full max-w-[158px] mb-2${shakeCls(1)}`}>
            <Card
              card={cards[1]}
              position={posName(1)}
              raised
              flipped={flipped[1]}
              onFlip={() => handleCardClick(1)}
              characterId={characterId}
              floatSeed={floatSeed(1)}
            />
          </div>
          {/* нижний ряд — первая и третья позиции */}
          <div className="flex items-start justify-center gap-3 w-full max-w-[380px]">
            {[0, 2].map((i) => (
              <div key={i} className={`flex-1 min-w-0 max-w-[168px]${shakeCls(i)}`}>
                <Card
                  card={cards[i]}
                  position={posName(i)}
                  flipped={flipped[i]}
                  onFlip={() => handleCardClick(i)}
                  characterId={characterId}
                  floatSeed={floatSeed(i)}
                />
              </div>
            ))}
          </div>
        </div>
        {hint}
      </div>
    );
  }

  // хребет — 4 карты стеком слева, 2 справа с отступом сверху
  if (resolved === 'spine') {
    return (
      <div className="spread-wrap">
        <div className="spread-spine">
          {cards.map((_, i) => (
            <div key={i} className={`spread-cell${shakeCls(i)}`}>
              <Card
                card={cards[i]}
                position={posName(i)}
                flipped={flipped[i]}
                onFlip={() => handleCardClick(i)}
                characterId={characterId}
                floatSeed={floatSeed(i)}
              />
            </div>
          ))}
        </div>
        {hint}
      </div>
    );
  }

  // пентаграмма — ритуальный круг, слоты по ключам позиций
  if (resolved === 'pentagram') {
    return (
      <div className="spread-wrap">
        <div className="spread-pentagram">
          {cards.map((_, i) => {
            const key = positionKeys?.[i];
            const slot = key && PG_SLOTS.includes(key)
              ? key
              : PG_SLOTS[i] ?? 'center';
            return (
              <div
                key={i}
                className={`spread-cell spread-cell--${slot}${shakeCls(i)}`}
              >
                <Card
                  card={cards[i]}
                  position={posName(i)}
                  flipped={flipped[i]}
                  onFlip={() => handleCardClick(i)}
                  characterId={characterId}
                  floatSeed={floatSeed(i)}
                />
              </div>
            );
          })}
        </div>
        {hint}
      </div>
    );
  }

  // подкова — 7 карт дугой в три ряда
  return (
    <div className="spread-wrap">
      <div className="spread-arc">
        {cards.map((_, i) => (
          <div
            key={i}
            className={`spread-cell${shakeCls(i)}`}
            style={{ marginTop: ARC_DY[i] ?? 0 }}
          >
            <Card
              card={cards[i]}
              position={posName(i)}
              flipped={flipped[i]}
              onFlip={() => handleCardClick(i)}
              characterId={characterId}
              floatSeed={floatSeed(i)}
            />
          </div>
        ))}
      </div>
      {hint}
    </div>
  );
}
