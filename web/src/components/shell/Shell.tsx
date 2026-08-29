'use client';

// Shell — хром терминала ARCANUM:
//   ┌ титл-бар с табом, REC и uptime
//   ├ скроллбэк-транскрипт (весь флоу живёт здесь)
//   ├ vim-статус-лайн (режим · сеанс · проводник · часы)
//   └ командная строка с чипами
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import CrtOverlay from '@/components/CrtOverlay';
import CrtNoise from '@/components/CrtNoise';
import AmbientSigil from '@/components/AmbientSigil';
import { isLowEndDevice } from '@/lib/device';
import { StatusClock, TitleUptime } from './StatusTime';
import ConstellationLayer from '@/components/ConstellationLayer';
import LunarGlyphsLayer from '@/components/LunarGlyphsLayer';
import { getGuide } from '@/lib/guides';
import { shellUser } from '@/lib/commands';
import type { Entry } from '@/lib/transcript';
import CommandBar from './CommandBar';
import BootSequence from './BootSequence';
import MotdBlock from './MotdBlock';
import TuiMenu from './TuiMenu';
import SpreadBlock from './SpreadBlock';
import ProgressLine from './ProgressLine';
import PendingLine from './PendingLine';
import HistoryBlock from './HistoryBlock';
import ReadingResult from '@/components/ReadingResult';
import Typewriter from './Typewriter';

export type ShellMode =
  | 'БУТ' | 'ОЖИДАНИЕ' | 'ВОПРОС' | 'ТАСОВАНИЕ'
  | 'РАСКЛАД' | 'ЧТЕНИЕ' | 'МЕНЮ' | 'ЖУРНАЛ';

interface ShellProps {
  characterId: string;
  mode: ShellMode;
  sessionHex: string;
  entries: Entry[];
  scrollTick: number;
  busy: boolean;
  pendingQuestion: boolean;
  pendingCards: 1 | 3;
  bootDone: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  /** фоновый шёпот ЛЛМ формируется прямо сейчас */
  channelBusy: boolean;
  onBootDone: () => void;
  onRunCmd: (cmd: string) => void;
  onSubmitInput: (value: string) => void;
  onCancelPending: () => void;
  onGuideSelect: (id: string) => void;
  onFlip: (entryId: number, index: number) => void;
}

