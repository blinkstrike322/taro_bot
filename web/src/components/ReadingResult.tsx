'use client';

// ─────────────────────────────────────────────────────────────
// ReadingResult — JSON-вывод расклада как ответ живого канала.
// Структура печатается построчно, а проза — посимвольно:
// шёпот → ответ (с мерцанием фосфора) → значения → совет.
// Оркестрация через вычисленную временную шкалу.
// ─────────────────────────────────────────────────────────────
import { getGuide } from '@/lib/guides';
import type { TarotCard } from './Card';
import ProseType, { proseDuration } from './shell/ProseType';

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

const TYPE_SPEED = 15; // мс/символ прозаических значений
const LINE_STEP = 65;  // мс между строками структуры

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
  const adviceColor = hexToRgba(guide.accent, 0.78);
  const adviceGlow = `0 0 4px ${hexToRgba(guide.accent, 0.30)}, 0 0 8px ${hexToRgba(guide.accent, 0.15)}`;

  const meanings = Array.isArray(card_meaning) ? card_meaning : (card_meaning ? [card_meaning] : []);

  // ── временная шкала: структура → шёпот → ответ → значения → совет ──
  const headerLineCount =
    1 + // {
    1 + // сеанс
    (question != null ? 1 : 0) +
    1 + // проводник
    (cards && cards.length > 0 ? 2 + cards.length : 0); // карты: [ ... ]

  const tHeader = headerLineCount * LINE_STEP + 90;
  const tWhisper = tHeader;
  const tAnswer = tWhisper + (intro ? proseDuration(intro, TYPE_SPEED) : 0);
  const tMeanings = tAnswer + proseDuration(short_answer, TYPE_SPEED);
  const tAdvice = tMeanings + meanings.length * 110 + 150;
  const tClose = tAdvice + (advice ? proseDuration(advice, TYPE_SPEED) : 0) + 160;

  let delay = 0;
  const next = () => {
    delay += LINE_STEP;
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

          {/* "шёпот": intro — печатается посимвольно */}
          {intro && (
            <div className="json-line" style={{ '--jl-delay': `${tWhisper}ms` } as React.CSSProperties}>
              {'  '}<K glow>шёпот</K><P>: </P>
              <ProseType
                text={intro}
                startDelay={tWhisper}
                speed={TYPE_SPEED}
                tail=","
                className="j-str j-multiline italic"
                style={{ color: 'rgba(236, 233, 246, 0.62)' }}
              />
            </div>
          )}

          {/* "ответ": short answer — яркая строка с мерцанием фосфора */}
          <div className="json-line" style={{ '--jl-delay': `${tAnswer}ms` } as React.CSSProperties}>
            {'  '}<K glow>ответ</K><P>: </P>
            <ProseType
              text={short_answer}
              startDelay={tAnswer}
              speed={TYPE_SPEED}
              tail={meanings.length > 0 || advice ? ',' : undefined}
              shimmer
              className="j-str j-multiline text-[14px] font-medium"
              style={{ color: '#ffffff' }}
            />
          </div>

          {/* "значения": [ ... ] */}
          {meanings.length > 0 && (
            <>
              <div className="json-line" style={{ '--jl-delay': `${tMeanings}ms` } as React.CSSProperties}>
                {'  '}<K>значения</K><P>: [</P>
              </div>
              {meanings.map((m, i) => (
                <div
                  key={i}
                  className="json-line"
                  style={{ '--jl-delay': `${tMeanings + 110 + i * 110}ms` } as React.CSSProperties}
                >
                  {'    '}<span className="j-str j-multiline text-white/80">&quot;{m}&quot;</span>
                  <P>{i < meanings.length - 1 ? ',' : ''}</P>
                </div>
              ))}
              <div className="json-line" style={{ '--jl-delay': `${tMeanings + 110 + meanings.length * 110}ms` } as React.CSSProperties}>
                {'  '}<P>]{advice ? ',' : ''}</P>
              </div>
            </>
          )}

          {/* "совет": advice — акцентный, печатается посимвольно */}
          {advice && (
            <div className="json-line" style={{ '--jl-delay': `${tAdvice}ms` } as React.CSSProperties}>
              {'  '}<K glow>совет</K><P>: </P>
              <ProseType
                text={advice}
                startDelay={tAdvice}
                speed={TYPE_SPEED}
                className="j-str j-multiline text-[14px] font-medium"
                style={{ color: adviceColor, textShadow: adviceGlow }}
              />
            </div>
          )}

          {/* } */}
          <div className="json-line" style={{ '--jl-delay': `${tClose}ms` } as React.CSSProperties}>
            <P>{'}'}</P>
          </div>
        </div>
      </div>

      {/* exit status */}
      <div
        className="term-exit mt-1.5 flex items-center justify-between exit-flash"
        style={{ animationDelay: `${tClose + 100}ms` }}
      >
        <span><span className="te-ok">✓</span> расклад завершён</span>
        <span>exit 0</span>
      </div>
    </div>
  );
}
