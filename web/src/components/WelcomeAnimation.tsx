'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getGuide } from '@/lib/guides';
import GuideSigil from './GuideSigil';

interface WelcomeAnimationProps {
  onComplete: () => void;
  spreadType: string;
  characterId?: string;
}

// Строка ритуального входа
interface BootLine {
  timestamp: string;
  tag: 'ЛУНА' | 'ОЧАГ' | 'ИСКРА' | 'ТАЙНА' | 'ГОТОВО';
  text: string;
  id: number;
}

// Последовательности проводниц — тёплые, «живые»
const BOOT_SEQUENCES: Record<string, {
  tag: BootLine['tag'];
  lines: { tag: BootLine['tag']; text: string }[];
  ready: string;
}> = {
  shadow_walker: {
    tag: 'ЛУНА',
    lines: [
      { tag: 'ЛУНА', text: 'зажигаю свечи' },
      { tag: 'ТАЙНА', text: 'чаши наполняются водой' },
      { tag: 'ЛУНА', text: 'карты слышат тебя' },
    ],
    ready: 'луна готова ✦',
  },
  ruin_keeper: {
    tag: 'ОЧАГ',
    lines: [
      { tag: 'ОЧАГ', text: 'раздуваю огонь' },
      { tag: 'ТАЙНА', text: 'хлеб и соль на столе' },
      { tag: 'ОЧАГ', text: 'карты разложены' },
    ],
    ready: 'очаг горит ✦',
  },
  spark_of_chaos: {
    tag: 'ИСКРА',
    lines: [
      { tag: 'ИСКРА', text: 'чиркаю спичкой' },
      { tag: 'ТАЙНА', text: 'вишня в бокале, карты веером' },
      { tag: 'ИСКРА', text: 'ну-с, посмотрим' },
    ],
    ready: 'искра жива ✦',
  },
};

function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TYPE_SPEED = 18; // мс на символ — быстро и ритмично

