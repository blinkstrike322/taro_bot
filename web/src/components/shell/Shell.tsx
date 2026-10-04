'use client';

// Shell — хром терминала ARCANUM:
//   ┌ титл-бар с табом, REC и uptime
//   ├ скроллбэк-транскрипт (весь флоу живёт здесь)
//   ├ vim-статус-лайн (режим · сеанс · проводник · часы)
//   └ командная строка с чипами
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import CrtOverlay from '@/components/CrtOverlay';
import CrtNoise from '@/components/CrtNoise';
import AmbientSigil from '@/components/AmbientSigil';
import { isLowEndDevice } from '@/lib/device';
import { StatusClock, TitleUptime } from './StatusTime';
import ConstellationLayer from '@/components/ConstellationLayer';
import LunarGlyphsLayer from '@/components/LunarGlyphsLayer';
import { getGuide } from '@/lib/guides';
import { shellUser } from '@/lib/commands';
import { typingActivity } from '@/lib/typingActivity';
import type { Entry, HistoryRow } from '@/lib/transcript';
import CommandBar from './CommandBar';
import BootSequence from './BootSequence';
import MotdBlock from './MotdBlock';
import TuiMenu from './TuiMenu';
import SpreadBlock from './SpreadBlock';
import ProgressLine from './ProgressLine';
import PendingLine from './PendingLine';
import HistoryBlock from './HistoryBlock';
import PaywallBlock from './PaywallBlock';
import ReadingResult from '@/components/ReadingResult';
import Typewriter from './Typewriter';

export type ShellMode =
  | 'БУТ' | 'ОЖИДАНИЕ' | 'ВОПРОС' | 'ТАСОВАНИЕ'
  | 'РАСКЛАД' | 'ЧТЕНИЕ' | 'МЕНЮ' | 'ЖУРНАЛ';

interface ShellProps {
  characterId: string;
  mode: ShellMode;
  /** имя активного расклада для статус-лайна — последний spreadLabel транскрипта */
  spreadCtx?: string | null;
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
  /** тап по строке журнала → развернуть полный сеанс */
  onHistorySelect: (row: HistoryRow) => void;
  /** закрыть WebApp (paywall → вернуться в чат бота) */
  onCloseApp: () => void;
}

