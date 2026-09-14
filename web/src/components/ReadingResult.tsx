'use client';

// ─────────────────────────────────────────────────────────────
// ReadingResult — семантическое терминальное чтение.
// LLM отдаёт structured interpretation, React рендерит слои:
// TRANSMISSION → CARDS → WHISPER → SIGNAL → BODY → ADVICE.
// Никакого JSON в presentation layer: только terminal language.
// ─────────────────────────────────────────────────────────────
import { getGuide } from '@/lib/guides';
import type { TarotCard } from './Card';
import ProseType, { proseDuration } from './shell/ProseType';
import { joinedParagraphs } from '@/lib/prose';
import type { Interpretation, ReadingPosition } from '@/lib/api';

interface ReadingResultProps {
  interpretation: Interpretation;
  characterId?: string;
  cards?: TarotCard[];
  question?: string | null;
  spreadLabel?: string;
  instant?: boolean;
}

interface CardLine {
  index: string;
  position: string | null;
  name: string;
  reversed: boolean;
  image_url?: string;
}

interface BodySection {
  label: string;
  prose: string;
}

interface BodyDisclosure {
  summary: string;
  sections: BodySection[];
}

function buildCardLines(
  interp: Interpretation,
  cards?: TarotCard[],
): CardLine[] {
  const positions = Array.isArray(interp.позиции) ? interp.позиции : null;
  if (positions && positions.length > 0) {
    return positions.map((p: ReadingPosition, i: number) => ({
      index: String(i + 1).padStart(2, '0'),
      position: p.позиция ?? null,
      name: p.карта ?? cards?.[i]?.name ?? '',
      reversed: Boolean(p.реверс ?? cards?.[i]?.is_reversed ?? false),
      image_url: cards?.[i]?.image_url,
    }));
  }
  const list = cards ?? [];
  return list.map((c, i) => ({
    index: String(i + 1).padStart(2, '0'),
    position: null,
    name: c.name,
    reversed: Boolean(c.is_reversed),
    image_url: c.image_url,
  }));
}

function buildBodyGroups(interp: Interpretation): { visible: BodySection[]; disclosures: BodyDisclosure[] } {
  const positions = Array.isArray(interp.позиции) ? interp.позиции : null;

  if (positions && positions.length > 0) {
    const posSections: BodySection[] = [];
    positions.forEach((p: ReadingPosition, i: number) => {
      if (p.трактовка) {
        posSections.push({
          label: `${String(i + 1).padStart(2, '0')} · ${p.позиция ?? ''}`,
          prose: p.трактовка,
        });
      }
    });
    const disclosures: BodyDisclosure[] = [];
    if (posSections.length > 0) {
      disclosures.push({
        summary: `позиции · ${String(posSections.length).padStart(2, '0')}`,
        sections: posSections,
      });
    }
    if (interp.связь_карт) {
      disclosures.push({
        summary: 'нить · связь карт',
        sections: [{ label: '', prose: interp.связь_карт }],
      });
    }
    return { visible: [], disclosures };
  }

  if (interp.проявление || interp.траектория || interp.на_что_смотреть) {
    const visible: BodySection[] = [];
    if (interp.проявление) {
      visible.push({ label: 'проявление', prose: interp.проявление });
    }
    if (interp.на_что_смотреть) {
      visible.push({ label: 'на что смотреть', prose: interp.на_что_смотреть });
    }
    const disclosures: BodyDisclosure[] = [];
    if (interp.траектория) {
      const traj: BodySection[] = [];
      for (const t of ['утро', 'день', 'вечер'] as const) {
        const v = interp.траектория[t];
        if (v) traj.push({ label: `траектория · ${t}`, prose: v });
      }
      if (traj.length > 0) {
        disclosures.push({ summary: 'траектория дня', sections: traj });
      }
    }
    return { visible, disclosures };
  }

  const meanings = Array.isArray(interp.card_meaning)
    ? interp.card_meaning
    : interp.card_meaning
      ? [interp.card_meaning]
      : [];
  const visible = meanings.map((m, i) => ({
    label: meanings.length > 1 ? `значение · ${String(i + 1).padStart(2, '0')}` : 'значение',
    prose: m,
  }));
  return { visible, disclosures: [] };
}

