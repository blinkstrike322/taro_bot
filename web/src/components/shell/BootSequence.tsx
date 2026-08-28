'use client';

// BootSequence — холодный старт ARCANUM: BIOS-лог, systemd-теги,
// логин оператора. Тап — пропуск анимации.
import { useEffect, useRef, useState } from 'react';
import { getGuide } from '@/lib/guides';
import { randomHex } from '@/lib/transcript';

interface BootSequenceProps {
  characterId: string;
  onDone: () => void;
}

interface BootLine {
  tag: 'ok' | 'warn' | null;
  text: string;
  tone: 'dim' | 'accent';
  delayMs: number;
}

function buildLines(guideTag: string, sessionHex: string): BootLine[] {
  return [
    { tag: null, text: 'ARCANUM BIOS 3.31 — холодный старт', tone: 'dim', delayMs: 140 },
    { tag: 'ok', text: 'память теней · 64K', tone: 'dim', delayMs: 110 },
    { tag: 'ok', text: '/dev/луна смонтирована (убывающая)', tone: 'dim', delayMs: 130 },
    { tag: 'ok', text: 'колода инициализирована: 78 арканов', tone: 'dim', delayMs: 110 },
    { tag: 'ok', text: `тасование: фишер-йейтс · зерно 0x${randomHex(6)}`, tone: 'dim', delayMs: 140 },
    { tag: 'warn', text: 'прокси сна: задержка 0.3с — терпимо', tone: 'dim', delayMs: 150 },
    { tag: 'ok', text: `проводник подключён: ${guideTag}`, tone: 'dim', delayMs: 120 },
    { tag: 'ok', text: 'телеметрия: отключена · координаты скрыты', tone: 'dim', delayMs: 130 },
    { tag: null, text: '', tone: 'dim', delayMs: 90 },
    { tag: null, text: 'shadow@taro login: оператор', tone: 'accent', delayMs: 260 },
    { tag: null, text: `последний вход: сегодня · tty1 · сеанс #${sessionHex}`, tone: 'dim', delayMs: 240 },
  ];
}

export default function BootSequence({ characterId, onDone }: BootSequenceProps) {
  const guide = getGuide(characterId);
  const [sessionHex] = useState(() => randomHex(4));
  const linesRef = useRef<BootLine[]>(buildLines(guide.tag, sessionHex));
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    timersRef.current.forEach(clearTimeout);
    setShown(linesRef.current.length);
    setTimeout(onDone, 180);
  };

  useEffect(() => {
    let acc = 0;
    linesRef.current.forEach((_, i) => {
      acc += linesRef.current[i].delayMs;
      timersRef.current.push(setTimeout(() => setShown(i + 1), acc));
    });
    timersRef.current.push(setTimeout(finish, acc + 350));
    return () => timersRef.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="boot-block"
      onClick={finish}
      role="button"
      aria-label="пропустить загрузку"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') finish(); }}
    >
      {linesRef.current.slice(0, shown).map((l, i) => (
        <div key={i} className={`tl tl-${l.tone} boot-line`}>
          {l.tag === 'ok' && <span className="sd-tag sd-ok">[  OK  ]</span>}
          {l.tag === 'warn' && <span className="sd-tag sd-warn">[ WARN ]</span>}
          {l.text}
        </div>
      ))}
      {shown < linesRef.current.length && (
        <>
          <div className="tl tl-dim"><span className="blink">▊</span></div>
          <div className="boot-skip tl tl-faint">// тап — пропустить загрузку</div>
        </>
      )}
    </div>
  );
}
