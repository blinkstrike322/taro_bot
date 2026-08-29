'use client';

// ─────────────────────────────────────────────────────────────
// ARCANUM shell v3 — весь флоу приложения живёт в терминале.
// Оркестратор: журнал записей + парсер команд + API + режимы.
// Нет модалок. Нет экранов. Только транскрипт.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import Shell, { ShellMode } from '@/components/shell/Shell';
import { parseCommand } from '@/lib/commands';
import * as API from '@/lib/api';
import { getGuide } from '@/lib/guides';
import * as SFX from '@/lib/sound';
import {
  Entry, OutLine, HistoryRow, randomWhisper, randomHex, sleep,
} from '@/lib/transcript';
import type { Interpretation } from '@/lib/api';
import { typeDuration } from '@/components/shell/Typewriter';

type PendingQuestion = { cards: 1 | 3 } | null;

const MOON_PHASES = [
  'луна убывающая', 'луна растущая', 'новолуние близко', 'полнолуние вчера',
];

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([{ id: 0, kind: 'boot' }]);
  const [bootDone, setBootDone] = useState(false);
  const [characterId, setCharacterId] = useState('shadow_walker');
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion>(null);
  const [mode, setMode] = useState<ShellMode>('БУТ');
  const [sessionHex, setSessionHex] = useState('');
  const [scrollTick, setScrollTick] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  /** сколько шёпотов сейчас формируется в канале (для индикатора статус-лайна) */
  const [whispersActive, setWhispersActive] = useState(0);

  const nidRef = useRef(1);
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingQuestion>(null);
  const typeParamRef = useRef<string | null>(null);
  /** entryId → промис доставленного шёпота (параллельный канал) */
  const whisperJobsRef = useRef<Map<number, Promise<Interpretation>>>(new Map());

  // ── инициализация ──
  useEffect(() => {
    setSessionHex(randomHex(4));

    const params = new URLSearchParams(window.location.search);
    typeParamRef.current = params.get('type');

    try {
      const stored = localStorage.getItem('taro_character');
      if (stored) setCharacterId(stored);
    } catch {}

    setSoundOn(SFX.loadSoundPref());

    API.getCharacter().then((serverId) => {
      if (serverId) {
        setCharacterId(serverId);
        try { localStorage.setItem('taro_character', serverId); } catch {}
      }
    });
  }, []);

  // ── помощники журнала ──
  const push = useCallback((partial: Omit<Entry, 'id'> & Record<string, unknown>) => {
    const id = nidRef.current++;
    setEntries((prev) => [...prev, { ...(partial as object), id } as Entry]);
    setScrollTick((t) => t + 1);
    return id;
  }, []);

  const pushOut = useCallback((lines: OutLine[], stagger = false) => {
    push({ kind: 'out', lines, stagger });
  }, []);

  const pushCmd = useCallback((text: string) => {
    push({ kind: 'cmd', text });
  }, []);

  // ── звук терминала: вкл/выкл с памятью ──
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      SFX.setSoundEnabled(next);
      SFX.saveSoundPref(next);
      if (next) SFX.sEnter();
      return next;
    });
  }, []);

  const updateEntry = useCallback((id: number, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as Entry) : e)));
    setScrollTick((t) => t + 1);
  }, []);

  // ── эхо команды с печатью посимвольно ──
  const echoCmd = useCallback(async (text: string) => {
    pushCmd(text);
    await sleep(typeDuration(text, 18));
  }, [pushCmd]);

  // ── прогресс + параллельный запрос ──
  const progressWith = useCallback(async <T,>(label: string, durMs: number, job: Promise<T>): Promise<T> => {
    push({ kind: 'progress', label, durMs });
    setMode('ТАСОВАНИЕ');
    const [res] = await Promise.all([job, sleep(durMs + 120)]);
    return res;
  }, [push]);

  const toTarotCards = (cards: API.TarotCardData[]): API.TarotCardData[] =>
    cards.map((c) => ({ ...c, image_url: `/cards/${c.id}.png` }));

  // ── параллельный шёпот: ЛЛМ работает, пока оператор вскрывает карты ──
  const startWhisper = useCallback((entryId: number, token: string) => {
    setWhispersActive((n) => n + 1);
    const job = API.pollInterpretation(token)
      .then((interp) => {
        updateEntry(entryId, { interpretation: interp, whisperReady: true });
        SFX.sWhisper(); // тихий сигнал: шёпот доставлен
        return interp;
      })
      .finally(() => setWhispersActive((n) => n - 1));
    whisperJobsRef.current.set(entryId, job);
    // если оператор так и не вскроет карты — ошибка не должна остаться необработанной
    job.catch(() => {});
  }, [updateEntry]);

  // дождаться шёпота к моменту вскрытия: если канал ещё думает — рыщущий бар
  const resolveWhisper = useCallback(async (
    entryId: number,
    cached: Interpretation | null,
  ): Promise<Interpretation | null> => {
    if (cached) {
      whisperJobsRef.current.delete(entryId);
      return cached;
    }
    const job = whisperJobsRef.current.get(entryId);
    if (!job) return null;
    const pendingId = push({ kind: 'pending', label: 'расшифровка шёпота' });
    setMode('ЧТЕНИЕ');
    try {
      const interp = await job;
      setEntries((prev) => prev.filter((e) => e.id !== pendingId));
      setScrollTick((t) => t + 1);
      whisperJobsRef.current.delete(entryId);
      return interp;
    } catch (err: any) {
      setEntries((prev) => prev.filter((e) => e.id !== pendingId));
      setScrollTick((t) => t + 1);
      SFX.sError();
      push({ kind: 'error', msg: err?.message || 'шёпот не вернулся' });
      setMode('ОЖИДАНИЕ');
      return null;
    }
  }, [push]);

  // ── флоу: карта дня ──
  const runDaily = useCallback(async () => {
    setBusy(true); busyRef.current = true;
    try {
      const res = await progressWith('тасование колоды', 950, API.spreadBegin(1, null, characterId));
      pushOut([
        { text: 'карта выбрана. коснись, чтобы вскрыть.', tone: 'dim' },
      ]);
      const entryId = push({
        kind: 'daily',
        card: toTarotCards(res.cards)[0],
        flipped: false,
        interpretation: null,
      });
      setMode('РАСКЛАД');
      startWhisper(entryId, res.token);
    } catch (err: any) {
      SFX.sError();
      push({ kind: 'error', msg: err?.message || 'канал недоступен' });
      setMode('ОЖИДАНИЕ');
    } finally {
      setBusy(false); busyRef.current = false;
    }
  }, [characterId, progressWith, push, pushOut, startWhisper]);

  // ── флоу: расклад с вопросом ──
  const runAsk = useCallback(async (cards: 1 | 3, question: string | null) => {
    setBusy(true); busyRef.current = true;
    setMode('ТАСОВАНИЕ');
    try {
      const cmdQuestion = question ? ` "${question}"` : '';
      const cmdCards = cards === 1 ? ' --cards 1' : '';
      await echoCmd(`taro ask${cmdQuestion}${cmdCards}`);
      if (question) {
        pushOut([{ text: 'вопрос принят · канал стабилен', tone: 'info' }]);
      }
      const res = await progressWith('тасование колоды', 1100, API.spreadBegin(cards, question, characterId));
      pushOut([
        {
          text: cards === 3
            ? 'раздача: 3 аркана · прошлое · настоящее · будущее'
            : 'раздача: 1 аркан',
          tone: 'dim',
        },
      ]);
      const spreadCards = toTarotCards(res.cards);
      const entryId = push({
        kind: 'spread',
        cards: spreadCards,
        flipped: spreadCards.map(() => false),
        question,
        interpretation: null,
        spreadLabel: cards === 3 ? 'три карты' : 'одна карта',
        count: cards,
      });
      setMode('РАСКЛАД');
      startWhisper(entryId, res.token);
    } catch (err: any) {
      SFX.sError();
      push({ kind: 'error', msg: err?.message || 'канал недоступен' });
      setMode('ОЖИДАНИЕ');
    } finally {
      setBusy(false); busyRef.current = false;
    }
  }, [characterId, echoCmd, progressWith, push, pushOut, startWhisper]);

  // ── флоу: журнал сеансов ──
  const runHistory = useCallback(async () => {
    setBusy(true); busyRef.current = true;
    setMode('ЖУРНАЛ');
    try {
      pushOut([{ text: 'чтение журнала ~/сеансы.log …', tone: 'dim' }]);
      const now = new Date();
      const res = await API.getReadings(now.getFullYear(), now.getMonth() + 1);
      const rows: HistoryRow[] = (res.readings || []).map((r) => ({
        id: r.id,
        type: r.type,
        question: r.question,
        created_at: r.created_at,
      }));
      push({ kind: 'history', rows });
    } catch {
      push({ kind: 'history', rows: [] });
    } finally {
      setBusy(false); busyRef.current = false;
      setMode('ОЖИДАНИЕ');
    }
  }, [push, pushOut]);

  // ── смена проводника ──
  const runGuideSet = useCallback(async (id: string) => {
    const guide = getGuide(id);
    await echoCmd(`taro guide ${id}`);
    setCharacterId(id);
    try { localStorage.setItem('taro_character', id); } catch {}
    SFX.sWhisper();
    push({ kind: 'ok', msg: `проводник сменён: ${guide.name} · ${guide.tag}` });
    pushOut([
      { text: `«${guide.greeting}»`, tone: 'comment' },
      { text: randomWhisper(), tone: 'comment' },
    ]);
  }, [echoCmd, push, pushOut]);

  // ── пасхалки ──
  const runEasterEgg = useCallback(async (kind: string, rest?: string) => {
    switch (kind) {
      case 'whoami':
        pushOut([{ text: 'оператор (uid=1000 gid=13 группы=тени,луна)', tone: 'plain' }]);
        break;
      case 'uname':
        pushOut([{ text: 'ARCANUM 3.0.0-луна #1 SMP PREEMPT occult/x86_64 terminal', tone: 'plain' }]);
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
        pushOut([{
          text: 'колода/  проводники/  сеансы.log  README.оккульт  .шёпот',
          tone: 'plain',
        }]);
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
        } else if (t.includes('шёпот')) {
          pushOut([{ text: randomWhisper(), tone: 'comment' }]);
        } else if (t.includes('сеансы') || t.includes('log')) {
          pushOut([{ text: 'подсказка: taro history — живой журнал сеансов', tone: 'dim' }]);
        } else {
          pushOut([{ text: `cat: ${t || '?'}: нет такого файла`, tone: 'err' }]);
        }
        break;
      }
    }
  }, [pushOut]);

  // ── справка (man) ──
  const runHelp = useCallback(async () => {
    pushOut([
      { text: 'ARCANUM(1)                 справка оккультного терминала', tone: 'bright' },
      { text: '' },
      { text: 'СИНТАКСИС', tone: 'accent' },
      { text: '  taro daily              карта дня без вопроса' },
      { text: '  taro ask [вопрос]       три карты · прошлое-настоящее-будущее' },
      { text: '  taro ask1 [вопрос]      одна карта · точечный ответ' },
      { text: '  taro catalog            виды раскладов' },
      { text: '  taro guides             сменить проводника' },
      { text: '  taro history            журнал сеансов' },
      { text: '  taro sound              звук терминала вкл/выкл' },
      { text: '  clear                   очистить экран' },
      { text: '' },
      { text: 'ОПИСАНИЕ', tone: 'accent' },
      { text: '  78 арканов. три проводника. один канал.' },
      { text: '  каждая сессия шифруется шёпотом луны.' },
      { text: '' },
      { text: 'СОВЕТ', tone: 'accent' },
      { text: '  вопрос можно ввести сразу после команды:' },
      { text: '  taro ask стоит ли открывать своё дело', tone: 'dim' },
      { text: '' },
      { text: 'ФАЙЛЫ', tone: 'accent' },
      { text: '  README.оккульт · .шёпот · сеансы.log', tone: 'faint' },
    ], true);
  }, [pushOut]);

  // ── диспетчер команд ──
  const executeCommand = useCallback(async (rawInput: string) => {
    if (busyRef.current) return;
    const parsed = parseCommand(rawInput);
    if (!parsed) return;

    if (parsed.kind === 'comment') {
      pushOut([{ text: rawInput.trim(), tone: 'comment' }]);
      return;
    }

    setBusy(true); busyRef.current = true;
    try {
      switch (parsed.kind) {
        case 'daily':
          await echoCmd('taro daily');
          setBusy(false); busyRef.current = false;
          await runDaily();
          return;

        case 'ask': {
          if (parsed.question == null) {
            await echoCmd(`taro ask${parsed.cards === 1 ? ' --cards 1' : ''}`);
            pushOut([
              { text: 'режим вопроса активирован', tone: 'info' },
            ]);
            setPendingQuestion({ cards: parsed.cards });
            pendingRef.current = { cards: parsed.cards };
            setMode('ВОПРОС');
          } else {
            setBusy(false); busyRef.current = false;
            await runAsk(parsed.cards, parsed.question);
          }
          return;
        }

        case 'catalog':
          await echoCmd('taro catalog');
          push({ kind: 'menu', menuId: 'catalog' });
          setMode('МЕНЮ');
          return;

        case 'guides':
          await echoCmd('taro guides');
          push({ kind: 'menu', menuId: 'guides' });
          setMode('МЕНЮ');
          return;

        case 'guide-set':
          setBusy(false); busyRef.current = false;
          await runGuideSet(parsed.id);
          return;

        case 'history':
          await echoCmd('taro history');
          setBusy(false); busyRef.current = false;
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
          whisperJobsRef.current.clear();
          setWhispersActive(0);
          setEntries([]);
          nidRef.current = 1;
          pushOut([
            { text: 'экран очищен · help — справка', tone: 'faint' },
          ]);
          setMode('ОЖИДАНИЕ');
          return;

        case 'whoami': case 'uname': case 'date': case 'pwd': case 'ls':
        case 'sudo': case 'cat': case 'exit':
          await echoCmd(rawInput.trim());
          await runEasterEgg(parsed.kind, (parsed as any).rest ?? (parsed as any).target);
          setMode('ОЖИДАНИЕ');
          return;

        case 'unknown':
        default: {
          await echoCmd(rawInput.trim());
          pushOut([
            { text: `bash: ${(parsed as any).cmd ?? ''}: команда не найдена`, tone: 'err' },
            { text: "попробуй 'help' или 'taro' без аргументов", tone: 'dim' },
          ]);
          setMode('ОЖИДАНИЕ');
          return;
        }
      }
    } finally {
      setBusy(false); busyRef.current = false;
    }
  }, [echoCmd, push, pushOut, runAsk, runDaily, runGuideSet, runHistory, runHelp]);

  // ── ввод из командной строки ──
  const handleSubmitInput = useCallback(async (value: string) => {
    const v = value.trim();

    // режим вопроса: любая строка = ответ
    if (pendingRef.current) {
      const { cards } = pendingRef.current;
      setPendingQuestion(null);
      pendingRef.current = null;
      const q = v.length ? v : null;
      await runAsk(cards, q);
      return;
    }

    await executeCommand(v);
  }, [executeCommand, runAsk]);

  const handleCancelPending = useCallback(() => {
    setPendingQuestion(null);
    pendingRef.current = null;
    pushOut([
      { text: '^C', tone: 'err' },
      { text: 'вопрос отменён · канал свободен', tone: 'dim' },
    ]);
    setMode('ОЖИДАНИЕ');
  }, [pushOut]);

  // ── переворот карт ──
  const handleFlip = useCallback((entryId: number, index: number) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (!entry) return prev;

      if (entry.kind === 'daily' && !entry.flipped) {
        // переворот карты дня → печатаем чтение (шёпот уже должен быть готов)
        setTimeout(() => {
          (async () => {
            const interp = await resolveWhisper(entryId, entry.interpretation);
            if (!interp) return;
            push({ kind: 'json', interpretation: interp, cards: [entry.card], question: null, spreadLabel: 'карта дня' });
            pushOut([{ text: randomWhisper(), tone: 'comment' }]);
            setMode('ОЖИДАНИЕ');
          })();
        }, 950);
        return prev.map((e) => (e.id === entryId ? ({ ...e, flipped: true } as Entry) : e));
      }

      if (entry.kind === 'spread') {
        if (entry.flipped[index]) return prev;
        const flipped = [...entry.flipped];
        flipped[index] = true;
        const allFlipped = flipped.every(Boolean);
        if (allFlipped) {
          setTimeout(() => {
            (async () => {
              const interp = await resolveWhisper(entryId, entry.interpretation);
              if (!interp) return;
              await echoCmd('taro read --json');
              push({ kind: 'json', interpretation: interp, cards: entry.cards, question: entry.question, spreadLabel: entry.spreadLabel });
              pushOut([{ text: randomWhisper(), tone: 'comment' }]);
              setMode('ОЖИДАНИЕ');
            })();
          }, 950);
        }
        return prev.map((e) => (e.id === entryId ? ({ ...e, flipped } as Entry) : e));
      }

      return prev;
    });
    setScrollTick((t) => t + 1);
  }, [echoCmd, push, pushOut, resolveWhisper]);

  // ── выбор проводника из меню ──
  const handleGuideSelect = useCallback((id: string) => {
    if (busyRef.current) return;
    (async () => {
      await runGuideSet(id);
      setMode('ОЖИДАНИЕ');
    })();
  }, [runGuideSet]);

  // ── конец загрузки ──
  const handleBootDone = useCallback(() => {
    if (bootDone) return;
    setBootDone(true);

    const t = typeParamRef.current;
    if (t === '1' || t === '3') {
      (async () => {
        await echoCmd(`taro ask${t === '1' ? ' --cards 1' : ''}`);
        pushOut([{ text: 'режим вопроса активирован', tone: 'info' }]);
        setPendingQuestion({ cards: t === '1' ? 1 : 3 });
        pendingRef.current = { cards: t === '1' ? 1 : 3 };
        setMode('ВОПРОС');
      })();
      return;
    }
    if (t === 'daily') {
      (async () => { await executeCommand('taro daily'); })();
      return;
    }
    pushCmd('taro --motd');
    push({ kind: 'motd' });
    setMode('ОЖИДАНИЕ');
  }, [bootDone, echoCmd, executeCommand, push, pushCmd, pushOut]);

  return (
    <Shell
      characterId={characterId}
      mode={mode}
      sessionHex={sessionHex}
      entries={entries}
      scrollTick={scrollTick}
      busy={busy}
      pendingQuestion={pendingQuestion !== null}
      pendingCards={pendingQuestion?.cards ?? 3}
      bootDone={bootDone}
      soundOn={soundOn}
      onToggleSound={toggleSound}
      channelBusy={whispersActive > 0}
      onBootDone={handleBootDone}
      onRunCmd={(cmd) => executeCommand(cmd)}
      onSubmitInput={handleSubmitInput}
      onCancelPending={handleCancelPending}
      onGuideSelect={handleGuideSelect}
      onFlip={handleFlip}
    />
  );
}