export default function Shell({
  characterId,
  mode,
  spreadCtx,
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
  onHistorySelect,
  onCloseApp,
}: ShellProps) {
  const guide = getGuide(characterId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Флаг активного скролла для CSS: фон замирает (animation-play-state),
  // контент получает весь бюджет композита. Снимается через 160мс тишины.
  useEffect(() => {
    const scroller = scrollRef.current;
    const host = rootRef.current?.closest('.crt') ?? rootRef.current;
    if (!scroller || !host) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      host.setAttribute('data-scrolling', '1');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => host.removeAttribute('data-scrolling'), 160);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
      host.removeAttribute('data-scrolling');
    };
  }, []);

  // Пока канал печатает (ProseType/Typewriter двигают счётчик) — ставим
  // data-typing на .shell-root и на .crt: CSS ставит ambient-слои на паузу
  // и притушивает дым/зерно, main-thread остаётся печати.
  useEffect(() => {
    const root = rootRef.current;
    const host = root?.closest('.crt') ?? root;
    return typingActivity.subscribe((active) => {
      root?.toggleAttribute('data-typing', active);
      host?.toggleAttribute('data-typing', active);
    });
  }, []);
  /** entryId → DOM-узел записи (для скролла к началу расклада) */
  // auto-scroll: обычный терминал следует за выводом (вниз), но когда появляется
  // НОВЫЙ расклад — мгновенно прыгаем к ЕГО началу, а не к низу транскрипта.
  // Пока свежий расклад разворачивается на экране — не уводим вниз (нет дёрганий).
  const handledReadingRef = useRef<number | null>(null);
  const anchorIdRef = useRef<number | null>(null);
  const anchorUntilRef = useRef(0);
  const scrollRafRef = useRef(0);
  const ANCHOR_MS = 2000; // окно «только что пришёл расклад» — не фоллоу-вниз
  // Пользователь ушёл читать наверх — новые строки не уводят вниз насильно.
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const track = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    };
    track();
    el.addEventListener('scroll', track, { passive: true });
    return () => el.removeEventListener('scroll', track);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // clear сбросил журнал — сбрасываем анкоры, иначе id совпадёт и прыжка не будет
    if (entries.length === 0) {
      handledReadingRef.current = null;
      anchorIdRef.current = null;
      anchorUntilRef.current = 0;
      return;
    }

    // новейший (последний) расклад в транскрипте
    let readingId: number | null = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].kind === 'json') { readingId = entries[i].id; break; }
    }

    const now = Date.now();

    // появился новый расклад → прыгаем к его началу сразу, как окно показалось
    if (readingId != null && readingId !== handledReadingRef.current) {
      handledReadingRef.current = readingId;
      anchorIdRef.current = readingId;
      anchorUntilRef.current = now + ANCHOR_MS;
      const node = el.querySelector<HTMLElement>(`[data-eid="${readingId}"]`);
      if (node) {
        const relTop = node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
        el.scrollTo({ top: Math.max(relTop - 12, 0), behavior: 'auto' });
      }
      return;
    }

    // свежий расклад ещё на экране — не дёргаем позицию (защита от гонки json+whisper)
    if (anchorIdRef.current != null && now < anchorUntilRef.current && readingId === anchorIdRef.current) {
      return;
    }

    // обычный терминал: следуем за выводом вниз, только если пользователь
    // и так внизу (иначе плавный скролл вырывает чтение из-под пальцев).
    // Без плавности под prefers-reduced-motion и во время печати
    // (smooth-скролл борется с посимвольным выводом).
    if (!stickRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduced || typingActivity.isActive() ? 'auto' : 'smooth';
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [entries, scrollTick]);

  // Тяжёлые постоянно анимированные ambient-слои (~6.8к SVG-нод + full-screen зерно)
  // вырубаем на слабых устройствах и при prefers-reduced-motion — цена рендера
  // там непропорционально высока и может ронять вью-вьюху телефона.
  const heavyMotion = useMemo(() => isLowEndDevice(), []);
  // чтение в транскрипте — сигил уходит в ambient-фон, не спорит с текстом
  const hasReading = useMemo(() => entries.some((e) => e.kind === 'json'), [entries]);

  // ── рендер одной записи транскрипта ──
  const renderEntry = (entry: Entry): ReactNode => {
    switch (entry.kind) {
      case 'boot':
        return <BootSequence key={entry.id} characterId={characterId} onDone={onBootDone} />;

      case 'motd':
        return <MotdBlock key={entry.id} onRunCmd={onRunCmd} characterId={characterId} />;

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
              layout={entry.layout}
              positions={entry.positions}
              positionKeys={entry.positionKeys}
              flipOrder={entry.flipOrder}
              whisperReady={entry.whisperReady}
              characterId={characterId}
              onFlip={(i) => onFlip(entry.id, i)}
            />
          </div>
        );

      case 'json':
        return (
          <div key={entry.id} data-eid={entry.id} className="entry-pad">
            <ReadingResult
              interpretation={entry.interpretation}
              characterId={entry.characterId ?? characterId}
              cards={entry.cards}
              question={entry.question}
              spreadLabel={entry.spreadLabel}
              instant={entry.instant}
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
            <HistoryBlock rows={entry.rows} onSelect={onHistorySelect} />
          </div>
        );

      case 'paywall':
        return (
          <div key={entry.id} className="entry-pad">
            <PaywallBlock msg={entry.msg} characterId={characterId} onClose={onCloseApp} />
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
        ref={rootRef}
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

        {/* ambient-сигил — анимированная пентаграмма справа сверху (тяжёлый, только не на слабых).
            Маунтим после бута: ~6.8к SVG-нод + зерно на первом фрейме фризят WebView
            средних айфонов, что выглядит как «не запустилось». */}
        {!heavyMotion && bootDone && (
          <div className={hasReading ? 'sigil-dim' : undefined} style={{ display: 'contents' }}>
            <AmbientSigil accent={guide.accent} accentDim={guide.accentDim} />
          </div>
        )}

        {/* созвездие — мерцающие звёзды */}
        <ConstellationLayer />

        {/* лунные глифы — плавающие алхимические символы */}
        <LunarGlyphsLayer accent={guide.accent} />

        {/* ── живое зерно катодной трубки (full-screen фильтр — тоже тяжёлый) ── */}
        {!heavyMotion && bootDone && <CrtNoise />}

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
          <span className="sl-mode">-- {mode}{spreadCtx ? ' · ' + spreadCtx : ''} --</span>
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