export default function WelcomeAnimation({ onComplete, spreadType, characterId = 'shadow_walker' }: WelcomeAnimationProps) {
  const [lines, setLines] = useState<BootLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [showSigil, setShowSigil] = useState(false);
  const [typedLine, setTypedLine] = useState<{ lineId: number; text: string } | null>(null);
  const completedRef = useRef(false);
  const lineIdRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const guide = useMemo(() => getGuide(characterId), [characterId]);
  const boot = useMemo(() => BOOT_SEQUENCES[characterId] || BOOT_SEQUENCES.shadow_walker, [characterId]);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFading(true);
    setTimeout(onComplete, 350);
  }, [onComplete]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [lines, typedLine]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timeouts.push(setTimeout(fn, delay));
    };

    const typeLine = (line: BootLine, onDone: () => void, baseDelay: number) => {
      schedule(() => {
        setTypedLine({ lineId: line.id, text: '' });
      }, baseDelay);
      for (let i = 1; i <= line.text.length; i++) {
        schedule(() => {
          setTypedLine({ lineId: line.id, text: line.text.slice(0, i) });
        }, baseDelay + i * TYPE_SPEED);
      }
      schedule(() => {
        setLines((prev) => [...prev, line]);
        setTypedLine(null);
        onDone();
      }, baseDelay + line.text.length * TYPE_SPEED + 40);
    };

    // ── Первая строка: приглашение проводницы ──
    const firstLine: BootLine = {
      timestamp: now(),
      tag: boot.tag,
      text: `${guide.name} приветствует тебя`,
      id: lineIdRef.current++,
    };

    let cursor = 80;
    typeLine(firstLine, () => {}, cursor);
    cursor += firstLine.text.length * TYPE_SPEED + 160;

    // ── Сигил проявляется рано ──
    schedule(() => setShowSigil(true), 500);

    // ── Строки ритуала ──
    boot.lines.forEach((l) => {
      const line: BootLine = {
        timestamp: now(),
        tag: l.tag,
        text: l.text,
        id: lineIdRef.current++,
      };
      typeLine(line, () => {}, cursor);
      cursor += line.text.length * TYPE_SPEED + 120;
    });

    // ── Прогресс ──
    const progressLine: BootLine = {
      timestamp: now(),
      tag: 'ТАЙНА',
      text: 'прогресс',
      id: lineIdRef.current++,
    };
    schedule(() => {
      setLines((prev) => [...prev, progressLine]);
    }, cursor);
    cursor += 150;
    for (let p = 5; p <= 100; p += 5) {
      schedule(() => setProgress(p), cursor + p * 12);
    }
    cursor += 100 * 12 + 150;

    // ── Готовность ──
    const readyLine: BootLine = {
      timestamp: now(),
      tag: 'ГОТОВО',
      text: boot.ready,
      id: lineIdRef.current++,
    };
    typeLine(readyLine, () => {}, cursor);
    cursor += readyLine.text.length * TYPE_SPEED + 420;

    schedule(() => complete(), cursor);

    return () => timeouts.forEach(clearTimeout);
  }, [boot, guide.name, complete]);

  const renderLine = (line: BootLine) => {
    const tagColor = guide.accent;

    if (line.text === 'прогресс' && line.tag === 'ТАЙНА') {
      return (
        <div key={line.id} className="boot-log-line boot-log-progress flex items-center gap-2">
          <span className="boot-ts">[{line.timestamp}]</span>
          <span className="boot-tag" style={{ color: tagColor }}>[натрой]</span>
          <span className="progress-track flex-1 min-w-[90px] max-w-[160px]">
            <span className="progress-fill block" style={{ width: `${progress}%` }} />
          </span>
          <span className="boot-pct font-pixel text-[10px]">{progress}%</span>
        </div>
      );
    }

    return (
      <div key={line.id} className="boot-log-line">
        <span className="boot-ts">[{line.timestamp}]</span>{' '}
        <span className="boot-tag" style={{ color: tagColor }}>[{line.tag}]</span>{' '}
        <span className="boot-msg">{line.text}</span>
      </div>
    );
  };

  const renderTypedLine = () => {
    if (!typedLine) return null;
    let tag: BootLine['tag'] = boot.tag;
    let text = typedLine.text;
    let ts = now();

    if (typedLine.lineId === 0) {
      tag = boot.tag;
    } else {
      const idx = typedLine.lineId - 1;
      if (idx < boot.lines.length) {
        tag = boot.lines[idx].tag;
      }
    }

    return (
      <div className="boot-log-line boot-typing">
        <span className="boot-ts">[{ts}]</span>{' '}
        <span className="boot-tag" style={{ color: guide.accent }}>[{tag}]</span>{' '}
        <span className="boot-msg">
          {text}
          <span className="boot-cursor">▌</span>
        </span>
      </div>
    );
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-start w-full min-h-full transition-opacity duration-300 overflow-hidden ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{
        '--guide-accent': guide.accent,
        '--guide-accent-deep': guide.accentDeep,
      } as React.CSSProperties}
    >
      {/* ── Сигил проводницы — проявляется в центре ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${showSigil ? 1 : 0.72})`,
          opacity: showSigil ? 0.55 : 0,
          transition: 'opacity 1s ease-out, transform 1.3s ease-out',
          width: 'min(88vw, 88vh, 440px)',
          height: 'min(88vw, 88vh, 440px)',
        }}
        aria-hidden="true"
      >
        <GuideSigil guideId={characterId} />
      </div>

      {/* ── Заголовок бренда ── */}
      <div className="relative z-30 pt-5 pb-3 text-center px-4">
        <div className="welcome-title font-serif text-[34px] font-semibold text-[color:var(--ink)] leading-none">
          Amo Tarot
        </div>
        <div className="font-pixel text-[9px] tracking-[0.3em] uppercase mt-2" style={{ color: guide.accent }}>
          ✦ {guide.subtitle} ✦
        </div>
      </div>

      {/* ── Ритуальный лог ── */}
      <div
        ref={logContainerRef}
        className="relative z-30 w-full flex-1 min-h-0 overflow-y-auto px-4 pb-3"
        style={{ scrollbarWidth: 'none' }}
      >
        {lines.map(renderLine)}
        {renderTypedLine()}
      </div>
    </div>
  );
}
