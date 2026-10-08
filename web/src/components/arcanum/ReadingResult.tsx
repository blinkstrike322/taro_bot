'use client';

// ─────────────────────────────────────────────────────────────
// ReadingResult — терминальное чтение. Секции рендерятся
// последовательно: стадия i маунтится, когда предыдущая
// отчиталась (ProseType onDone). instant (журнал) — сразу.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, BookOpen, CloudSun, Eye, Link2, LayoutGrid, MessageCircleQuestion, ScrollText, X,
} from 'lucide-react';
import { getGuide } from '@/lib/guides';
import type { TarotCard } from '@/components/arcanum/Card';
import ProseType from '@/components/arcanum/ProseType';
import { sMenu, sFlip, sAskOpen, sPairMark, sSeal, sRitual, haptic } from '@/lib/sound';
import { buildScrollText, type ScrollExport } from '@/lib/scroll';
import type { Interpretation, ReadingPosition } from '@/lib/api';

interface ReadingResultProps {
  interpretation: Interpretation;
  characterId?: string;
  cards?: TarotCard[];
  question?: string | null;
  spreadLabel?: string;
  instant?: boolean;
  onAskCard?: (cardIdx: number) => void;
  /** парный follow-up: индексы двух выбранных карт */
  onAskPair?: (cardIdxs: [number, number]) => void;
  onRunCmd?: (cmd: string) => void;
  /** экспорт свитка: забрать чтение с собой (буфер + файл) */
  onExportScroll?: (scroll: ScrollExport) => void;
  /** отголосок журнала: поиск прошлых чтений с общими картами */
  onEcho?: () => void | Promise<void>;
  /** прогноз дня: вывести план дня из карты дня (только daily) */
  onForecast?: () => void;
  /** хроника карты: история выпадений аркана — без набора имени */
  onChronicle?: (cardName: string) => void;
  /** момент чтения (ISO) — свиток журналных чтений датируется им */
  readAt?: string;
  /** id расклада — «спросить снова» повторяет расклад, а не каталог */
  spreadId?: string;
  /** спросить снова: тот же расклад — вопрос вводится сразу */
  onAskAgain?: () => void;
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

function buildCardLines(interp: Interpretation, cards?: TarotCard[]): CardLine[] {
  const positions = Array.isArray(interp['позиции']) ? interp['позиции'] : null;
  if (positions && positions.length > 0) {
    return positions.map((p: ReadingPosition, i: number) => ({
      index: String(i + 1).padStart(2, '0'),
      position: p['позиция'] ?? null,
      name: p['карта'] ?? cards?.[i]?.name ?? '',
      reversed: Boolean(p['реверс'] ?? cards?.[i]?.is_reversed ?? false),
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

function buildBodyGroups(
  interp: Interpretation,
  cards?: TarotCard[],
): { visible: BodySection[]; synthesis: string | null; disclosures: BodyDisclosure[] } {
  const positions = Array.isArray(interp['позиции']) ? interp['позиции'] : null;

  if (positions && positions.length > 0) {
    const visible: BodySection[] = [];
    positions.forEach((p: ReadingPosition, i: number) => {
      if (p['трактовка']) {
        const num = String(i + 1).padStart(2, '0');
        visible.push({
          label: p['позиция'] ? `${num} · ${p['позиция']}` : num,
          prose: p['трактовка'],
          card: p['карта'] ?? cards?.[i]?.name,
          reversed: Boolean(p['реверс'] ?? cards?.[i]?.is_reversed ?? false),
        });
      }
    });
    return { visible, synthesis: interp['связь_карт'] ?? null, disclosures: [] };
  }

  if (interp['проявление'] || interp['траектория'] || interp['на_что_смотреть']) {
    const visible: BodySection[] = [];
    if (interp['проявление']) {
      visible.push({ label: 'проявление', prose: interp['проявление'] });
    }
    if (interp['на_что_смотреть']) {
      visible.push({ label: 'на что смотреть', prose: interp['на_что_смотреть'] });
    }
    const disclosures: BodyDisclosure[] = [];
    if (interp['траектория']) {
      const traj: BodySection[] = [];
      for (const t of ['утро', 'день', 'вечер'] as const) {
        const v = interp['траектория'][t];
        if (v) traj.push({ label: t, prose: v });
      }
      if (traj.length > 0) {
        disclosures.push({ summary: 'траектория дня', sections: traj });
      }
    }
    return { visible, synthesis: null, disclosures };
  }

  const meanings = Array.isArray(interp.card_meaning)
    ? interp.card_meaning
    : interp.card_meaning ? [interp.card_meaning] : [];
  const visible = meanings.map((m, i) => ({
    label: meanings.length > 1 ? `значение · ${String(i + 1).padStart(2, '0')}` : 'значение',
    prose: m,
  }));
  return { visible, synthesis: null, disclosures: [] };
}

const HEADER_BASE_MS = 400;
const DISCLOSURE_MS = 220;

export default function ReadingResult({
  interpretation,
  characterId,
  cards,
  question,
  spreadLabel = 'три карты',
  instant = false,
  onAskCard,
  onAskPair,
  onRunCmd,
  onExportScroll,
  onEcho,
  onForecast,
  onChronicle,
  readAt,
  spreadId,
  onAskAgain,
}: ReadingResultProps) {
  const { intro, short_answer: shortAnswer, advice } = interpretation;
  const guide = getGuide(characterId);
  const [askMode, setAskMode] = useState(false);
  // pair-режим: выбор двух карт — бейджи «1» и «2»
  const [pairMode, setPairMode] = useState(false);
  const [pairPicks, setPairPicks] = useState<number[]>([]);
  // chronicle-режим: выбор одной карты → её история выпадений
  const [chronicleMode, setChronicleMode] = useState(false);

  const cardLines = useMemo(() => buildCardLines(interpretation, cards), [interpretation, cards]);
  const positions = useMemo(
    () => (Array.isArray(interpretation['позиции']) ? interpretation['позиции'] : null),
    [interpretation],
  );
  const { visible: bodyVisible, synthesis, disclosures: bodyDisclosures } = useMemo(
    () => buildBodyGroups(interpretation, cards),
    [interpretation, cards],
  );

  const closing = useMemo(
    () =>
      instant
        ? 'из журнала сеансов'
        : guide.closings?.[Math.floor(Math.random() * guide.closings.length)] ?? 'свиток запечатан',
     
    [],
  );

  // порядок стадий
  const stages = useMemo(() => {
    const list: string[] = ['header'];
    if (intro) list.push('intro');
    if (shortAnswer) list.push('signal');
    bodyVisible.forEach(() => list.push('body'));
    if (synthesis) list.push('synthesis');
    if (bodyDisclosures.length > 0) list.push('disclosure');
    if (advice) list.push('advice');
    list.push('close');
    return list;
  }, [intro, shortAnswer, bodyVisible, synthesis, bodyDisclosures, advice]);

  const [stage, setStage] = useState(() => (instant ? stages.length : 0));
  const advanceTo = (next: number) => setStage((v) => Math.max(v, next));

  // индексы стадий
  let cursor = 1; // после header
  const introIdx = intro ? cursor++ : -1;
  const signalIdx = shortAnswer ? cursor++ : -1;
  const bodyIdxs = bodyVisible.map(() => cursor++);
  const synthesisIdx = synthesis ? cursor++ : -1;
  const disclosureIdx = bodyDisclosures.length > 0 ? cursor++ : -1;
  const adviceIdx = advice ? cursor++ : -1;
  const closeIdx = cursor;

  const canAsk = !instant && cardLines.length > 0 && typeof onAskCard === 'function';
  const canAskPair = !instant && cardLines.length >= 2 && typeof onAskPair === 'function';
  // прогноз дня: только для карты дня (и только живой, не журнал)
  const canForecast =
    !instant &&
    spreadLabel === 'карта дня' &&
    cardLines.length > 0 &&
    typeof onForecast === 'function';
  // свиток доступен и журналным (instant) чтениям — забрать с собой
  const canScroll = typeof onExportScroll === 'function';
  // отголосок: работает и для живых, и для инстант-чтений —
  // карты повторяются независимо от того, когда их вытянули
  const canEcho = cardLines.length > 0 && typeof onEcho === 'function';
  // хроника карты: живой журнал — работает и для журналных чтений
  const canChronicle = cardLines.length > 0 && typeof onChronicle === 'function';
  // спросить снова: только живые чтения со знакомым раскладом —
  // выбранный расклад сохраняется, вопрос вводится сразу
  const canAskAgain = !instant && Boolean(spreadId) && typeof onAskAgain === 'function';

  // пока журнал листается — чип занят, повторный клик не уходит
  const [echoBusy, setEchoBusy] = useState(false);
  const handleEchoChip = () => {
    if (echoBusy || typeof onEcho !== 'function') return;
    haptic('tick');
    setEchoBusy(true);
    Promise.resolve(onEcho()).finally(() => setEchoBusy(false));
  };

  // переписать в свиток: текст собирается с той же фразой-закрытием,
  // что видна на экране (closing рандомится один раз при маунте)
  const handleExportScroll = () => {
    if (typeof onExportScroll !== 'function') return;
    const scroll = buildScrollText({
      interpretation,
      cards,
      question,
      spreadLabel,
      characterId: guide.id,
      closing,
      // журналные чтения — датой исходного сеанса, живые — сейчас
      ...(readAt ? { at: new Date(readAt) } : {}),
    });
    onExportScroll(scroll);
  };

  const handleCardAsk = (i: number) => {
    sFlip();
    haptic('tick');
    setAskMode(false);
    onAskCard?.(i);
  };

  const cancelModes = () => {
    sMenu();
    haptic('tick');
    setAskMode(false);
    setPairMode(false);
    setPairPicks([]);
    setChronicleMode(false);
  };

  // хроника из чипа: одна карта — сразу; несколько — выбрать тапом
  const handleChronicleChip = () => {
    sAskOpen();
    haptic('tick');
    if (cardLines.length === 1) {
      onChronicle?.(cardLines[0].name);
      return;
    }
    setChronicleMode(true);
  };

  // выбор карты в chronicle-режиме: единственный тап — и в журнал
  const handleChroniclePick = (i: number) => {
    const c = cardLines[i];
    if (!c) return;
    sFlip();
    haptic('tick');
    setChronicleMode(false);
    onChronicle?.(c.name);
  };

  // выбор карты в pair-режиме: первый тап — «1», второй по ДРУГОЙ — «2»;
  // случайный даблтап по той же карте — игнор с shake, осознанный
  // повторный тап — снятие выбора
  const lastPickRef = useRef<{ idx: number; at: number } | null>(null);

  const handlePairPick = (i: number, el: HTMLButtonElement) => {
    if (pairPicks.includes(i)) {
      const last = lastPickRef.current;
      if (last && last.idx === i && Date.now() - last.at < 350) {
        // даблтап по той же карте — пару из одной карты не собрать;
        // лёгкий shake вместо снятия выбора
        el.classList.remove('fu-shake');
        void el.offsetWidth; // перезапуск анимации
        el.classList.add('fu-shake');
        haptic('warn');
        return;
      }
      sMenu();
      haptic('tick');
      setPairPicks((p) => p.filter((x) => x !== i));
      return;
    }
    if (pairPicks.length >= 2) return; // после двух сразу выходим из режима
    const nextPicks = [...pairPicks, i];
    lastPickRef.current = { idx: i, at: Date.now() };
    sPairMark(nextPicks.length === 1 ? 1 : 2);
    haptic('tick');
    if (nextPicks.length === 2) {
      // пара собрана — сразу режим ВОПРОС
      const [first, second] = nextPicks;
      setPairMode(false);
      setPairPicks([]);
      onAskPair?.([first, second]);
      return;
    }
    setPairPicks(nextPicks);
  };

  // авто-стадии (header, disclosure): таймер
  const autoMs = instant
    ? undefined
    : stage === 0
      ? HEADER_BASE_MS + cardLines.length * 40
      : stage === disclosureIdx
        ? DISCLOSURE_MS
        : undefined;
  useEffect(() => {
    if (autoMs == null) return;
    const t = setTimeout(() => setStage((v) => v + 1), autoMs);
    return () => clearTimeout(t);
  }, [stage, autoMs]);

  let headerDelay = 0;
  const next = () => {
    headerDelay += instant ? 0 : 36;
    return `${headerDelay}ms`;
  };

  return (
    <div className={`px-1 py-2${instant ? ' instant' : ''}`}>
      <div className="relative frame-ritual p-3.5">
        <span className="corner corner-tl">╔</span>
        <span className="corner corner-tr">┐</span>
        <span className="corner corner-bl">└</span>
        <span className="corner corner-br">╝</span>

        <div className="reading relative z-10">
          {/* шапка-плашка: крупный титул с бакенбардами */}
          <div className="reading-line reading-head" style={{ '--jl-delay': next() } as React.CSSProperties}>
            <span className="reading-head-rule" aria-hidden="true" />
            <span className="reading-title">{spreadLabel.toUpperCase()}</span>
            <span className="reading-head-rule" aria-hidden="true" />
          </div>

          <div className="reading-line reading-meta" style={{ '--jl-delay': next() } as React.CSSProperties}>
            <span className="reading-meta-key">проводник</span>
            <span className="reading-meta-dots" aria-hidden="true" />
            <span className="reading-meta-val">{guide.name}</span>
          </div>

          {question && (
            <div className="reading-line reading-question" style={{ '--jl-delay': next() } as React.CSSProperties}>
              <span className="reading-meta-key">вопрос</span>
              <span className="reading-meta-dots" aria-hidden="true" />
              <span className="reading-meta-val">«{question}»</span>
            </div>
          )}

          {/* карты-артефакты: крупные, с индексом плёнки и позицией */}
          {cardLines.length > 0 && (
            <div
              className={`reading-artifacts${cardLines.length === 1 ? ' reading-artifacts--single' : ''}${askMode ? ' reading-artifacts--ask' : ''}${pairMode ? ' reading-artifacts--pair' : ''}${chronicleMode ? ' reading-artifacts--chron' : ''}`}
            >
              {cardLines.map((c, i) => {
                const pos = positions?.[i]?.['позиция'];
                // рамка артефакта: карта + индекс плёнки + значок режима
                const frame = (mark?: React.ReactNode) => (
                  <span className="reading-artifact-frame">
                    <span className="reading-artifact-idx" aria-hidden="true">{c.index}</span>
                    {c.image_url && (
                      <img
                        src={c.image_url}
                        alt={c.name}
                        className="reading-artifact-img"
                        style={c.reversed ? { transform: 'rotate(180deg)' } : undefined}
                      />
                    )}
                    {mark}
                  </span>
                );
                const caption = (
                  <>
                    <div className="reading-card-name">{c.name}</div>
                    <span className={`reading-card-tag${c.reversed ? ' reading-card-tag--rev' : ''}`}>
                      {c.reversed ? 'реверс' : 'прямая'}
                    </span>
                  </>
                );
                if (askMode) {
                  return (
                    <button
                      key={c.index}
                      type="button"
                      className="reading-line reading-artifact reading-artifact-btn"
                      onClick={() => handleCardAsk(i)}
                      title={pos ? `спросить о карте в позиции «${pos}»` : 'спросить об этой карте'}
                      aria-label={`спросить о карте ${c.name}`}
                    >
                      {pos && <span className="reading-artifact-pos">{pos}</span>}
                      {frame(<span className="reading-ask-mark" aria-hidden="true">?</span>)}
                      {caption}
                    </button>
                  );
                }
                if (pairMode) {
                  const pickedAt = pairPicks.indexOf(i);
                  return (
                    <button
                      key={c.index}
                      type="button"
                      className={`reading-line reading-artifact reading-artifact-btn reading-artifact-btn--pair${pickedAt >= 0 ? ' reading-artifact-btn--picked' : ''}`}
                      onClick={(e) => handlePairPick(i, e.currentTarget)}
                      aria-pressed={pickedAt >= 0}
                      aria-label={
                        pickedAt >= 0
                          ? `карта ${c.name} выбрана — повторный тап снимет выбор`
                          : `выбрать карту ${c.name} ${pairPicks.length === 0 ? 'первой' : 'второй'}`
                      }
                      title={pos ? `выбрать карту в позиции «${pos}»` : 'выбрать эту карту'}
                    >
                      {pos && <span className="reading-artifact-pos">{pos}</span>}
                      {frame(
                        pickedAt >= 0 ? (
                          <span className="fu-pair-mark" aria-hidden="true">{pickedAt + 1}</span>
                        ) : undefined,
                      )}
                      {caption}
                    </button>
                  );
                }
                if (chronicleMode) {
                  return (
                    <button
                      key={c.index}
                      type="button"
                      className="reading-line reading-artifact reading-artifact-btn reading-artifact-btn--chron"
                      onClick={() => handleChroniclePick(i)}
                      aria-label={`хроника карты ${c.name}`}
                      title={pos ? `история карты в позиции «${pos}»` : 'история выпадений этой карты'}
                    >
                      {pos && <span className="reading-artifact-pos">{pos}</span>}
                      {frame(
                        <span className="reading-chron-mark" aria-hidden="true">
                          <BookOpen size={10} strokeWidth={2.25} />
                        </span>,
                      )}
                      {caption}
                    </button>
                  );
                }
                return (
                  <div
                    key={c.index}
                    className="reading-line reading-artifact"
                    style={{ '--jl-delay': next() } as React.CSSProperties}
                  >
                    {pos && <span className="reading-artifact-pos">{pos}</span>}
                    {frame()}
                    {caption}
                  </div>
                );
              })}
            </div>
          )}

          {(askMode || pairMode || chronicleMode) && (
            <div className="reading-ask-hint">
              <span className="tl tl-comment">
                {pairMode
                  ? '// выбери две карты — спроси об их связи'
                  : chronicleMode
                    ? '// выбери карту — хроника покажет её историю'
                    : '// выбери карту — и спроси о ней что угодно'}
              </span>
            </div>
          )}

          {/* шёпот */}
          {intro && stage >= introIdx && (
            <div className="reading-line">
              <div className="reading-section-label">шёпот</div>
              <ProseType
                text={intro}
                instant={instant}
                className="reading-whisper"
                onDone={() => advanceTo(introIdx + 1)}
              />
            </div>
          )}

          {/* сигнал */}
          {shortAnswer && stage >= signalIdx && (
            <div className="reading-line">
              <div className="reading-section-label reading-section-label--signal">сигнал</div>
              <div className="reading-signal" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
                <ProseType
                  text={shortAnswer}
                  instant={instant}
                  className="reading-signal-text"
                  onDone={() => advanceTo(signalIdx + 1)}
                />
              </div>
            </div>
          )}

          {/* позиции */}
          {bodyVisible.map((s, i) => {
            const idx = bodyIdxs[i];
            if (stage < idx) return null;
            return (
              <div key={i} className="reading-line">
                {s.label && <div className={'reading-section-label'}>{s.label}</div>}
                {s.card && (
                  <div className="reading-card-title">
                    <span className="reading-position-name">{s.card}</span>
                    <span
                      className={`reading-card-tag${s.reversed ? ' reading-card-tag--rev' : ''}`}
                    >
                      {s.reversed ? 'перевёрнутая' : 'прямая'}
                    </span>
                  </div>
                )}
                <ProseType
                  text={s.prose}
                  instant={instant}
                  className="reading-body-text"
                  onDone={() => advanceTo(idx + 1)}
                />
              </div>
            );
          })}

          {/* нить */}
          {synthesis && stage >= synthesisIdx && (
            <div className="reading-line">
              <div className="reading-section-label">нить</div>
              <ProseType
                text={synthesis}
                instant={instant}
                className="reading-body-text"
                onDone={() => advanceTo(synthesisIdx + 1)}
              />
            </div>
          )}

          {/* траектория дня — раскрываемый блок */}
          {bodyDisclosures.length > 0 && stage >= disclosureIdx && (
            <details className="reading-line reading-det" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
              <summary className="reading-det-summary">
                <span className="reading-det-marker">[+]</span> {bodyDisclosures[0].summary}
                <span className="reading-det-hint">— раскрой</span>
              </summary>
              <div className="reading-det-body">
                {bodyDisclosures[0].sections.map((s, j) => (
                  <div key={j} className="reading-det-section">
                    {s.label && <div className={'reading-section-label'}>{s.label}</div>}
                    <div className="reading-body-text">{s.prose}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* совет */}
          {advice && stage >= adviceIdx && (
            <div className="reading-line">
              <div className="reading-section-label">совет</div>
              <div className="reading-advice-box" style={{ background: guide.accentDim }}>
                <span className="corner corner-tl">╔</span>
                <span className="corner corner-tr">┐</span>
                <span className="corner corner-bl">└</span>
                <span className="corner corner-br">╝</span>
                <ProseType
                  text={advice}
                  instant={instant}
                  className="reading-advice"
                  onDone={() => advanceTo(adviceIdx + 1)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* финал */}
      {stage >= closeIdx && (
        <>
          <div className="term-exit reading-close reading-line mt-1.5 flex items-center justify-between">
            <span className="reading-close-phrase">— {closing} —</span>
            <span className="reading-close-tag te-ok">{guide.tag}</span>
          </div>

          {/* продолжение: снова / уточнение / свиток / отголосок */}
          {(canAskAgain || canAsk || canAskPair || canScroll || canEcho || canForecast || canChronicle) && (
            <div className="reading-fu mt-1.5" style={{ '--guide-accent': guide.accent } as React.CSSProperties}>
              {askMode || pairMode || chronicleMode ? (
                <button
                  type="button"
                  className="chip chip--cancel reading-fu-chip"
                  onClick={cancelModes}
                >
                  <X size={13} strokeWidth={2} aria-hidden="true" />
                  отмена
                </button>
              ) : (
                <>
                  {canAskAgain && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--again"
                      onClick={() => { sAskOpen(); haptic('tick'); onAskAgain?.(); }}
                      title="тот же расклад — только вопрос новый"
                    >
                      <MessageCircleQuestion size={13} strokeWidth={1.75} aria-hidden="true" />
                      спросить снова
                    </button>
                  )}
                  {canAsk && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--ask"
                      onClick={() => { sAskOpen(); haptic('tick'); setAskMode(true); }}
                    >
                      <Eye size={13} strokeWidth={1.75} aria-hidden="true" />
                      спросить о карте
                    </button>
                  )}
                  {canAskPair && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--pair"
                      onClick={() => { sAskOpen(); haptic('tick'); setPairMode(true); setPairPicks([]); }}
                    >
                      <Link2 size={13} strokeWidth={1.75} aria-hidden="true" />
                      спросить о паре
                    </button>
                  )}
                  {!instant && onRunCmd && (
                    <button
                      type="button"
                      className="chip reading-fu-chip"
                      onClick={() => { sMenu(); haptic('tick'); onRunCmd('taro catalog'); }}
                    >
                      <LayoutGrid size={13} strokeWidth={1.75} aria-hidden="true" />
                      другой расклад
                    </button>
                  )}
                  {canScroll && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--scroll"
                      onClick={() => { sSeal(); haptic('tick'); handleExportScroll(); }}
                    >
                      <ScrollText size={13} strokeWidth={1.75} aria-hidden="true" />
                      переписать в свиток
                    </button>
                  )}
                  {canEcho && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--echo"
                      onClick={handleEchoChip}
                      disabled={echoBusy}
                      aria-busy={echoBusy}
                      title="поискать прошлые чтения с этими картами"
                    >
                      <AudioLines size={13} strokeWidth={1.75} aria-hidden="true" />
                      {echoBusy ? 'журнал листается…' : 'отголосок из журнала'}
                    </button>
                  )}
                  {canChronicle && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--chron"
                      onClick={handleChronicleChip}
                      title="история выпадений этой карты — без набора имени"
                    >
                      <BookOpen size={13} strokeWidth={1.75} aria-hidden="true" />
                      хроника карты
                    </button>
                  )}
                  {canForecast && (
                    <button
                      type="button"
                      className="chip reading-fu-chip reading-fu-chip--fc"
                      onClick={() => { sRitual(); haptic('tick'); onForecast?.(); }}
                      title="вывести из карты дня план дня: лозунг, три времени, шкалы"
                    >
                      <CloudSun size={13} strokeWidth={1.75} aria-hidden="true" />
                      прогноз дня
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
