'use client';

// ─────────────────────────────────────────────────────────────
// SpreadBlock — интерактивные карты внутри транскрипта.
// Один движок рендера: флоу-лейауты (column1/trio) и слотовые
// (pyramid/spine/pentagram/arc) через getLayoutSlots —
// координаты заданы в каталоге, каждой карте своя ячейка.
// Вскрытие строго по flipOrder (ключи → индексы через
// positionKeys). Клик мимо очереди — однократный shake.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import Card, { type TarotCard } from '@/components/arcanum/Card';
import { getLayoutSlots, LAYOUT_ASPECT, PENTAGRAM_EDGES, type SpreadSlot } from '@/lib/spreads';
import { haptic, sError } from '@/lib/sound';

interface SpreadBlockProps {
  cards: TarotCard[];
  flipped: boolean[];
  count: number;
  layout?: string;
  positions?: string[];
  positionKeys?: string[];
  flipOrder?: string[];
  singleLabel?: string;
  whisperReady?: boolean;
  characterId?: string;
  onFlip: (index: number) => void;
}

const FALLBACK_POSITIONS3 = ['нить первая', 'узор дня', 'вектор'];

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
  // ── порядок вскрытия: ключи flipOrder → индексы карт ──
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

  // первый невскрытый в порядке вскрытия
  const nextIdx = sequence.find((i) => !flipped[i]);
  const revealedCount = flipped.filter(Boolean).length;

  // ── клик мимо очереди: shake + тихий отказ ──
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
      haptic('warn');
      sError();
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShakeIdx(null), 380);
      return;
    }
    onFlip(index);
  };

  const posName = (i: number): string =>
    positions?.[i] ?? FALLBACK_POSITIONS3[i] ?? `позиция ${i + 1}`;

  const shakeCls = (i: number): string => (shakeIdx === i ? ' spread-shake' : '');
  const floatSeed = (i: number): number => i * 11 + 7;
  const nextName =
    nextIdx === undefined
      ? ''
      : singleLabel ?? positions?.[nextIdx] ?? FALLBACK_POSITIONS3[nextIdx] ?? `карта ${nextIdx + 1}`;

  const isSlotLayout =
    layout === 'pyramid' || layout === 'spine' || layout === 'pentagram' || layout === 'arc';
  const slots = useMemo(
    () =>
      isSlotLayout && layout
        ? getLayoutSlots(layout as any, positionKeys ?? undefined)
        : null,
    [isSlotLayout, layout, positionKeys],
  );

  // подсказка очереди
  const hint = nextIdx !== undefined && (
    <div className={`tl tl-comment spread-hint${whisperReady ? ' spread-hint--ready' : ''}`}>
      {whisperReady ? (
        <><span className="blink">{'//'}</span> шёпот здесь · вскрой: {nextName}</>
      ) : (
        <><span className="blink">{'//'}</span> вскрой: {nextName}</>
      )}
    </div>
  );

  const progress = cards.length > 1 && nextIdx !== undefined && (
    <div className="spread-progress" aria-label={`вскрыто ${revealedCount} из ${cards.length}`}>
      <span className="sp-count">{revealedCount}/{cards.length}</span>
      <span className="sp-bar">
        <span
          className="sp-fill"
          style={{ width: `${(revealedCount / cards.length) * 100}%` }}
        />
      </span>
    </div>
  );

  const renderCard = (i: number, dealDelay: number, compact: boolean, positionOverride?: string) => (
    <Card
      card={cards[i]}
      position={positionOverride ?? posName(i)}
      flipped={flipped[i]}
      isNext={i === nextIdx}
      onFlip={() => handleCardClick(i)}
      characterId={characterId}
      floatSeed={floatSeed(i)}
      dealDelay={dealDelay}
      compact={compact}
    />
  );

  // ── одиночная колонка (карта дня / одна карта) ──
  if (!isSlotLayout && layout === 'column1') {
    return (
      <div className="spread-wrap spread-wrap--single">
        <div className={`w-full max-w-[210px] mx-auto${shakeCls(0)}`}>
          {renderCard(0, 0, false, singleLabel ?? positions?.[0])}
        </div>
        {hint}
      </div>
    );
  }

  // ── трио: сетка из трёх равных колонок ──
  if (!isSlotLayout) {
    return (
      <div className="spread-wrap">
        <div className="spread-trio">
          {cards.map((_, i) => (
            <div key={i} className={`spread-cell spread-cell--flow${shakeCls(i)}`}>
              {renderCard(i, 120 + i * 110, false)}
            </div>
          ))}
        </div>
        {progress}
        {hint}
      </div>
    );
  }

  // ── слотовые лейауты: единый движок позиционирования ──
  const aspect = LAYOUT_ASPECT[layout as keyof typeof LAYOUT_ASPECT] ?? '1 / 1';
  const compact = layout === 'pentagram' || layout === 'arc';

  return (
    <div className="spread-wrap">
      <div className={`spread-stage spread-stage--${layout}`} style={{ aspectRatio: aspect }}>
        {/* контуры ритуальной геометрии */}
        {layout === 'pentagram' && (
          <svg
            className="spread-geometry"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <circle cx="50" cy="50" r="46" className="sg-circle" />
            {PENTAGRAM_EDGES.map(([a, b], i) => {
              const p1 = PG_SLOTS_BY_KEY[a];
              const p2 = PG_SLOTS_BY_KEY[b];
              if (!p1 || !p2) return null;
              return (
                <line
                  key={i}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  className="sg-line"
                />
              );
            })}
          </svg>
        )}
        {layout === 'spine' && <div className="spine-trace" aria-hidden="true" />}
        {layout === 'pyramid' && <div className="pyramid-trace" aria-hidden="true" />}
        {layout === 'arc' && <div className="arc-trace" aria-hidden="true" />}

        {(slots ?? []).map((slot: SpreadSlot, i: number) => {
          if (!cards[i]) return null;
          return (
            <div
              key={i}
              className={`spread-cell spread-cell--slot${shakeCls(i)}`}
              style={{
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                width: `${slot.w}%`,
                transform: `translate(-50%, -50%) rotate(${slot.rot}deg)`,
                zIndex: slot.z,
                '--deal-delay': `${140 + i * 130}ms`,
              } as React.CSSProperties}
            >
              {renderCard(i, 0, compact)}
            </div>
          );
        })}
      </div>
      {progress}
      {hint}
    </div>
  );
}

// точки вершин пентаграммы для SVG-контура (синхронно с PG_SLOTS в spreads.ts)
const PG_SLOTS_BY_KEY: Record<string, { x: number; y: number }> = {
  spirit: { x: 50, y: 16 },
  air: { x: 79, y: 38 },
  water: { x: 72, y: 84.5 },
  earth: { x: 28, y: 84.5 },
  fire: { x: 21, y: 38 },
};
