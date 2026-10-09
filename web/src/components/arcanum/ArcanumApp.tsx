'use client';

// ─────────────────────────────────────────────────────────────
// ArcanumApp — оркестратор: журнал записей + парсер команд +
// API + режимы. Нет модалок. Нет экранов. Только транскрипт.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Shell, { ShellMode } from '@/components/arcanum/Shell';
import { parseCommand } from '@/lib/commands';
import { SPREADS } from '@/lib/spreads';
import * as API from '@/lib/api';
import * as SFX from '@/lib/sound';
import { findEchoes } from '@/lib/echo';
import {
  formatDateTime,
  randomHex,
  randomWhisper,
  spreadLabelFromType,
  type EchoMatchItem,
  type Entry,
  type HistoryRow,
} from '@/lib/transcript';
import {
  computeArcana,
  forgetArcanaDate,
  parseBirthDate,
  readSavedArcanaDate,
  saveArcanaDate,
} from '@/lib/arcana';
import {
  buildScrollText,
  SCROLL_FALLBACK_LABEL,
  scrollCopiedLabel,
  type ScrollExport,
} from '@/lib/scroll';
import {
  getTheme,
  normalizeThemeArg,
  readSavedTheme,
  saveTheme,
} from '@/lib/themes';
import { resolveCardQuery, type ChronicleCard } from '@/lib/chronicle';
import { useTarotSession } from '@/hooks/useTarotSession';
import { useSound } from '@/hooks/useSound';
import { useWhisper } from '@/hooks/useWhisper';
import { useHistory, cardsFromHistory } from '@/hooks/useHistory';
import { useGuide } from '@/hooks/useGuide';
import { useSpread } from '@/hooks/useSpread';
import * as sessionStore from '@/lib/sessionPersist';

type PendingQuestion =
  | { spreadId?: string; cards?: 1 | 3 }
  | { followUp: FollowUpCtx }
  | { arcana: boolean }
  | null;

interface FollowUpCtx {
  entryId: number;
  cardIdx: number;
  /** парный вопрос: индекс второй карты */
  cardIdx2?: number;
  /** true — вопрос о связи двух карт */
  pair?: boolean;
  cardName: string;
  cardName2?: string;
  cardImage?: string;
  cardImage2?: string;
  position: string | null;
  position2?: string | null;
  spreadLabel: string;
  spreadQuestion: string | null;
  summary: string;
}

const MOON_PHASES = [
  'луна убывающая', 'луна растущая', 'новолуние близко', 'полнолуние вчера',
];

/** вопрос шёпота личного аркана — голосом проводника через /api/ask */
const ARCANA_QUESTION =
  'что значит мой личный аркан — как его слышать в себе и где он проявляется сильнее всего?';

/** мотнуть транскрипт к записи и подсветить её вспышкой —
 *  повторный вызов команды вместо дублирования записи */
function scrollToEntry(entryId: number): void {
  const scroller = document.querySelector<HTMLElement>('.shell-scroll');
  const node = scroller?.querySelector<HTMLElement>(`[data-eid="${entryId}"]`);
  if (!scroller || !node) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const relTop =
    node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTo({ top: Math.max(relTop - 12, 0), behavior: reduced ? 'auto' : 'smooth' });
  node.classList.remove('lib-flash');
  void node.offsetWidth;
  node.classList.add('lib-flash');
  window.setTimeout(() => node.classList.remove('lib-flash'), 1300);
}

