'use client';

// ─────────────────────────────────────────────────────────────
// ReadingResult — семантическое терминальное чтение (v2).
// Секции рендерятся последовательно: стадия i маунтится, когда
// предыдущая отчиталась (ProseType onDone / autoAdvance-таймер).
// Никаких pre-computed задержек для прозы — только события.
// instant (журнал) — всё сразу, без таймеров.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { getGuide } from '@/lib/guides';
import type { TarotCard } from './Card';
import ProseType from './shell/ProseType';
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
  card?: string;
  reversed?: boolean;
}

interface BodyDisclosure {
  summary: string;
  sections: BodySection[];
}

// порядок секций; ProseType-стадии двигаются по onDone, остальные — по таймеру
interface StageSpec {
  id: 'header' | 'intro' | 'signal' | 'body' | 'synthesis' | 'disclosure' | 'advice' | 'close';
  autoMs?: number;
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

// позиции — всегда visible-секции (карта инлайном); disclosures — только
// траектория дня (daily); связь_карт — отдельная «нить» перед советом
function buildBodyGroups(
  interp: Interpretation,
  cards?: TarotCard[],
): { visible: BodySection[]; synthesis: string | null; disclosures: BodyDisclosure[] } {
  const positions = Array.isArray(interp.позиции) ? interp.позиции : null;

  if (positions && positions.length > 0) {
    const visible: BodySection[] = [];
    positions.forEach((p: ReadingPosition, i: number) => {
      if (p.трактовка) {
        const num = String(i + 1).padStart(2, '0');
        visible.push({
          label: p.позиция ? `${num} · ${p.позиция}` : num,
          prose: p.трактовка,
          card: p.карта ?? cards?.[i]?.name,
          reversed: Boolean(p.реверс ?? cards?.[i]?.is_reversed ?? false),
        });
      }
    });
    return { visible, synthesis: interp.связь_карт ?? null, disclosures: [] };
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
    return { visible, synthesis: null, disclosures };
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
  return { visible, synthesis: null, disclosures: [] };
}

const HEADER_BASE_MS = 350;
const HEADER_PER_CARD_MS = 45;
const DISCLOSURE_MS = 200;

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

  const cardLines = useMemo(() => buildCardLines(interpretation, cards), [interpretation, cards]);
  const { visible: bodyVisible, synthesis, disclosures: bodyDisclosures } = useMemo(
    () => buildBodyGroups(interpretation, cards),
    [interpretation, cards],
  );

  const closing = useMemo(
    () =>
      instant
        ? 'из журнала сеансов'
        : guide.closings?.[Math.floor(Math.random() * guide.closings.length)] ?? 'свиток запечатан',
    [instant, guide],
  );

  const stages = useMemo<StageSpec[]>(() => {
    const list: StageSpec[] = [
      { id: 'header', autoMs: HEADER_BASE_MS + HEADER_PER_CARD_MS * cardLines.length },
    ];
    if (intro) list.push({ id: 'intro' });
    if (short_answer) list.push({ id: 'signal' });
    bodyVisible.forEach(() => list.push({ id: 'body' }));
    if (synthesis) list.push({ id: 'synthesis' });
    if (bodyDisclosures.length > 0) list.push({ id: 'disclosure', autoMs: DISCLOSURE_MS });
    if (advice) list.push({ id: 'advice' });
    list.push({ id: 'close' });
    return list;
  }, [intro, short_answer, bodyVisible, synthesis, bodyDisclosures, advice, cardLines.length]);

  const [stage, setStage] = useState(() => (instant ? stages.length : 0));

  const advanceTo = (next: number) => setStage((v) => Math.max(v, next));

  // autoAdvance-стадии (header, disclosure): таймер вместо onDone
  const autoMs = instant ? undefined : stages[stage]?.autoMs;
  useEffect(() => {
    if (autoMs == null) return;
    const t = setTimeout(() => setStage((v) => v + 1), autoMs);
    return () => clearTimeout(t);
  }, [stage, autoMs]);

  // индексы стадий (порядок фиксирован сборкой stages)
  let cursor = 0;
  const introIdx = intro ? cursor++ : -1;
  const signalIdx = short_answer ? cursor++ : -1;
  const bodyIdxs = bodyVisible.map(() => cursor++);
  const synthesisIdx = synthesis ? cursor++ : -1;
  const disclosureIdx = bodyDisclosures.length > 0 ? cursor++ : -1;
  const adviceIdx = advice ? cursor++ : -1;
  const closeIdx = cursor++;

  let headerDelay = 0;
  const next = () => {
    headerDelay += instant ? 0 : 32;
    return `${headerDelay}ms`;
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
            <span className="reading-title">✦ {spreadLabel.toUpperCase()} ✦</span>
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
            <div className={`reading-artifacts${cardLines.length === 1 ? ' reading-artifacts--single' : ''}`}>
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

          {intro && stage >= introIdx && (
            <div className="reading-line">
              <div className="reading-section-label">// шёпот</div>
              <ProseType
                text={intro}
                instant={instant}
                quotes={false}
                className="reading-whisper italic"
                onDone={() => advanceTo(introIdx + 1)}
              />
            </div>
          )}

          {short_answer && stage >= signalIdx && (
            <div className="reading-line">
              <div className="reading-section-label reading-section-label--signal">─ signal ─</div>
              <div className="reading-signal" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
                <ProseType
                  text={short_answer}
                  instant={instant}
                  quotes={false}
                  className="reading-signal-text"
                  onDone={() => advanceTo(signalIdx + 1)}
                />
              </div>
            </div>
          )}

          {bodyVisible.map((s, i) => {
            const idx = bodyIdxs[i];
            if (stage < idx) return null;
            return (
              <div key={i} className="reading-line">
                {s.label && <div className="reading-section-label">// {s.label}</div>}
                {s.card && (
                  <>
                    <div className="reading-position-name">{s.card}</div>
                    <div className={s.reversed ? 'reading-card-rev' : 'reading-card-upright'}>
                      {s.reversed ? 'перевёрнутая' : 'прямая'}
                    </div>
                  </>
                )}
                <ProseType
                  text={s.prose}
                  instant={instant}
                  quotes={false}
                  className="reading-body-text"
                  onDone={() => advanceTo(idx + 1)}
                />
              </div>
            );
          })}

          {synthesis && stage >= synthesisIdx && (
            <div className="reading-line">
              <div className="reading-section-label">// нить</div>
              <ProseType
                text={synthesis}
                instant={instant}
                quotes={false}
                className="reading-body-text"
                onDone={() => advanceTo(synthesisIdx + 1)}
              />
            </div>
          )}

          {bodyDisclosures.length > 0 && stage >= disclosureIdx && (
            <details
              className="reading-line reading-det"
              style={{ '--guide-accent': guide.accent } as React.CSSProperties}
            >
              <summary className="reading-det-summary">
                <span className="reading-det-marker">[+]</span> {bodyDisclosures[0].summary} <span className="reading-det-hint">— раскрой</span>
              </summary>
              <div className="reading-det-body">
                {bodyDisclosures[0].sections.map((s, j) => (
                  <div key={j} className="reading-det-section">
                    {s.label && <div className="reading-section-label">// {s.label}</div>}
                    <div className="reading-body-text">{joinedParagraphs(s.prose)}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {advice && stage >= adviceIdx && (
            <div className="reading-line">
              <div className="reading-section-label">// совет</div>
              <div
                className="reading-advice-box"
                style={{ background: guide.accentDim } as React.CSSProperties}
              >
                <span className="corner-tl">╔</span>
                <span className="corner-tr">┐</span>
                <span className="corner-bl">└</span>
                <span className="corner-br">╝</span>
                <ProseType
                  text={advice}
                  instant={instant}
                  quotes={false}
                  className="reading-advice"
                  onDone={() => advanceTo(adviceIdx + 1)}
                />
              </div>
            </div>
          )}

        </div>
      </div>

      {stage >= closeIdx && (
        <div className="term-exit reading-close reading-line mt-1.5 flex items-center justify-between">
          <span className="reading-close-phrase">— {closing} —</span>
          <span className="reading-close-tag te-ok">{guide.tag}</span>
        </div>
      )}
    </div>
  );
}
