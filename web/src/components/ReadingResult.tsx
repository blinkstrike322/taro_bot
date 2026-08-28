'use client';

import { getGuide } from '@/lib/guides';
import type { TarotCard } from './Card';

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[] | string;
  advice: string;
}

interface ReadingResultProps {
  interpretation: Interpretation;
  characterId?: string;
  /** cards of the spread — rendered as the "карты" JSON array */
  cards?: TarotCard[];
  /** question asked — rendered as "вопрос" (null → JSON null) */
  question?: string | null;
  /** spread label: "карта дня" | "одна карта" | "три карты" */
  spreadLabel?: string;
}

// Convert hex color (#RRGGBB) to rgba string at given opacity
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ── tiny JSON token components ── */
const P = ({ children }: { children: React.ReactNode }) => <span className="j-punct">{children}</span>;
const K = ({ children, glow }: { children: React.ReactNode; glow?: boolean }) => (
  <span className={`j-key${glow ? ' j-key-glow' : ''}`}>&quot;{children}&quot;</span>
);

export default function ReadingResult({
  interpretation,
  characterId,
  cards,
  question,
  spreadLabel = 'три карты',
}: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);
  const adviceColor = hexToRgba(guide.accent, 0.75);
  const adviceGlow = `0 0 4px ${hexToRgba(guide.accent, 0.30)}, 0 0 8px ${hexToRgba(guide.accent, 0.15)}`;

  const meanings = Array.isArray(card_meaning) ? card_meaning : (card_meaning ? [card_meaning] : []);
  let delay = 0;
  const next = () => {
    delay += 70;
    return `${delay}ms`;
  };

  return (
    <div className="px-1 py-2">
      <div className="relative frame-ritual noise-bg p-3 min-h-[120px]">
        {/* asymmetrical corner ornaments */}
        <span className="corner-tl">╔</span>
        <span className="corner-tr">┐</span>
        <span className="corner-bl">└</span>
        <span className="corner-br">╝</span>

        {/* circuit traces */}
        <div
          className="circuit-trace circuit-trace--v"
          style={{ left: '12%', top: 0, bottom: 0 }}
        />
        <div
          className="circuit-trace circuit-trace--h"
          style={{ bottom: '20%', left: 0, right: 0 }}
        />

        {/* square and dot ornaments along edges */}
        <span className="glyph-fragment" style={{ top: '8px', right: '20%' }}>■</span>
        <span className="glyph-fragment" style={{ top: '8px', right: '12%' }}>·</span>
        <span className="glyph-fragment" style={{ bottom: '8px', right: '20%' }}>·</span>
        <span className="glyph-fragment" style={{ bottom: '8px', right: '12%' }}>■</span>
        <span className="glyph-fragment" style={{ top: '8px', left: '20%' }}>·</span>
        <span className="glyph-fragment" style={{ top: '8px', left: '12%' }}>■</span>
        <span className="glyph-fragment" style={{ bottom: '8px', left: '20%' }}>■</span>
        <span className="glyph-fragment" style={{ bottom: '8px', left: '12%' }}>·</span>

        <div className="json-readout relative z-10">
          {/* { */}
          <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
            <P>{'{ '}</P>
          </div>

          {/* "сеанс" / "вопрос" */}
          <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
            {'  '}<K>сеанс</K><P>: </P>
            <span className="j-str">&quot;{spreadLabel}&quot;</span><P>,</P>
          </div>

          {question != null && (
            <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
              {'  '}<K>вопрос</K><P>: </P>
              <span className="j-str">&quot;{question}&quot;</span><P>,</P>
            </div>
          )}

          {/* "проводник" */}
          <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
            {'  '}<K>проводник</K><P>: </P>
            <span className="j-str">&quot;{guide.name}&quot;</span><P>,</P>
          </div>

          {/* "карты": [ {...}, {...} ] */}
          {cards && cards.length > 0 && (
            <>
              <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
                {'  '}<K>карты</K><P>: [</P>
              </div>
              {cards.map((c, i) => (
                <div
                  key={c.id + i}
                  className="json-line"
                  style={{ '--jl-delay': next() } as React.CSSProperties}
                >
                  {'    '}
                  <P>{'{ '}</P>
                  <K>имя</K><P>: </P>
                  <span className="j-str">&quot;{c.name}&quot;</span><P>, </P>
                  <K>реверс</K><P>: </P>
                  <span className="j-val">{String(c.is_reversed)}</span>
                  <P> {'}'}{i < cards.length - 1 ? ',' : ''}</P>
                </div>
              ))}
              <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
                {'  '}<P>],</P>
              </div>
            </>
          )}

          {/* "шёпот": intro */}
          {intro && (
            <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
              {'  '}<K glow>шёпот</K><P>: </P>
              <span className="j-str j-multiline italic text-white/60">&quot;{intro}&quot;</span><P>,</P>
            </div>
          )}

          {/* "ответ": short answer — the bright one */}
          <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
            {'  '}<K glow>ответ</K><P>: </P>
            <span className="j-str j-multiline text-[14px] font-medium text-white">&quot;{short_answer}&quot;</span>
            {meanings.length > 0 || advice ? <P>,</P> : null}
          </div>

          {/* "значения": [ ... ] */}
          {meanings.length > 0 && (
            <>
              <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
                {'  '}<K>значения</K><P>: [</P>
              </div>
              {meanings.map((m, i) => (
                <div
                  key={i}
                  className="json-line"
                  style={{ '--jl-delay': next() } as React.CSSProperties}
                >
                  {'    '}<span className="j-str j-multiline text-white/80">&quot;{m}&quot;</span>
                  <P>{i < meanings.length - 1 ? ',' : ''}</P>
                </div>
              ))}
              <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
                {'  '}<P>]{advice ? ',' : ''}</P>
              </div>
            </>
          )}

          {/* "совет": advice — accent + glow */}
          {advice && (
            <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
              {'  '}<K glow>совет</K><P>: </P>
              <span
                className="j-str j-multiline text-[14px] font-medium"
                style={{ color: adviceColor, textShadow: adviceGlow }}
              >
                &quot;{advice}&quot;
              </span>
            </div>
          )}

          {/* } */}
          <div className="json-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
            <P>{'}'}</P>
          </div>
        </div>
      </div>

      {/* exit status */}
      <div className="term-exit mt-1.5 flex items-center justify-between">
        <span><span className="te-ok">✓</span> расклад завершён</span>
        <span>exit 0</span>
      </div>
    </div>
  );
}
