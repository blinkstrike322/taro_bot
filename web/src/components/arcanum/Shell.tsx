'use client';

// ─────────────────────────────────────────────────────────────
// Shell — хром терминала ARCANUM:
//   ┌ титл-бар (таб, REC, uptime)
//   ├ скроллбэк-транскрипт (весь флоу живёт здесь)
//   ├ vim-статус-лайн (режим · сеанс · проводник · часы · серия)
//   └ командная строка с чипами (масштабируется)
// ─────────────────────────────────────────────────────────────
import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Flame, Link2 } from 'lucide-react';
import CrtOverlay from '@/components/arcanum/CrtOverlay';
import { StatusClock, TitleUptime } from '@/components/arcanum/StatusTime';
import { getGuide } from '@/lib/guides';
import { shellUser } from '@/lib/commands';
import { typingActivity } from '@/lib/typingActivity';
import { moonPhase } from '@/lib/moon';
import MoonGlyph from '@/components/arcanum/MoonGlyph';
import { sGlyph } from '@/lib/sound';
import CommandBar from '@/components/arcanum/CommandBar';
import BootSequence from '@/components/arcanum/BootSequence';
import MotdBlock from '@/components/arcanum/MotdBlock';
import TuiMenu from '@/components/arcanum/TuiMenu';
import LibraryBlock from '@/components/arcanum/LibraryBlock';
import StatsBlock from '@/components/arcanum/StatsBlock';
import SpreadBlock from '@/components/arcanum/SpreadBlock';
import { ProgressLine, PendingLine } from '@/components/arcanum/ProgressLine';
import HistoryBlock from '@/components/arcanum/HistoryBlock';
import RestoreOffer from '@/components/arcanum/RestoreOffer';
import ReadingResult from '@/components/arcanum/ReadingResult';
import ScrollLine from '@/components/arcanum/ScrollLine';
import ArcanaBlock from '@/components/arcanum/ArcanaBlock';
import MoonBlock from '@/components/arcanum/MoonBlock';
import WeekBlock from '@/components/arcanum/WeekBlock';
import MonthBlock from '@/components/arcanum/MonthBlock';
import ThemeBlock from '@/components/arcanum/ThemeBlock';
import HoroscopeBlock from '@/components/arcanum/HoroscopeBlock';
import CardChronicleBlock from '@/components/arcanum/CardChronicleBlock';
import EchoBlock from '@/components/arcanum/EchoBlock';
import Typewriter from '@/components/arcanum/Typewriter';
import ProseType from '@/components/arcanum/ProseType';
import type { ScrollExport } from '@/lib/scroll';
import type { EchoMatchItem, Entry, HistoryRow } from '@/lib/transcript';
import { getTheme } from '@/lib/themes';

export type ShellMode =
  | 'БУТ' | 'ОЖИДАНИЕ' | 'ВОПРОС' | 'ТАСОВАНИЕ'
  | 'РАСКЛАД' | 'ЧТЕНИЕ' | 'МЕНЮ' | 'ЖУРНАЛ';

