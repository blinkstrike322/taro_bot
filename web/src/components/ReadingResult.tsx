'use client';

// ─────────────────────────────────────────────────────────────
// ReadingResult — JSON-вывод расклада как ответ живого канала.
// Структура печатается построчно, а проза — посимвольно:
// шёпот → ответ/сигнал → тело (значения | позиции+связь | день) → совет.
// Оркестрация через вычисленную временную шкалу.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { getGuide } from '@/lib/guides';
import type { TarotCard } from './Card';
import ProseType, { proseDuration } from './shell/ProseType';
import { joinedParagraphs } from '@/lib/prose';

interface ReadingPosition {
  позиция?: string;
  карта?: string;
  реверс?: boolean;
  трактовка?: string;
}

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning?: string[] | string;
  advice?: string;
  // новая схема этапа 2 (аддитивная, легаси-фолбэк на card_meaning)
  позиции?: ReadingPosition[];
  связь_карт?: string;
  проявление?: string;
  на_что_смотреть?: string;
  траектория?: { утро?: string; день?: string; вечер?: string };
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
  /** вызывается после полного появления расклада — Shell скроллит к его началу */
  onDone?: () => void;
}

type BodyRow =
  | { kind: 'prose'; label: string | null; prose: string }
  | { kind: 'header'; text: string }
  | { kind: 'close'; text: string };

function buildBodyRows(interp: Interpretation): { header: string | null; rows: BodyRow[] } {
  const positions = Array.isArray(interp.позиции) ? interp.позиции : null;
  const dailyMeta = interp.проявление || interp.траектория;
  const rows: BodyRow[] = [];
  let header: string | null = null;

  if (positions) {
    header = 'позиции';
    positions.forEach((p, i) => {
      const card = `${p.карта ?? ''}${p.реверс ? ' ⟲' : ''}`;
      const label = `${String(i + 1).padStart(2, '0')} · ${p.позиция ?? ''}${card ? ` — ${card}` : ''}`;
      rows.push({ kind: 'prose', label, prose: p.трактовка ?? '' });
    });
    if (interp.связь_карт) rows.push({ kind: 'prose', label: 'связь_карт', prose: interp.связь_карт });
  } else if (dailyMeta) {
    if (interp.проявление) rows.push({ kind: 'prose', label: 'проявление', prose: interp.проявление });
    if (interp.на_что_смотреть) rows.push({ kind: 'prose', label: 'на что смотреть', prose: interp.на_что_смотреть });
    if (interp.траектория) {
      for (const t of ['утро', 'день', 'вечер'] as const) {
        const v = interp.траектория[t];
        if (v) rows.push({ kind: 'prose', label: `траектория · ${t}`, prose: v });
      }
    }
  } else {
    const meanings = Array.isArray(interp.card_meaning)
      ? interp.card_meaning
      : interp.card_meaning
        ? [interp.card_meaning]
        : [];
    header = meanings.length ? 'значения' : null;
    meanings.forEach((m) => rows.push({ kind: 'prose', label: null, prose: m }));
  }

  if (header) rows.unshift({ kind: 'header', text: header });
  if (header) rows.push({ kind: 'close', text: '' });
  return { header, rows };
}

// Convert hex color (#RRGGBB) to rgba string at given opacity
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TYPE_SPEED = 8;  // мс/символ прозаических значений (~2× быстрее)
const LINE_STEP = 32;  // мс между строками структуры (~2× быстрее)

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
  onDone,
}: ReadingResultProps) {
  const { intro, short_answer, advice } = interpretation;
  const guide = getGuide(characterId);
  const adviceColor = hexToRgba(guide.accent, 0.78);
  const adviceGlow = `0 0 4px ${hexToRgba(guide.accent, 0.30)}, 0 0 8px ${hexToRgba(guide.accent, 0.15)}`;

  const dailyMeta = interpretation.проявление || interpretation.траектория;
  const answerKey = dailyMeta ? 'сигнал' : 'ответ';
  const { rows: bodyRows } = buildBodyRows(interpretation);
  const bodyHeader = bodyRows[0]?.kind === 'header' ? bodyRows[0].text : null;

  // ── временная шкала: структура → шёпот → ответ → тело → совет ──
  const headerLineCount =
    1 + // {
    1 + // сеанс
    (question != null ? 1 : 0) +
    1 + // проводник
    (cards && cards.length > 0 ? 2 + cards.length : 0); // карты: [ ... ]

  const tHeader = headerLineCount * LINE_STEP + 45;
  const tWhisper = tHeader;
  const tAnswer = tWhisper + (intro ? proseDuration(intro, TYPE_SPEED) : 0);
  const tBody = tAnswer + proseDuration(short_answer, TYPE_SPEED);
  const tAdvice = tBody + bodyRows.length * 55 + 75;
  const tClose = tAdvice + (advice ? proseDuration(advice, TYPE_SPEED) : 0) + 80;

  // когда расклад полностью появился — зовём Shell, чтобы он скроллил к началу
  useEffect(() => {
    if (!onDone) return;
    const id = setTimeout(onDone, tClose + 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tClose, onDone]);

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

          {/* "ответ"/"сигнал": short answer — яркая строка с мерцанием фосфора */}
          <div className="json-line" style={{ '--jl-delay': `${tAnswer}ms` } as React.CSSProperties}>
            {'  '}<K glow>{answerKey}</K><P>: </P>
            <ProseType
              text={short_answer}
              startDelay={tAnswer}
              speed={TYPE_SPEED}
              tail={bodyRows.length > 0 || advice ? ',' : undefined}
              shimmer
              className="j-str j-multiline text-[14px] font-medium"
              style={{ color: '#ffffff' }}
            />
          </div>

          {/* тело: значения (легаси) / позиции+связь_карт / карта дня */}
          {bodyRows.length > 0 && (
            <>
              {bodyHeader && (
                <div className="json-line" style={{ '--jl-delay': `${tBody}ms` } as React.CSSProperties}>
                  {'  '}<K>{bodyHeader}</K><P>: </P><P>[</P>
                </div>
              )}
              {bodyRows
                .filter((r): r is Extract<BodyRow, { kind: 'prose' }> => r.kind === 'prose')
                .map((r, i, arr) => {
                  const comma = bodyHeader
                    ? i < arr.length - 1 || advice
                      ? ','
                      : ''
                    : ',';
                  const delay = `${tBody + 55 + i * 55}ms`;
                  return (
                    <div key={i} className="json-line" style={{ '--jl-delay': delay } as React.CSSProperties}>
                      {'  '}
                      {r.label ? <><K>{r.label}</K><P>: </P></> : <P>  </P>}
                      <span className="j-str j-multiline text-white/80">&quot;{joinedParagraphs(r.prose)}&quot;</span>
                      <P>{comma}</P>
                    </div>
                  );
                })}
              {bodyHeader && (
                <div className="json-line" style={{ '--jl-delay': `${tBody + 55 * bodyRows.length}ms` } as React.CSSProperties}>
                  {'  '}<P>]{advice ? ',' : ''}</P>
                </div>
              )}
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
        style={{ animationDelay: `${tClose + 50}ms` }}
      >
        <span><span className="te-ok">✓</span> расклад завершён</span>
        <span>exit 0</span>
      </div>
    </div>
  );
}
