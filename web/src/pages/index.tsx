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
import * as SFX from '@/lib/sound';
import { randomHex, randomWhisper } from '@/lib/transcript';
import { useTarotSession } from '@/hooks/useTarotSession';
import { useSound } from '@/hooks/useSound';
import { useWhisper } from '@/hooks/useWhisper';
import { useHistory } from '@/hooks/useHistory';
import { useGuide } from '@/hooks/useGuide';
import { useSpread } from '@/hooks/useSpread';

type PendingQuestion = { cards: 1 | 3 } | null;

const MOON_PHASES = [
  'луна убывающая', 'луна растущая', 'новолуние близко', 'полнолуние вчера',
];

export default function Home() {
  const session = useTarotSession();
  const { soundOn, setSoundOn, toggleSound } = useSound();
  const whisper = useWhisper(session);
  const { runHistory, handleHistorySelect } = useHistory(session);
  const { runGuideSet } = useGuide(session);
  const { runDaily, runAsk, handleFlip } = useSpread(session, whisper);

  const {
    entries, setEntries, mode, setMode, busy, setBusy, busyRef, nidRef,
    characterId, setCharacterId, bootDone, setBootDone, sessionHex, setSessionHex,
    push, pushOut, pushCmd, echoCmd,
  } = session;
  const { whispersActive, clearWhispers } = whisper;

  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion>(null);
  const pendingRef = useRef<PendingQuestion>(null);
  const typeParamRef = useRef<string | null>(null);

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
      { text: '  taro ask [вопрос]       три карты · расклад собирается под вопрос' },
      { text: '  taro ask1 [вопрос]      одна карта · точечный ответ' },
      { text: '  taro catalog            виды раскладов' },
      { text: '  taro guides             сменить проводника' },
      { text: '  taro history            журнал сеансов (тап — развернуть)' },
      { text: '  taro sound              звук терминала вкл/выкл' },
      { text: '  clear                   очистить экран' },
      { text: '' },
      { text: 'ОПИСАНИЕ', tone: 'accent' },
      { text: '  78 арканов. три проводника. один канал.' },
      { text: '  позиции трёх карт подстраиваются под вопрос —' },
      { text: '  не всегда «прошлое-настоящее-будущее».' },
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
          clearWhispers();
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
  }, [echoCmd, push, pushOut, runAsk, runDaily, runGuideSet, runHistory, runHelp,
    toggleSound, clearWhispers, setEntries, nidRef, setMode, setBusy, busyRef]);

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

  // ── закрыть WebApp (paywall → вернуться в чат бота) ──
  const handleCloseApp = useCallback(() => {
    try {
      (window as any).Telegram?.WebApp?.close();
    } catch {}
  }, []);

  return (
    <Shell
      characterId={characterId}
      mode={mode}
      sessionHex={sessionHex}
      entries={entries}
      scrollTick={session.scrollTick}
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
      onHistorySelect={handleHistorySelect}
      onCloseApp={handleCloseApp}
    />
  );
}