/** локальная дата юзера совпадает с датой из ISO-строки? */
function isSameLocalDay(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function ArcanumApp() {
  const session = useTarotSession();
  const { soundOn, toggleSound } = useSound();
  const whisper = useWhisper(session);
  const { runHistory, handleHistorySelect } = useHistory(session);
  const { runGuideSet } = useGuide(session);
  const { runDaily, runAsk, runSpread, handleFlip } = useSpread(session, whisper);

  const {
    entries, setEntries, mode, setMode, busy, setBusy, busyRef, nidRef,
    characterId, setCharacterId, bootDone, setBootDone, sessionHex, setSessionHex,
    setStreak, setMorningStreak, push, pushOut, pushCmd, echoCmd, updateEntry,
  } = session;
  const { whispersActive } = whisper;

  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion>(null);
  const pendingRef = useRef<PendingQuestion>(null);

  // лорометр проводников: id → число чтений голосом
  const [guideReadings, setGuideReadings] = useState<Record<string, number>>({});

  // ритуал дня: свершён ли сегодня (null — ещё не знаем, баннер молчит)
  const [dailyDone, setDailyDone] = useState<boolean | null>(null);
  /** сегодняшний ритуал был до полудня (рассвет пойман) */
  const [morningToday, setMorningToday] = useState<boolean | null>(null);

  // покрытие фосфора: тема терминала из памяти (после первого кадра —
  // стартуем с classic, чтобы SSR и гидрация сошлись; сохранённая
  // тема подставляется в том же rAF-дефере, что и проводник)
  const [themeId, setThemeId] = useState('classic');

  // зеркало транскрипта для синхронных чтений (без гонок с состоянием)
  const entriesRef = useRef<typeof entries>(entries);
  entriesRef.current = entries;

  // ── инициализация ──
  useEffect(() => {
    // rAF-дефер: state-апдейты после первого кадра (гидрация сошлась)
    const raf = requestAnimationFrame(() => {
      setSessionHex(randomHex(4));
      // сохранённый проводник — сразу (до ответа сервера)
      try {
        const stored = localStorage.getItem('taro_character');
        if (stored) {
          setCharacterId(stored);
          SFX.setCurrentGuideSound(stored);
        }
        // сохранённое покрытие фосфора — сразу же, кадр ещё не показан
        const savedTheme = readSavedTheme();
        if (savedTheme !== 'classic') setThemeId(savedTheme);
      } catch {}
    });
    // серверный проводник + серия дней — асинхронно, колбэками
    void API.getCharacter().then((serverId) => {
      if (serverId) {
        setCharacterId(serverId);
        SFX.setCurrentGuideSound(serverId);
        try {
          localStorage.setItem('taro_character', serverId);
        } catch {}
      }
    });
    void API.getStats().then((stats) => {
      if (stats) {
        setStreak(stats.streakDays ?? 0);
        setMorningStreak(stats.morningStreak ?? 0);
        setGuideReadings(stats.guideReadings ?? {});
        setDailyDone(stats.lastDailyAt ? isSameLocalDay(stats.lastDailyAt) : false);
        setMorningToday(
          stats.lastMorningAt ? isSameLocalDay(stats.lastMorningAt) : false,
        );
      }
    });
    return () => cancelAnimationFrame(raf);
     
  }, []);

  // ── лорометр: новое завершённое чтение → освежить счёт голосов ──
  // следим за последней json-записью в транскрипте; гонок нет — тихо
  // пропускаем обновление, если предыдущее ещё в полёте.
  // здесь же обновляем ритуал дня: после завершённого чтения сервер
  // уже знает свежий lastDailyAt. ФИКС: карта дня пишется как 'daily',
  // а не 'json' — раньше баннер «сегодняшний ритуал не свершён» не
  // исчезал после вытягивания дневной карты.
  const loreJsonIdRef = useRef<number | null>(null);
  const loreBusyRef = useRef(false);
  useEffect(() => {
    let newest: number | null = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      const k = entries[i].kind;
      if (k === 'json' || k === 'daily') { newest = entries[i].id; break; }
    }
    if (newest == null || loreJsonIdRef.current === newest) return;
    loreJsonIdRef.current = newest;
    if (loreBusyRef.current) return;
    loreBusyRef.current = true;
    void API.getStats()
      .then((stats) => {
        if (stats?.guideReadings) setGuideReadings(stats.guideReadings);
        if (stats) {
          setStreak(stats.streakDays ?? 0);
          setDailyDone(stats.lastDailyAt ? isSameLocalDay(stats.lastDailyAt) : false);
          setMorningToday(
            stats.lastMorningAt ? isSameLocalDay(stats.lastMorningAt) : false,
          );
        }
      })
      .catch(() => {})
      .finally(() => { loreBusyRef.current = false; });
  }, [entries]);

  // ── статус-лайн: имя последнего активного расклада ──
  const spreadCtx = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if ((e.kind === 'spread' || e.kind === 'json') && e.spreadLabel) return e.spreadLabel;
      if (e.kind === 'daily') return 'карта дня';
    }
    return null;
  }, [entries]);

  // ── пасхалки ──
  const runEasterEgg = useCallback(
    async (kind: string, rest?: string) => {
      switch (kind) {
        case 'whoami':
          pushOut([{ text: 'оператор (uid=1000 gid=13 группы=тени,луна)', tone: 'plain' }]);
          break;
        case 'uname':
          pushOut([{ text: 'ARCANUM 3.7.0-луна #1 SMP PREEMPT occult/x86_64 terminal', tone: 'plain' }]);
          break;
        case 'date': {
          const phase = MOON_PHASES[Math.floor(Math.random() * MOON_PHASES.length)];
          pushOut([{ text: `${new Date().toLocaleString('ru-RU')} · ${phase}`, tone: 'plain' }]);
          break;
        }
        case 'pwd':
          pushOut([{ text: '/дом/оператора/сеанс', tone: 'plain' }]);
          break;
        case 'ls':
          pushOut([{ text: 'колода/  проводники/  сеансы.log  README.оккульт  .шёпот', tone: 'plain' }]);
          break;
        case 'sudo':
          pushOut([
            { text: 'оператор не входит в список sudoers.', tone: 'err' },
            { text: 'инцидент будет доложен теням.', tone: 'dim' },
          ]);
          break;
        case 'exit':
          pushOut([
            { text: 'logout', tone: 'plain' },
            { text: 'тени прощаются. канал остаётся открытым.', tone: 'comment' },
          ]);
          break;
        case 'cat': {
          const t = rest || '';
          if (t.includes('readme') || t.includes('оккульт')) {
            pushOut([
              { text: 'README.оккульт — справочник оператора таротерминала.', tone: 'plain' },
              { text: 'восьмое правило: не спрашивай одно и то же дважды за луну.', tone: 'comment' },
            ]);
          } else if (t.includes('шепот') || t.includes('шёпот')) {
            pushOut([{ text: randomWhisper(characterId), tone: 'comment' }]);
          } else if (t.includes('сеансы') || t.includes('log')) {
            pushOut([{ text: 'подсказка: taro history — живой журнал сеансов', tone: 'dim' }]);
          } else {
            pushOut([{ text: `cat: ${t || '?'}: нет такого файла`, tone: 'err' }]);
          }
          break;
        }
      }
    },
    [pushOut, characterId],
  );

  // ── справка (man) — компактная, без шума ──
  const runHelp = useCallback(async () => {
    pushOut(
      [
        { text: 'ARCANUM(1) — оккультный терминал', tone: 'bright' },
        { text: '' },
        { text: 'taro daily            карта дня', tone: 'plain' },
        { text: 'taro ask [вопрос]     три карты под вопрос', tone: 'plain' },
        { text: 'taro ask1 [вопрос]    одна карта — точечный ответ', tone: 'plain' },
        { text: 'taro yesno [вопрос]   да / нет', tone: 'plain' },
        { text: 'taro mfd [вопрос]     мысли · чувства · действия', tone: 'plain' },
        { text: 'taro shadow [тема]    работа с тенью · 6 карт', tone: 'plain' },
        { text: 'taro pentagram        пять стихий вокруг сути', tone: 'plain' },
        { text: 'taro horseshoe        подкова · от ситуации к исходу', tone: 'plain' },
        { text: 'taro catalog          каталог раскладов', tone: 'dim' },
        { text: 'taro guides          сменить проводника', tone: 'dim' },
        { text: 'taro library         колода целиком', tone: 'dim' },
        { text: 'taro history         журнал сеансов', tone: 'dim' },
        { text: 'taro stats          статистика сеансов', tone: 'dim' },
        { text: 'taro arcana [дата]  личный аркан по дате рождения', tone: 'dim' },
        { text: 'taro moon           фаза луны сегодня', tone: 'dim' },
        { text: 'taro week           сводка недели в картах', tone: 'dim' },
        { text: 'taro month           месяц в картах · полоса дней', tone: 'dim' },
        { text: 'taro theme [имя]    покрытие фосфора · темы', tone: 'dim' },
        { text: 'taro card <имя>     хроника карты · вся история', tone: 'dim' },
        { text: 'clear                очистить экран', tone: 'dim' },
        { text: '' },
        { text: '# ' + randomWhisper(characterId), tone: 'faint' },
      ],
      true,
    );
  }, [pushOut, characterId]);

  // ── личный аркан: вычислить ядро, показать, шёпот проводника ──
  // шёпот идёт через существующий /api/ask (одиночная карта);
  // повторный показ из памяти LLM не дёргает — значения выше
  const runArcanaResult = useCallback(
    async (dateStr: string, fromMemory: boolean) => {
      const res = computeArcana(dateStr);
      if (!res) {
        pushOut([{ text: 'дата не разобрана · формат дд.мм.гггг', tone: 'err' }]);
        setMode('ОЖИДАНИЕ');
        return;
      }
      // дата рождения не меняется день ото дня — запоминаем
      saveArcanaDate(dateStr);
      SFX.sArcana();
      const entryId = push({
        kind: 'arcana',
        dateStr,
        cardId: res.card.id,
        ...(fromMemory ? { fromMemory: true } : { askWhisper: true }),
      });
      setMode('ОЖИДАНИЕ');

      if (fromMemory) return;
      // фоновый шёпот проводника: как только ответ пришёл —
      // дописываем его в запись (map по id, паттерн useWhisper)
      void API.askFollowup({
        question: ARCANA_QUESTION,
        card: { name: res.card.name },
        spread_name: 'личный аркан',
        spread_question: null,
        reading_summary: `дата рождения ${dateStr} · нумерологическое ядро ${res.core} · аркан ${res.card.name}`,
        character_id: characterId,
      })
        .then((r) => {
          SFX.sWhisper();
          updateEntry(entryId, { whisper: r.answer } as Partial<Entry>);
        })
        .catch(() => {
          // шёпот не дошёл — локальная строка проводника, не ошибка
          updateEntry(entryId, { whisper: randomWhisper(characterId) } as Partial<Entry>);
          pushOut([{ text: 'шёпот не дошёл · значения карты выше', tone: 'comment' }]);
        });
    },
    [characterId, push, pushOut, setMode, updateEntry],
  );

  // ── покрытие фосфора: сменить тему ──
  // звук — «перекалибровка» (sTheme), запись ok — с именем темы;
  // тема сохраняется в taro_theme и переживает перезагрузку
  const applyTheme = useCallback(
    (id: string) => {
      setThemeId(id);
      saveTheme(id);
      SFX.sTheme(id);
      SFX.haptic('tap');
      const t = getTheme(id);
      pushOut([
        { text: `покрытие фосфора: ${t.name} · ${t.stage}`, tone: 'ok' },
        { text: `# ${t.note}`, tone: 'faint' },
      ]);
      setMode('ОЖИДАНИЕ');
    },
    [pushOut, setMode],
  );

  // ── диспетчер команд ──
  const executeCommand = useCallback(
    async (rawInput: string) => {
      if (busyRef.current) return;
      const parsed = parseCommand(rawInput);
      if (!parsed) return;

      // первая команда после бута гасит предложение восстановления
      if (entriesRef.current.some((e) => e.kind === 'restore')) {
        setEntries((prev) => prev.filter((e) => e.kind !== 'restore'));
      }

      if (parsed.kind === 'comment') {
        pushOut([{ text: rawInput.trim(), tone: 'comment' }]);
        return;
      }

      setBusy(true);
      busyRef.current = true;
      try {
        switch (parsed.kind) {
          case 'daily':
            await echoCmd('taro daily');
            setBusy(false);
            busyRef.current = false;
            await runDaily();
            return;

          case 'ask': {
            if (parsed.question == null) {
              await echoCmd(`taro ask${parsed.cards === 1 ? ' --cards 1' : ''}`);
              setPendingQuestion({ cards: parsed.cards });
              pendingRef.current = { cards: parsed.cards };
              setMode('ВОПРОС');
            } else {
              setBusy(false);
              busyRef.current = false;
              await runAsk(parsed.cards, parsed.question);
            }
            return;
          }

          case 'spread': {
            const spread = SPREADS[parsed.id];
            if (parsed.question == null && spread?.needsQuestion) {
              await echoCmd(spread.cmd);
              setPendingQuestion({ spreadId: parsed.id });
              pendingRef.current = { spreadId: parsed.id };
              setMode('ВОПРОС');
            } else {
              setBusy(false);
              busyRef.current = false;
              await runSpread(parsed.id, parsed.question);
            }
            return;
          }

          case 'catalog':
            await echoCmd('taro catalog');
            push({ kind: 'menu', menuId: 'catalog' });
            setMode('МЕНЮ');
            return;

          // библиотека арканов: одна живая запись в транскрипте.
          // повторный вызов не дублирует — оставляет последнюю,
          // убирает старые, раскрывает её и мотает к ней
          case 'library': {
            await echoCmd('taro library');
            SFX.sMenu();
            const libs = entriesRef.current.filter((e) => e.kind === 'library');
            if (libs.length === 0) {
              push({ kind: 'library' });
            } else {
              const latest = libs[libs.length - 1];
              setEntries((prev) => prev.filter((e) => e.kind !== 'library' || e.id === latest.id));
              updateEntry(latest.id, { open: true });
              scrollToEntry(latest.id);
            }
            setMode('МЕНЮ');
            return;
          }

          // статистика оператора: серия, чтения, расклады, голоса
          case 'stats':
            await echoCmd('taro stats');
            SFX.sMenu();
            push({ kind: 'stats' });
            setMode('МЕНЮ');
            return;

          // личный аркан: нумерологическое ядро даты рождения
          case 'arcana': {
            await echoCmd(
              `taro arcana${parsed.dateArg ? ` ${parsed.dateArg}` : ''}${parsed.fresh ? ' --new' : ''}`,
            );
            // --new / заново: забыть сохранённую дату
            if (parsed.fresh) forgetArcanaDate();
            if (parsed.dateArg) {
              const pd = parseBirthDate(parsed.dateArg);
              if (!pd.ok) {
                // невалид: ошибка без повторного вопроса
                pushOut([{ text: 'дата не разобрана · формат дд.мм.гггг', tone: 'err' }]);
                setMode('ОЖИДАНИЕ');
                return;
              }
              await runArcanaResult(pd.dateStr, false);
              return;
            }
            // без аргументов: из памяти терминала или спросить дату
            const saved = readSavedArcanaDate();
            if (saved) {
              await runArcanaResult(saved, true);
            } else {
              setPendingQuestion({ arcana: true });
              pendingRef.current = { arcana: true };
              setMode('ВОПРОС');
            }
            return;
          }

          // фаза луны: блок пересчитывает дату сам — луна вне
          // юрисдикции, но не вне арифметики
          case 'moon':
            await echoCmd('taro moon');
            SFX.sMoon();
            push({ kind: 'moon' });
            setMode('МЕНЮ');
            return;

          // дайджест недели: блок сам грузит журнал и рефлексию
          case 'week':
            await echoCmd('taro week');
            SFX.sWeek();
            push({ kind: 'week' });
            setMode('МЕНЮ');
            return;

          // дайджест месяца: полоса дней + баланс аркан
          case 'month':
            await echoCmd('taro month');
            SFX.sMonth();
            push({ kind: 'month' });
            setMode('МЕНЮ');
            return;

          // покрытие фосфора: тема терминала (список или прямой выбор)
          case 'theme': {
            const want = parsed.arg ? normalizeThemeArg(parsed.arg) : null;
            if (parsed.arg && !want) {
              await echoCmd(`taro theme ${parsed.arg}`);
              pushOut([
                { text: `покрытие «${parsed.arg}» не опознано`, tone: 'err' },
                { text: 'доступно: пергамент · серебро · костёр · пепел', tone: 'faint' },
              ]);
              setMode('ОЖИДАНИЕ');
              return;
            }
            if (want && want !== themeId) {
              await echoCmd(`taro theme ${parsed.arg}`);
              applyTheme(want);
              return;
            }
            // без аргумента (или уже активна) — список тем
            await echoCmd('taro theme');
            SFX.sMenu();
            push({ kind: 'theme' });
            setMode('МЕНЮ');
            return;
          }

          // хроника карты: история выпадений аркана из журнала
          case 'card': {
            const query = parsed.query.trim();
            if (!query) {
              await echoCmd('taro card');
              pushOut([
                { text: 'какая карта интересует? назови имя', tone: 'comment' },
                { text: 'напр: taro card шут · taro card дама мечей', tone: 'faint' },
              ]);
              setMode('ОЖИДАНИЕ');
              return;
            }
            await echoCmd(`taro card ${query}`);
            const qr = resolveCardQuery(query);
            if (qr.status === 'ok' && qr.card) {
              const c = qr.card;
              SFX.sEcho(); // листание журнала — далёкий колокол с эхом
              push({
                kind: 'card',
                cardId: c.id,
                cardName: c.name,
                cardImage: `/cards/${c.filename}`,
                arcana: c.arcana,
                suit: c.suit,
                number: c.number,
                upright: c.upright,
                reversed: c.reversed,
              });
              setMode('ЖУРНАЛ');
              return;
            }
            if (qr.status === 'ambiguous') {
              const names = qr.matches.map((m) => m.name).join(' · ');
              pushOut([
                { text: `«${query}» — несколько карт подходят:`, tone: 'warn' },
                { text: names, tone: 'faint' },
                { text: 'уточни имя — хроника покажет одну', tone: 'faint' },
              ]);
              setMode('ОЖИДАНИЕ');
              return;
            }
            pushOut([
              { text: `карта «${query}» не опознана`, tone: 'err' },
              { text: 'имя из колоды: напр. «шут», «двойка кубков» · taro library — вся колода', tone: 'faint' },
            ]);
            setMode('ОЖИДАНИЕ');
            return;
          }

          case 'guides':
            await echoCmd('taro guides');
            push({ kind: 'menu', menuId: 'guides' });
            setMode('МЕНЮ');
            return;

          case 'guide-set':
            setBusy(false);
            busyRef.current = false;
            await runGuideSet(parsed.id);
            return;

          case 'history':
            await echoCmd('taro history');
            setBusy(false);
            busyRef.current = false;
            await runHistory();
            return;

          case 'help':
            await echoCmd('man taro');
            await runHelp();
            setMode('ОЖИДАНИЕ');
            return;

          case 'sound':
            await echoCmd('taro sound');
            toggleSound();
            setMode('ОЖИДАНИЕ');
            return;

          case 'clear':
            await echoCmd('clear');
            setEntries([]);
            nidRef.current = 1;
            pushOut([{ text: 'экран очищен · help — справка', tone: 'faint' }]);
            setMode('ОЖИДАНИЕ');
            return;

          case 'whoami':
          case 'uname':
          case 'date':
          case 'pwd':
          case 'ls':
          case 'sudo':
          case 'cat':
          case 'exit':
            await echoCmd(rawInput.trim());
            await runEasterEgg(parsed.kind, (parsed as any).rest ?? (parsed as any).target);
            setMode('ОЖИДАНИЕ');
            return;

          case 'unknown':
          default: {
            await echoCmd(rawInput.trim());
            pushOut([
              { text: `bash: ${(parsed as any).cmd ?? ''}: команда не найдена`, tone: 'err' },
              { text: 'help — справка · taro catalog — расклады', tone: 'dim' },
            ]);
            setMode('ОЖИДАНИЕ');
            return;
          }
        }
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [
      echoCmd, push, pushOut, runAsk, runSpread, runDaily, runGuideSet, runHistory,
      runHelp, runEasterEgg, toggleSound, setEntries, nidRef, setMode, setBusy, busyRef,
      runArcanaResult, themeId, applyTheme,
    ],
  );

  // ── уточняющий вопрос по карте из чтения ──
  const handleAskCard = useCallback(
    (entryId: number, cardIdx: number) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.kind !== 'json') return;
      const card = entry.cards[cardIdx];
      if (!card) return;
      const positions = entry.interpretation?.['позиции'];
      const pos = Array.isArray(positions) ? positions[cardIdx]?.['позиция'] ?? null : null;
      const summary =
        entry.interpretation?.short_answer ??
        entry.interpretation?.intro ??
        'чтение прошло без подробностей';
      const followUp: FollowUpCtx = {
        entryId,
        cardIdx,
        cardName: card.name,
        cardImage: card.image_url,
        position: pos,
        spreadLabel: entry.spreadLabel,
        spreadQuestion: entry.question ?? null,
        summary,
      };
      setPendingQuestion({ followUp });
      pendingRef.current = { followUp };
      setMode('ВОПРОС');
    },
    [setMode],
  );

  // ── парный вопрос: вопрос о связи двух карт из чтения ──
  const handleAskPair = useCallback(
    (entryId: number, cardIdxs: [number, number]) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.kind !== 'json') return;
      const [i1, i2] = cardIdxs;
      const card1 = entry.cards[i1];
      const card2 = entry.cards[i2];
      if (!card1 || !card2 || i1 === i2) return;
      const positions = entry.interpretation?.['позиции'];
      const posOf = (idx: number): string | null =>
        Array.isArray(positions) ? positions[idx]?.['позиция'] ?? null : null;
      const summary =
        entry.interpretation?.short_answer ??
        entry.interpretation?.intro ??
        'чтение прошло без подробностей';
      const followUp: FollowUpCtx = {
        entryId,
        cardIdx: i1,
        cardIdx2: i2,
        pair: true,
        cardName: card1.name,
        cardName2: card2.name,
        cardImage: card1.image_url,
        cardImage2: card2.image_url,
        position: posOf(i1),
        position2: posOf(i2),
        spreadLabel: entry.spreadLabel,
        spreadQuestion: entry.question ?? null,
        summary,
      };
      setPendingQuestion({ followUp });
      pendingRef.current = { followUp };
      setMode('ВОПРОС');
    },
    [setMode],
  );

  // ── спросить снова: тот же расклад, новый сеанс ──
  // выбранный расклад сохраняется — каталог листать заново не нужно;
  // если расклад требует вопроса — сразу режим вопроса с ним
  const handleAskAgain = useCallback(
    (spreadId: string) => {
      const spread = SPREADS[spreadId];
      if (!spread) {
        pushOut([{ text: `расклад «${spreadId}» не найден в каталоге`, tone: 'err' }]);
        setMode('ОЖИДАНИЕ');
        return;
      }
      if (spread.needsQuestion) {
        pushOut([
          { text: `${spread.name} · расклад сохранён — сформулируй новый вопрос`, tone: 'comment' },
        ]);
        setPendingQuestion({ spreadId });
        pendingRef.current = { spreadId };
        setMode('ВОПРОС');
      } else {
        // расклад без обязательного вопроса — сразу новая раздача
        void runSpread(spreadId, null);
      }
    },
    [pushOut, runSpread, setMode],
  );

  const runFollowUp = useCallback(
    async (ctx: FollowUpCtx, question: string) => {
      setBusy(true);
      busyRef.current = true;
      setMode('ЧТЕНИЕ');
      const isPair = ctx.pair === true;
      try {
        if (isPair) {
          await echoCmd(`taro ask --pair "${ctx.cardName} · ${ctx.cardName2 ?? ''}"`);
          push({ kind: 'pending', label: `шёпот о паре «${ctx.cardName} · ${ctx.cardName2 ?? ''}»` });
        } else {
          await echoCmd(`taro ask --card "${ctx.cardName}"`);
          push({ kind: 'pending', label: `шёпот о «${ctx.cardName}»` });
        }
        const res = await API.askFollowup(
          isPair
            ? {
                question,
                cards: [
                  { name: ctx.cardName, position: ctx.position },
                  { name: ctx.cardName2 ?? '', position: ctx.position2 ?? null },
                ],
                spread_name: ctx.spreadLabel,
                spread_question: ctx.spreadQuestion,
                reading_summary: ctx.summary,
                character_id: characterId,
              }
            : {
                question,
                card: { name: ctx.cardName, position: ctx.position },
                spread_name: ctx.spreadLabel,
                spread_question: ctx.spreadQuestion,
                reading_summary: ctx.summary,
                character_id: characterId,
              },
        );
        // парный ответ — двухголосый мотив, одиночный — обычный шёпот
        if (isPair) SFX.sPairWhisper();
        else SFX.sWhisper();
        push({
          kind: 'followup',
          cardName: ctx.cardName,
          cardImage: ctx.cardImage,
          question,
          answer: res.answer,
          spreadLabel: ctx.spreadLabel,
          characterId,
          ...(isPair
            ? { pair: true, cardName2: ctx.cardName2, cardImage2: ctx.cardImage2 }
            : {}),
        });
        setMode('ОЖИДАНИЕ');
      } catch (err: any) {
        SFX.sError();
        push({ kind: 'error', msg: err?.message || 'канал недоступен' });
        setMode('ОЖИДАНИЕ');
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [characterId, echoCmd, push, setBusy, busyRef, setMode],
  );

  // ── экспорт свитка: буфер обмена + запись-подтверждение ──
  // попытка буфера стартует синхронно внутри жеста клика —
  // иначе браузер откажет в пермиссии; сбой не смертелен:
  // остаётся кнопка скачивания файла
  const handleExportScroll = useCallback(
    (scroll: ScrollExport) => {
      const clip: Promise<boolean> = (async () => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(scroll.text);
            return true;
          }
        } catch {}
        return false;
      })();
      void clip.then((copied) => {
        push({
          kind: 'scroll',
          label: copied ? scrollCopiedLabel(scroll.lineCount) : SCROLL_FALLBACK_LABEL,
          text: scroll.text,
          filename: scroll.filename,
          copied,
        });
      });
    },
    [push],
  );

  // ── шеринг чтения: «отправить в терминал» → /api/share ──
  // живое чтение — токен сеанса, разворот из журнала — id строки;
  // телеграм не принял (502/сеть) — запасной путь: свиток .txt,
  // собранный из того же чтения (скачивание через запись scroll)
  const handleShare = useCallback(
    (entryId: number) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.kind !== 'json') return;
      if (!entry.token && !entry.dbId) return;
      void API.shareReading({
        ...(entry.token ? { token: entry.token } : {}),
        ...(entry.dbId ? { reading_id: entry.dbId } : {}),
      })
        .then(() => {
          SFX.sSeal();
          SFX.sSent();
          SFX.haptic('tick');
          pushOut([{ text: 'чтение ушло в терминал · свиток ждёт в личке', tone: 'ok' }]);
        })
        .catch(() => {
          SFX.sError();
          const scroll = buildScrollText({
            interpretation: entry.interpretation,
            cards: entry.cards,
            question: entry.question,
            spreadLabel: entry.spreadLabel,
            characterId: entry.characterId ?? characterId,
            ...(entry.readAt ? { at: new Date(entry.readAt) } : {}),
          });
          push({
            kind: 'scroll',
            label: 'терминал не принял — свиток файлом',
            text: scroll.text,
            filename: scroll.filename,
            copied: false,
          });
        });
    },
    [characterId, push, pushOut],
  );

  // ── хроника карты: единый вход для команды и чипа ──
  // артефакт журнала — живые данные, пересчёт при каждой открытии
  const pushChronicleCard = useCallback(
    (c: ChronicleCard) => {
      SFX.sEcho(); // листание журнала — далёкий колокол с эхом
      push({
        kind: 'card',
        cardId: c.id,
        cardName: c.name,
        cardImage: `/cards/${c.filename}`,
        arcana: c.arcana,
        suit: c.suit,
        number: c.number,
        upright: c.upright,
        reversed: c.reversed,
      });
      setMode('ЖУРНАЛ');
    },
    [push],
  );

  // чип «хроника карты» на чтении: имя приходит из колоды —
  // resolve почти всегда ок; подстраховка на случай рассинхрона
  const handleChronicle = useCallback(
    (cardName: string) => {
      const qr = resolveCardQuery(cardName);
      if (qr.status === 'ok' && qr.card) {
        pushChronicleCard(qr.card);
        return;
      }
      pushOut([
        { text: `карта «${cardName}» не опознана`, tone: 'err' },
        { text: 'taro card <имя> · taro library — вся колода', tone: 'faint' },
      ]);
      setMode('ОЖИДАНИЕ');
    },
    [pushChronicleCard, pushOut],
  );

  // ── отголосок журнала: прошлые чтения с общими картами ──
  // чип чтения → сверка с журналом текущего месяца; найдено —
  // список-выбор (до 3 строк), пусто — тихая строка не-ошибка
  const handleEcho = useCallback(
    async (entryId: number) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.kind !== 'json') return;
      if (busyRef.current) return;
      setBusy(true);
      busyRef.current = true;
      try {
        // окно эха — 30 дней, не текущий месяц: отголоски из
        // прошлого месяца тоже звучат (getReadingsDays уже есть)
        const rows = (await API.getReadingsDays(30)) as HistoryRow[];
        const matches = findEchoes(
          {
            cards: entry.cards,
            question: entry.question,
            spreadLabel: entry.spreadLabel,
          },
          rows,
          entry.dbId,
        );
        if (matches.length === 0) {
          // не ошибка — эти карты говорят впервые
          pushOut([{ text: 'отголосков нет · эти карты говорят впервые', tone: 'faint' }]);
          setMode('ОЖИДАНИЕ');
          return;
        }
        // память отзывается: далёкий колокол с эхом
        SFX.sEcho();
        push({
          kind: 'echo',
          matches: matches.map((m) => ({
            dbId: m.row.id,
            created_at: m.row.created_at,
            spreadLabel: spreadLabelFromType(m.row.type),
            question: m.row.question,
            sharedNames: m.sharedNames,
            sharedCount: m.sharedCount,
            character_id: m.row.character_id,
            row: m.row,
          })),
          forEntryId: entryId,
        });
        setMode('ЖУРНАЛ');
      } catch (err: any) {
        push({ kind: 'error', msg: err?.message ?? 'журнал недоступен' });
        setMode('ОЖИДАНИЕ');
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [push, pushOut, setMode, setBusy, busyRef],
  );

  // ── выбор отголоска: разворот того чтения, как из журнала ──
  // перед разворотом — маленькая пометка-строка с датой отголоска
  const handleEchoSelect = useCallback(
    (match: EchoMatchItem) => {
      if (busyRef.current) return;
      const row = match.row;
      const norm = cardsFromHistory(row.cards_data).map((c) => ({
        ...c,
        image_url: c.image_url || `/cards/${c.id}.png`,
      }));
      pushOut([{ text: `отголосок · ${formatDateTime(match.created_at)}`, tone: 'comment' }]);
      push({
        kind: 'json',
        interpretation: row.interpretation ?? {
          intro: '(толкование не сохранилось)',
          short_answer: '',
        },
        cards: norm,
        question: row.question,
        spreadLabel: match.spreadLabel,
        instant: true,
        characterId: row.character_id,
        // свиток и повторный отголосок помнят исходную строку
        readAt: row.created_at,
        dbId: row.id,
      });
      setMode('ЧТЕНИЕ');
    },
    [pushOut, push, setMode, busyRef],
  );

  // ── прогноз дня: вывести план дня из карты дня ──
  // чип живёт на чтении «карта дня»: клик → запись-ожидание →
  // POST /api/forecast → прогноз дописывается в запись (как шёпот
  // личного аркана). Живое чтение, не журнал: instant скрыт.
  const handleForecast = useCallback(
    (entryId: number) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (entry?.kind !== 'json') return;
      if (busyRef.current) return;
      const card = entry.cards[0];
      if (!card) return;
      // один прогноз на карту: не дублируем, если уже собран
      // (провалившийся можно перезапросить)
      const already = entriesRef.current.some(
        (e) =>
          e.kind === 'forecast' &&
          e.cardName === card.name &&
          !e.failed,
      );
      if (already) return;

      const fcId = push({
        kind: 'forecast',
        cardName: card.name,
        cardImage: card.image_url,
        reversed: Boolean(card.is_reversed),
      });
      setMode('ЧТЕНИЕ');

      void API.dayForecast({
        card: { name: card.name, is_reversed: Boolean(card.is_reversed) },
        character_id: entry.characterId ?? characterId,
      })
        .then((r) => {
          SFX.sWhisper();
          updateEntry(fcId, {
            forecast: r.forecast,
            fallback: r.fallback || undefined,
          } as Partial<Entry>);
        })
        .catch(() => {
          // канал занят — запись честно об этом говорит
          updateEntry(fcId, { failed: true } as Partial<Entry>);
          setMode('ОЖИДАНИЕ');
        });
    },
    [characterId, push, pushOut, setMode, updateEntry, busyRef],
  );

  // ── ввод из командной строки ──
  const handleSubmitInput = useCallback(
    async (value: string) => {
      const v = value.trim();

      // режим вопроса: любая строка = ответ
      if (pendingRef.current) {
        const pending = pendingRef.current;
        setPendingQuestion(null);
        pendingRef.current = null;
        if ('followUp' in pending) {
          if (!v.length) {
            pushOut([
              {
                text: pending.followUp.pair
                  ? 'вопрос снят · пара возвращается в ряд'
                  : 'вопрос снят · карта возвращается в ряд',
                tone: 'dim',
              },
            ]);
            setMode('ОЖИДАНИЕ');
            return;
          }
          await runFollowUp(pending.followUp, v);
          return;
        }
        // режим вопроса личного аркана: строка = дата рождения
        if ('arcana' in pending) {
          if (!v.length) {
            pushOut([{ text: 'дата не введена · taro arcana — попробовать снова', tone: 'dim' }]);
            setMode('ОЖИДАНИЕ');
            return;
          }
          const pd = parseBirthDate(v);
          await echoCmd(`taro arcana ${pd.ok ? pd.dateStr : v}`);
          if (!pd.ok) {
            pushOut([{ text: 'дата не разобрана · формат дд.мм.гггг', tone: 'err' }]);
            setMode('ОЖИДАНИЕ');
            return;
          }
          await runArcanaResult(pd.dateStr, false);
          return;
        }
        const { spreadId, cards } = pending;
        const q = v.length ? v : null;
        if (spreadId) await runSpread(spreadId, q);
        else await runAsk(cards ?? 3, q);
        return;
      }

      await executeCommand(v);
    },
    [executeCommand, runAsk, runSpread, runFollowUp, runArcanaResult, pushOut, setMode],
  );

  const handleCancelPending = useCallback(() => {
    setPendingQuestion(null);
    pendingRef.current = null;
    pushOut([
      { text: '^C', tone: 'err' },
      { text: 'вопрос отменён · канал свободен', tone: 'dim' },
    ]);
    setMode('ОЖИДАНИЕ');
  }, [pushOut, setMode]);

  // ── выбор проводника из меню ──
  const handleGuideSelect = useCallback(
    (id: string) => {
      if (busyRef.current) return;
      (async () => {
        await runGuideSet(id);
        setMode('ОЖИДАНИЕ');
      })();
    },
    [runGuideSet, setMode, busyRef],
  );

  // ── конец загрузки → MOTD + предложение восстановления ──
  const handleBootDone = useCallback(() => {
    if (bootDone) return;
    setBootDone(true);
    pushCmd('taro --motd');
    push({ kind: 'motd' });
    const peek = sessionStore.peekSession();
    if (peek) {
      push({ kind: 'restore', count: peek.count, savedAt: peek.savedAt });
    }
    setMode('ОЖИДАНИЕ');
  }, [bootDone, setBootDone, push, pushCmd, setMode]);

  // ── восстановление прошлого сеанса ──
  const handleRestoreSession = useCallback(() => {
    const saved = sessionStore.loadSession();
    if (!saved) {
      pushOut([{ text: 'след прошлой сессии истончился — начинаем чисто', tone: 'dim' }]);
      sessionStore.clearSession();
      setMode('ОЖИДАНИЕ');
      return;
    }
    // новый транскрипт: бут + motd + восстановленные записи
    nidRef.current = saved.maxId + 1;
    setEntries((prev) => {
      const boot = prev.filter((e) => e.kind === 'boot' || e.kind === 'motd');
      const restored = saved.entries.filter((e) => e.kind !== 'restore');
      return [...boot, ...restored];
    });
    pushOut([{ text: `сеанс восстановлен · ${saved.entries.length} записей`, tone: 'ok' }]);
    setMode('ОЖИДАНИЕ');
  }, [nidRef, pushOut, setEntries, setMode]);

  const handleDiscardSession = useCallback(() => {
    sessionStore.clearSession();
    setEntries((prev) => prev.filter((e) => e.kind !== 'restore'));
    pushOut([{ text: 'прошлый сеанс развеян · экран чист', tone: 'dim' }]);
    setMode('ОЖИДАНИЕ');
  }, [pushOut, setEntries, setMode]);

  // ── автосохранение транскрипта (дебаунс после изменений) ──
  // пока предложение восстановления висит без ответа — не затираем хранилище
  useEffect(() => {
    if (!bootDone) return;
    if (entries.some((e) => e.kind === 'restore')) return;
    const t = setTimeout(() => {
      sessionStore.saveSession(entriesRef.current);
    }, 900);
    return () => clearTimeout(t);
  }, [entries, bootDone]);

  // clear — тоже чистит сохранённый сеанс
  useEffect(() => {
    if (mode === 'ОЖИДАНИЕ' && entries.length === 0) sessionStore.clearSession();
  }, [entries.length, mode]);

  // дрон запускаем после бута — к тому времени пользователь уже кликнул
  useEffect(() => {
    if (bootDone && soundOn) {
      SFX.startDrone(characterId);
    }
  }, [bootDone, soundOn, characterId]);

  return (
    <Shell
      characterId={characterId}
      mode={mode}
      spreadCtx={mode === 'РАСКЛАД' || mode === 'ЧТЕНИЕ' ? spreadCtx : null}
      sessionHex={sessionHex}
      streak={session.streak}
      morningStreak={session.morningStreak}
      morningToday={morningToday}
      entries={entries}
      scrollTick={session.scrollTick}
      busy={busy}
      pendingQuestion={pendingQuestion !== null}
      pendingCards={
        pendingQuestion && !('followUp' in pendingQuestion) && !('arcana' in pendingQuestion)
          ? pendingQuestion.cards ?? 3
          : 3
      }
      bootDone={bootDone}
      soundOn={soundOn}
      onToggleSound={toggleSound}
      channelBusy={whispersActive > 0}
      pendingLabel={
        pendingQuestion && 'followUp' in pendingQuestion
          ? pendingQuestion.followUp.pair
            ? `«${pendingQuestion.followUp.cardName} + ${pendingQuestion.followUp.cardName2 ?? ''}»`
            : `«${pendingQuestion.followUp.cardName}»`
          : pendingQuestion && 'arcana' in pendingQuestion
            ? 'дата рождения (дд.мм.гггг)'
            : null
      }
      onBootDone={handleBootDone}
      onRunCmd={(cmd) => executeCommand(cmd)}
      onSubmitInput={handleSubmitInput}
      onCancelPending={handleCancelPending}
      onGuideSelect={handleGuideSelect}
      onFlip={handleFlip}
      onHistorySelect={handleHistorySelect}
      onAskCard={handleAskCard}
      onAskPair={handleAskPair}
      onExportScroll={handleExportScroll}
      onEcho={handleEcho}
      onEchoSelect={handleEchoSelect}
      onChronicle={handleChronicle}
      onAskAgain={handleAskAgain}
      onShare={handleShare}
      onToggleLibrary={(id, v) => updateEntry(id, { open: v })}
      guideReadings={guideReadings}
      dailyDone={dailyDone}
      themeId={themeId}
      onThemeSelect={applyTheme}
      onForecast={handleForecast}
      onRestoreSession={handleRestoreSession}
      onDiscardSession={handleDiscardSession}
    />
  );
}