const TYPE_SPEED = 8;
const LINE_STEP = 32;

export default function ReadingResult({
  interpretation,
  characterId,
  cards,
  question,
  spreadLabel = 'три карты',
  instant = false,
}: ReadingResultProps) {
  const { intro, short_answer, advice } = interpretation;
  const guide = getGuide(characterId);

  const cardLines = buildCardLines(interpretation, cards);
  const { visible: bodyVisible, disclosures: bodyDisclosures } = buildBodyGroups(interpretation);
  const isDaily = Boolean(interpretation.проявление || interpretation.траектория);
  const transmissionKind = isDaily
    ? 'DAILY TRANSMISSION'
    : cardLines.length > 1
      ? 'THREE-CARD TRANSMISSION'
      : 'SINGLE TRANSMISSION';

  const tHeader = instant ? 0 : (2 + cardLines.length) * LINE_STEP + 45;
  const tWhisper = tHeader;
  const tSignal = instant ? 0 : tWhisper + (intro ? proseDuration(intro, TYPE_SPEED) : 0);
  const tBody = instant ? 0 : tSignal + proseDuration(short_answer, TYPE_SPEED);
  const tAdvice = instant ? 0 : tBody + (bodyVisible.length + bodyDisclosures.length) * 55 + 75;
  const tClose = instant ? 0 : tAdvice + (advice ? proseDuration(advice, TYPE_SPEED) : 0) + 80;

  let delay = 0;
  const next = () => {
    delay += instant ? 0 : LINE_STEP;
    return `${delay}ms`;
  };

  return (
    <div className="px-1 py-2">
      <div className="relative frame-ritual noise-bg p-3 min-h-[120px]">
        <span className="corner-tl">╔</span>
        <span className="corner-tr">┐</span>
        <span className="corner-bl">└</span>
        <span className="corner-br">╝</span>

        <div
          className="circuit-trace circuit-trace--v"
          style={{ left: '12%', top: 0, bottom: 0 }}
        />
        <div
          className="circuit-trace circuit-trace--h"
          style={{ bottom: '20%', left: 0, right: 0 }}
        />

        <span className="glyph-fragment" style={{ top: '8px', right: '20%' }}>■</span>
        <span className="glyph-fragment" style={{ top: '8px', right: '12%' }}>·</span>
        <span className="glyph-fragment" style={{ bottom: '8px', right: '20%' }}>·</span>
        <span className="glyph-fragment" style={{ bottom: '8px', right: '12%' }}>■</span>
        <span className="glyph-fragment" style={{ top: '8px', left: '20%' }}>·</span>
        <span className="glyph-fragment" style={{ top: '8px', left: '12%' }}>■</span>
        <span className="glyph-fragment" style={{ bottom: '8px', left: '20%' }}>■</span>
        <span className="glyph-fragment" style={{ bottom: '8px', left: '12%' }}>·</span>

        <div className="reading relative z-10">
          <div className="reading-line" style={{ '--jl-delay': next() } as React.CSSProperties}>
            <span className="reading-transmission">[ {transmissionKind} ]</span>
          </div>

          <div className="reading-line reading-meta" style={{ '--jl-delay': next() } as React.CSSProperties}>
            <span className="reading-meta-key">сеанс</span>
            <span className="reading-meta-sep"> // </span>
            <span>{spreadLabel}</span>
            <span className="reading-meta-sep"> · </span>
            <span className="reading-meta-key">проводник</span>
            <span className="reading-meta-sep"> // </span>
            <span>{guide.name}</span>
          </div>

          {question != null && question !== '' && (
            <div className="reading-line reading-question" style={{ '--jl-delay': next() } as React.CSSProperties}>
              <span className="reading-meta-key">вопрос</span>
              <span className="reading-meta-sep"> — </span>
              <span>«{question}»</span>
            </div>
          )}

          {cardLines.length > 0 && (
            <div className="reading-artifacts">
              {cardLines.map((c) => (
                <div
                  key={c.index}
                  className="reading-line reading-artifact"
                  style={{ '--jl-delay': next() } as React.CSSProperties}
                >
                  {c.image_url && (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="reading-artifact-img"
                      style={c.reversed ? { transform: 'rotate(180deg)' } : undefined}
                    />
                  )}
                  <div className="reading-card-name">{c.name}</div>
                  <div className={c.reversed ? 'reading-card-rev' : 'reading-card-upright'}>
                    {c.reversed ? '↳ перевёрнутая' : '· прямая'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {intro && (
            <div className="reading-line" style={{ '--jl-delay': `${tWhisper}ms` } as React.CSSProperties}>
              <div className="reading-section-label">// шёпот</div>
              <ProseType
                text={intro}
                startDelay={tWhisper}
                speed={TYPE_SPEED}
                instant={instant}
                quotes={false}
                className="reading-whisper italic"
              />
            </div>
          )}

          <div className="reading-line" style={{ '--jl-delay': `${tSignal}ms` } as React.CSSProperties}>
            <div className="reading-section-label reading-section-label--signal">─ signal ─</div>
            <div className="reading-signal" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
              <ProseType
                text={short_answer}
                startDelay={tSignal}
                speed={TYPE_SPEED}
                instant={instant}
                quotes={false}
                className="reading-signal-text"
              />
            </div>
          </div>

          {bodyVisible.length > 0 && (
            <div className="reading-body">
              {bodyVisible.map((s, i) => (
                <div
                  key={i}
                  className="reading-line"
                  style={{ '--jl-delay': `${tBody + 55 + i * 55}ms` } as React.CSSProperties}
                >
                  {s.label && <div className="reading-section-label">// {s.label}</div>}
                  <div className="reading-body-text">{joinedParagraphs(s.prose)}</div>
                </div>
              ))}
            </div>
          )}

          {bodyDisclosures.map((d, i) => (
            <details
              key={i}
              className="reading-line reading-det"
              style={{ '--jl-delay': `${tBody + 55 + (bodyVisible.length + i) * 55}ms`, '--guide-accent': guide.accent } as React.CSSProperties}
            >
              <summary className="reading-det-summary">
                <span className="reading-det-marker">[+]</span> {d.summary} <span className="reading-det-hint">— раскрой</span>
              </summary>
              <div className="reading-det-body">
                {d.sections.map((s, j) => (
                  <div key={j} className="reading-det-section">
                    {s.label && <div className="reading-section-label">// {s.label}</div>}
                    <div className="reading-body-text">{joinedParagraphs(s.prose)}</div>
                  </div>
                ))}
              </div>
            </details>
          ))}

          {advice && (
            <div className="reading-line" style={{ '--jl-delay': `${tAdvice}ms` } as React.CSSProperties}>
              <div className="reading-section-label reading-section-label--advice">[ advice ]</div>
              <div
                className="reading-advice-box"
                style={{ background: guide.accentDim } as React.CSSProperties}
              >
                <ProseType
                  text={advice}
                  startDelay={tAdvice}
                  speed={TYPE_SPEED}
                  instant={instant}
                  quotes={false}
                  className="reading-advice"
                />
              </div>
            </div>
          )}

          <div
            className="reading-line reading-complete"
            style={{ '--jl-delay': `${tClose}ms` } as React.CSSProperties}
          >
            [ signal complete ] · {guide.tag}
          </div>
        </div>
      </div>

      <div
        className="term-exit mt-1.5 flex items-center justify-between exit-flash"
        style={{ animationDelay: instant ? '0ms' : `${tClose + 50}ms` }}
      >
        <span><span className="te-ok">✓</span> расклад завершён</span>
        <span>{instant ? 'из журнала сеансов' : 'exit 0'}</span>
      </div>
    </div>
  );
}