export default function Shell({
  characterId,
  mode,
  sessionHex,
  entries,
  scrollTick,
  busy,
  pendingQuestion,
  pendingCards,
  bootDone,
  soundOn,
  onToggleSound,
  channelBusy,
  onBootDone,
  onRunCmd,
  onSubmitInput,
  onCancelPending,
  onGuideSelect,
  onFlip,
}: ShellProps) {
  const guide = getGuide(characterId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Тяжёлые постоянно анимированные ambient-слои (~6.8к SVG-нод + full-screen зерно)
  // вырубаем на слабых устройствах и при prefers-reduced-motion — цена рендера
  // там непропорционально высока и может ронять вью-вьюху телефона.
  const heavyMotion = useMemo(() => isLowEndDevice(), []);

  // автоскролл как в настоящем терминале — вывод всегда виден
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [entries.length, scrollTick]);

  // ── рендер одной записи транскрипта ──
  const renderEntry = (entry: Entry): ReactNode => {
    switch (entry.kind) {
      case 'boot':
        return <BootSequence key={entry.id} characterId={characterId} onDone={onBootDone} />;

      case 'motd':
        return <MotdBlock key={entry.id} onRunCmd={onRunCmd} />;

      case 'cmd':
        return (
          <div key={entry.id} className="prompt-line tl">
            <span className="cd-user">{shellUser(characterId)}</span>
            <span className="cd-path">:~$ </span>
            <Typewriter text={entry.text} className="cmd-echo" sound speedMs={18} />
          </div>
        );

      case 'out':
        return (
          <div key={entry.id} className="out-block">
            {entry.lines.map((l, i) => (
              <div
                key={i}
                className={`tl tl-${l.tone ?? 'plain'} ${entry.stagger ? 'print-line' : ''}`}
                style={entry.stagger ? ({ '--pl-delay': `${i * 90}ms` } as React.CSSProperties) : undefined}
              >
                {l.text}
              </div>
            ))}
          </div>
        );

      case 'progress':
        return <ProgressLine key={entry.id} label={entry.label} durMs={entry.durMs} />;

      case 'pending':
        return <PendingLine key={entry.id} label={entry.label} />;

      case 'daily':
        return (
          <div key={entry.id} className="entry-pad">
            <SpreadBlock
              cards={[entry.card]}
              flipped={[entry.flipped]}
              count={1}
              singleLabel="карта дня"
              whisperReady={entry.whisperReady}
              characterId={characterId}
              onFlip={(i) => onFlip(entry.id, i)}
            />
          </div>
        );

      case 'spread':
        return (
          <div key={entry.id} className="entry-pad">
            <SpreadBlock
              cards={entry.cards}
              flipped={entry.flipped}
              count={entry.count}
              whisperReady={entry.whisperReady}
              characterId={characterId}
              onFlip={(i) => onFlip(entry.id, i)}
            />
          </div>
        );

      case 'json':
        return (
          <div key={entry.id} className="entry-pad">
            <ReadingResult
              interpretation={entry.interpretation}
              characterId={characterId}
              cards={entry.cards}
              question={entry.question}
              spreadLabel={entry.spreadLabel}
            />
          </div>
        );

      case 'menu':
        return (
          <div key={entry.id} className="entry-pad">
            <TuiMenu
              menuId={entry.menuId}
              activeGuideId={characterId}
              onRunCmd={onRunCmd}
              onGuideSelect={onGuideSelect}
            />
          </div>
        );

      case 'history':
        return (
          <div key={entry.id} className="entry-pad">
            <HistoryBlock rows={entry.rows} />
          </div>
        );

      case 'error':
        return (
          <div key={entry.id} className="err-block">
            <div className="tl tl-err">E1: {entry.msg}</div>
            <div className="tl tl-faint">{'╰─ сеанс прерван · повтори попытку · exit 1'}</div>
          </div>
        );

      case 'ok':
        return (
          <div key={entry.id} className="ok-block">
            <div className="tl tl-ok">[ ok ] {entry.msg}</div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <CrtOverlay>
      <div
        className="shell-root"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-dim': guide.accentDim,
          '--guide-glow': guide.accentGlow,
          '--t-bg': guide.bgDeep,
          '--glow-center': guide.glowCenter,
        } as React.CSSProperties}
      >
        {/* ── атмосферные слои — ВНУТРИ shell-root, ПОД vignette ── */}
        {/* ритуальный дым — мягкие дрейфующие градиенты по краям */}
        <div
          className="ritual-smoke"
          aria-hidden="true"
          style={{ '--smoke': guide.accentDim } as React.CSSProperties}
        >
          <div className="ritual-smoke__cloud ritual-smoke__cloud--tl" />
          <div className="ritual-smoke__cloud ritual-smoke__cloud--br" />
          <div className="ritual-smoke__cloud ritual-smoke__cloud--mid" />
        </div>

        {/* ambient-сигил — анимированная пентаграмма справа сверху (тяжёлый, только не на слабых) */}
        {!heavyMotion && <AmbientSigil accent={guide.accent} accentDim={guide.accentDim} />}

        {/* созвездие — мерцающие звёзды */}
        <ConstellationLayer />

        {/* лунные глифы — плавающие алхимические символы */}
        <LunarGlyphsLayer accent={guide.accent} />

        {/* ── живое зерно катодной трубки (full-screen фильтр — тоже тяжёлый) ── */}
        {!heavyMotion && <CrtNoise />}

        {/* ── титл-бар терминала ── */}
        <div className="shell-title">
          <span className="st-tab">[ ARCANUM.ocv ]</span>
          <span className="st-right">
            <span className="st-rec"><span className="st-rec-dot" aria-hidden="true" />REC</span>
            <span className="st-up"><TitleUptime /></span>
          </span>
          <div className="st-shell tl" aria-hidden="true">
            <span className="cd-user">{shellUser(characterId)}</span>
            <span className="cd-path">:~$ </span>
            ./сеанс --tty1
          </div>
        </div>

        {/* ── скроллбэк ── */}
        <div className="shell-scroll" ref={scrollRef}>
          {entries.map(renderEntry)}
          {bootDone && !busy && !pendingQuestion && (
            <div className="scroll-ender tl tl-faint" aria-hidden="true">
              <span className="blink">▊</span> ожидание команды…
            </div>
          )}
        </div>

        {/* ── vim-статус-лайн ── */}
        <div className="statusline">
          <span className="sl-mode">-- {mode} --</span>
          <span className="sl-mid">
            сеанс #{sessionHex} · {guide.tag}
            {channelBusy && (
              <span className="sl-busy" aria-hidden="true"> ⌁ шепчет</span>
            )}
          </span>
          <button
            type="button"
            className={`sl-sound${soundOn ? '' : ' sl-sound--off'}`}
            onClick={onToggleSound}
            aria-label={soundOn ? 'выключить звук' : 'включить звук'}
            title="звук терминала"
          >
            ♪
          </button>
          <span className="sl-right">utf-8 · ru · <StatusClock /></span>
        </div>

        {/* ── командная строка ── */}
        <CommandBar
          characterId={characterId}
          busy={busy}
          pendingQuestion={pendingQuestion}
          pendingCards={pendingCards}
          soundOn={soundOn}
          onSubmit={onSubmitInput}
          onCancelPending={onCancelPending}
        />
      </div>
    </CrtOverlay>
  );
}