interface ShellProps {
  characterId: string;
  mode: ShellMode;
  spreadCtx?: string | null;
  sessionHex: string;
  streak: number;
  /** серия рассветов: карты дня до полудня, подряд */
  morningStreak?: number;
  /** сегодняшний ритуал был утренним */
  morningToday?: boolean | null;
  entries: Entry[];
  scrollTick: number;
  busy: boolean;
  pendingQuestion: boolean;
  pendingCards: 1 | 3;
  pendingLabel?: string | null;
  bootDone: boolean;
  soundOn: boolean;
  channelBusy: boolean;
  onToggleSound: () => void;
  onBootDone: () => void;
  onRunCmd: (cmd: string) => void;
  onSubmitInput: (value: string) => void;
  onCancelPending: () => void;
  onGuideSelect: (id: string) => void;
  onFlip: (entryId: number, index: number) => void;
  onHistorySelect: (row: HistoryRow) => void;
  onAskCard: (entryId: number, cardIdx: number) => void;
  /** парный follow-up: связь двух карт из чтения */
  onAskPair: (entryId: number, cardIdxs: [number, number]) => void;
  /** экспорт свитка: текст чтения — в буфер и файлом */
  onExportScroll: (scroll: ScrollExport) => void;
  /** отголосок журнала: поиск прошлых чтений с общими картами */
  onEcho: (entryId: number) => void | Promise<void>;
  /** клик по отголоску: развернуть то чтение (instant) */
  onEchoSelect: (match: EchoMatchItem) => void;
  /** лорометр проводников — счёт чтений по голосам (для меню проводников) */
  guideReadings?: Record<string, number>;
  /** ритуал дня: свершён ли сегодня (null — не знаем, MOTD молчит) */
  dailyDone?: boolean | null;
  /** покрытие фосфора: активная тема терминала */
  themeId?: string;
  /** выбор темы из блока/статус-лайна */
  onThemeSelect?: (id: string) => void;
  /** прогноз дня: вывести план дня из карты дня */
  onForecast?: (entryId: number) => void;
  /** хроника карты из чипа: имя аркана — в журнал выпадений */
  onChronicle?: (cardName: string) => void;
  /** спросить снова: повторить расклад этого чтения */
  onAskAgain?: (spreadId: string) => void;
  /** отправить в терминал: шаринг чтения в личку (токен/id строки) */
  onShare?: (entryId: number) => void;
  onRestoreSession: () => void;
  onDiscardSession: () => void;
}

export default function Shell({
  characterId,
  mode,
  spreadCtx,
  sessionHex,
  streak,
  morningStreak,
  morningToday,
  entries,
  scrollTick,
  busy,
  pendingQuestion,
  pendingCards,
  pendingLabel,
  bootDone,
  soundOn,
  channelBusy,
  onToggleSound,
  onBootDone,
  onRunCmd,
  onSubmitInput,
  onCancelPending,
  onGuideSelect,
  onFlip,
  onHistorySelect,
  onAskCard,
  onAskPair,
  onExportScroll,
  onEcho,
  onEchoSelect,
  guideReadings,
  dailyDone,
  themeId,
  onThemeSelect,
  onForecast,
  onChronicle,
  onAskAgain,
  onShare,
  onRestoreSession,
  onDiscardSession,
}: ShellProps) {
  const guide = getGuide(characterId);
  const theme = getTheme(themeId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // луна для статус-лайна: считается один раз после
  // первого кадра (день за сеанс не сменится) — как StatusClock,
  // без SSR-расхождения
  const [moonSl, setMoonSl] = useState<{
    name: string; illum: number; waning: boolean;
  } | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const p = moonPhase(new Date());
      setMoonSl({
        name: p.phaseName,
        illum: p.illum,
        waning: p.waning,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // ambient-сигил: после бута и без reduced-motion. Оптимизированная
  // версия (~30 узлов, GPU-слои) дешёвая — гейтим только совсем
  // слабую память (deviceMemory < 2), ядра больше не решают.
  // (rAF-дефер — как у луны: первый кадр без сигила, гидрация сходится)
  const [sigilOk, setSigilOk] = useState(false);
  useEffect(() => {
    if (!bootDone) return;
    const raf = requestAnimationFrame(() => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      const weak = nav.deviceMemory != null && nav.deviceMemory < 2;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!weak && !reduced) setSigilOk(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [bootDone]);

  // сигил в фон, когда в транскрипте уже есть карты на столе
  const dimSigil = useMemo(
    () => entries.some((e) => e.kind === 'json' || e.kind === 'daily' || e.kind === 'spread'),
    [entries],
  );

  // глиф сигила сшит из контекста чтения: проводник + карта дня
  // (id и имя); карта ещё не вытянута — глиф держится на проводнике
  const sigilSeed = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.kind === 'daily') return `${characterId}·${e.card.id}·${e.card.name}`;
    }
    return `${characterId}·ожидание`;
  }, [entries, characterId]);

  // флаг активного скролла: фон замирает, контент получает бюджет
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

  // data-typing: печать → пауза ambient-слоёв
  useEffect(() => {
    const root = rootRef.current;
    const host = root?.closest('.crt') ?? root;
    return typingActivity.subscribe((active) => {
      root?.toggleAttribute('data-typing', active);
      host?.toggleAttribute('data-typing', active);
    });
  }, []);

  // автоскролл: следуем за выводом, если пользователь внизу;
  // новый расклад — прыжок к его началу
  const handledReadingRef = useRef<number | null>(null);
  const anchorIdRef = useRef<number | null>(null);
  const anchorUntilRef = useRef(0);
  const scrollRafRef = useRef(0);
  const ANCHOR_MS = 2000;
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

    if (entries.length === 0) {
      handledReadingRef.current = null;
      anchorIdRef.current = null;
      anchorUntilRef.current = 0;
      return;
    }

    // новейший расклад в транскрипте
    let readingId: number | null = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].kind === 'json') { readingId = entries[i].id; break; }
    }

    const now = Date.now();

    // появился новый расклад → прыжок к его началу
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

    // свежий расклад ещё на экране — не дёргаем позицию
    if (anchorIdRef.current != null && now < anchorUntilRef.current && readingId === anchorIdRef.current) {
      return;
    }

    // обычный терминал: следуем вниз, если пользователь внизу
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

  // ── рендер одной записи транскрипта ──
  const renderEntry = (entry: Entry): ReactNode => {
    switch (entry.kind) {
      case 'boot':
        return <BootSequence key={entry.id} characterId={characterId} onDone={onBootDone} />;

      case 'motd':
        return (
          <MotdBlock
            key={entry.id}
            characterId={characterId}
            onRunCmd={onRunCmd}
            streak={streak}
            dailyDone={dailyDone}
            morningStreak={morningStreak}
            morningToday={morningToday}
          />
        );

      case 'cmd':
        return (
          <div key={entry.id} className="prompt-line tl">
            <span className="cd-user">{shellUser(characterId)}</span>
            <span className="cd-path">:~$ </span>
            <Typewriter text={entry.text} className="cmd-echo" sound speedMs={16} />
          </div>
        );

      case 'out':
        return (
          <div key={entry.id} className="out-block">
            {entry.lines.map((l, i) => (
              <div
                key={i}
                className={`tl tl-${l.tone ?? 'plain'} ${entry.stagger ? 'print-line' : ''}`}
                style={entry.stagger ? ({ '--pl-delay': `${i * 80}ms` } as React.CSSProperties) : undefined}
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
              layout="column1"
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
              spreadId={entry.spreadId}
              onAskAgain={
                entry.instant || !entry.spreadId || !onAskAgain
                  ? undefined
                  : () => onAskAgain(entry.spreadId!)
              }
              onAskCard={entry.instant ? undefined : (idx) => onAskCard(entry.id, idx)}
              onAskPair={entry.instant ? undefined : (idxs) => onAskPair(entry.id, idxs)}
              onRunCmd={onRunCmd}
              onExportScroll={onExportScroll}
              onEcho={() => onEcho(entry.id)}
              onForecast={entry.instant ? undefined : () => onForecast?.(entry.id)}
              onChronicle={onChronicle ? (name) => onChronicle(name) : undefined}
              onShare={
                entry.token || entry.dbId ? () => onShare?.(entry.id) : undefined
              }
              readAt={entry.readAt}
            />
          </div>
        );

      case 'scroll':
        return <ScrollLine key={entry.id} entry={entry} />;

      case 'arcana':
        return (
          <div key={entry.id} data-eid={entry.id} className="entry-pad">
            <ArcanaBlock entry={entry} onRunCmd={onRunCmd} />
          </div>
        );

      // фаза луны: блок пересчитывает дату сам
      case 'moon':
        return (
          <div key={entry.id} className="entry-pad">
            <MoonBlock characterId={characterId} />
          </div>
        );

      // дайджест недели: блок сам грузит журнал и рефлексию
      case 'week':
        return (
          <div key={entry.id} className="entry-pad">
            <WeekBlock characterId={characterId} onRunCmd={onRunCmd} onExportScroll={onExportScroll} />
          </div>
        );

      // дайджест месяца: полоса дней + баланс аркан + рефлексия
      case 'month':
        return (
          <div key={entry.id} className="entry-pad">
            <MonthBlock characterId={characterId} onRunCmd={onRunCmd} onExportScroll={onExportScroll} />
          </div>
        );

      // покрытие фосфора: список тем, активная — live
      case 'theme':
        return (
          <div key={entry.id} className="entry-pad">
            <ThemeBlock activeId={themeId ?? 'classic'} onSelect={(id) => onThemeSelect?.(id)} />
          </div>
        );

      // прогноз дня по карте: блок сам ждёт LLM и расцветает
      case 'forecast':
        return (
          <div key={entry.id} data-eid={entry.id} className="entry-pad">
            <HoroscopeBlock
              entry={entry}
              characterId={characterId}
              onExportScroll={onExportScroll}
            />
          </div>
        );

      // хроника карты: блок сам тянет весь журнал и собирает события
      case 'card':
        return (
          <div key={entry.id} data-eid={entry.id} className="entry-pad">
            <CardChronicleBlock entry={entry} characterId={characterId} />
          </div>
        );

      // отголосок журнала: список прошлых чтений с общими картами
      case 'echo':
        return (
          <div key={entry.id} data-eid={entry.id} className="entry-pad">
            <EchoBlock entry={entry} onSelect={onEchoSelect} />
          </div>
        );

      case 'followup': {
        const fuGuide = getGuide(entry.characterId ?? characterId);
        // парный follow-up: два арта + глиф связи, заголовок «A × B»
        const isPair = entry.pair === true && Boolean(entry.cardName2);
        return (
          <div key={entry.id} data-eid={entry.id} className="entry-pad">
            <div className="followup-block frame-ritual p-3.5" style={{ '--guide-accent': fuGuide.accent } as React.CSSProperties}>
              <span className="corner corner-tl">╔</span>
              <span className="corner corner-tr">┐</span>
              <span className="corner corner-bl">└</span>
              <span className="corner corner-br">╝</span>
              <div className="followup-head">
                <span className="followup-title">
                  {isPair
                    ? `уточнение · «${entry.cardName}» × «${entry.cardName2}»`
                    : `уточнение · «${entry.cardName}»`}
                </span>
                {entry.spreadLabel && <span className="followup-spread">{entry.spreadLabel}</span>}
              </div>
              {isPair && (
                <div className="followup-pair-head">
                  {entry.cardImage && (
                    <img
                      src={entry.cardImage}
                      alt={entry.cardName}
                      className="followup-pair-art followup-pair-art--left"
                    />
                  )}
                  <span className="followup-pair-link" aria-hidden="true">
                    <Link2 size={14} strokeWidth={1.75} />
                  </span>
                  {entry.cardImage2 && (
                    <img
                      src={entry.cardImage2}
                      alt={entry.cardName2!}
                      className="followup-pair-art followup-pair-art--right"
                    />
                  )}
                </div>
              )}
              <div className="followup-question">— {entry.question}</div>
              <ProseType text={entry.answer} className="followup-answer" />
            </div>
          </div>
        );
      }

      case 'menu':
        return (
          <div key={entry.id} className="entry-pad">
            <TuiMenu
              menuId={entry.menuId}
              activeGuideId={characterId}
              onRunCmd={onRunCmd}
              onGuideSelect={onGuideSelect}
              guideReadings={guideReadings}
            />
          </div>
        );

      case 'library':
        return (
          <div key={entry.id} className="entry-pad">
            <LibraryBlock />
          </div>
        );

      case 'stats':
        return (
          <div key={entry.id} className="entry-pad">
            <StatsBlock onRunCmd={onRunCmd} />
          </div>
        );

      case 'history':
        return (
          <div key={entry.id} className="entry-pad">
            <HistoryBlock rows={entry.rows} onSelect={onHistorySelect} />
          </div>
        );

      case 'restore':
        return (
          <div key={entry.id} className="entry-pad">
            <RestoreOffer
              count={entry.count}
              savedAt={entry.savedAt}
              onRestore={onRestoreSession}
              onDiscard={onDiscardSession}
            />
          </div>
        );

      case 'error':
        return (
          <div key={entry.id} className="err-block">
            <div className="tl tl-err">E1: {entry.msg}</div>
            <div className="tl tl-faint">{'╰─ сеанс прерван · повтори попытку'}</div>
          </div>
        );

      case 'ok':
        return (
          <div key={entry.id} className="ok-block">
            <div className="tl tl-ok">[ ok ] {entry.msg}</div>
          </div>
        );

      case 'paywall':
        return (
          <div key={entry.id} className="entry-pad">
            <div className="tl tl-warn">пелена: {entry.msg}</div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <CrtOverlay
      characterId={characterId}
      themeId={themeId}
      showSigil={sigilOk}
      dimSigil={dimSigil}
      sigilSeed={sigilSeed}
    >
      <div
        className="shell-root"
        ref={rootRef}
        style={
          {
            '--guide-accent': guide.accent,
            '--guide-accent-dim': guide.accentDim,
            '--guide-glow': guide.accentGlow,
          } as React.CSSProperties
        }
      >
        {/* титл-бар */}
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

        {/* скроллбэк */}
        <div className="shell-scroll" ref={scrollRef}>
          {entries.map(renderEntry)}
          {bootDone && !busy && !pendingQuestion && (
            <div className="scroll-ender tl tl-faint" aria-hidden="true">
              <span className="blink">▊</span> ожидание команды…
            </div>
          )}
        </div>

        {/* vim-статус-лайн */}
        <div className="statusline">
          <span key={mode} className="sl-mode">-- {mode}{spreadCtx ? ` · ${spreadCtx}` : ''} --</span>
          <span className="sl-mid">
            сеанс #{sessionHex} · {guide.tag}
            {channelBusy && <span className="sl-busy" aria-hidden="true"> ⌁ шепчет</span>}
          </span>
          {streak > 0 && (
            <span className="sl-streak" title="дней подряд с картой дня">
              <span className="sl-streak-flame" aria-hidden="true">
                <Flame size={10} strokeWidth={2} />
              </span>{streak}
            </span>
          )}
          {/* рассветы в статус-лайне: янтарное ☀ + счёт */}
          {(morningStreak ?? 0) > 0 && (
            <span
              className="sl-dawn"
              title={`рассветов подряд (карта дня до полудня): ${morningStreak}`}
            >
              <span className="sl-dawn-glyph" aria-hidden="true">☀</span>{morningStreak}
            </span>
          )}
          {/* луна в статус-лайне: векторный диск фазы + подпись, клик — подробнее */}
          {moonSl && (
            <button
              type="button"
              className="sl-moon"
              onClick={() => onRunCmd('taro moon')}
              onMouseEnter={sGlyph}
              title={`фаза луны: ${moonSl.name} · taro moon`}
              aria-label={`фаза луны: ${moonSl.name} — показать`}
            >
              <MoonGlyph
                illum={moonSl.illum}
                waning={moonSl.waning}
                size={15}
                className="sl-moon-glyph-svg"
              />
              <span className="sl-moon-label">{moonSl.name}</span>
            </button>
          )}
          {/* покрытие фосфора: глиф + имя активной темы, клик — список */}
          <button
            type="button"
            className="sl-theme"
            onClick={() => onRunCmd('taro theme')}
            onMouseEnter={sGlyph}
            title={`тема: ${theme.name} · taro theme`}
            aria-label={`тема терминала: ${theme.name} — показать покрытия`}
          >
            <span className="sl-theme-glyph" aria-hidden="true">{theme.glyph}</span>
            <span className="sl-theme-label">{theme.name}</span>
          </button>
          <StatusClock />
        </div>

        {/* командная строка */}
        <CommandBar
          characterId={characterId}
          busy={busy}
          pendingQuestion={pendingQuestion}
          pendingCards={pendingCards}
          pendingLabel={pendingLabel}
          soundOn={soundOn}
          onSubmit={onSubmitInput}
          onCancelPending={onCancelPending}
          onToggleSound={onToggleSound}
        />
      </div>
    </CrtOverlay>
  );
}
