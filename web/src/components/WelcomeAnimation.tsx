'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getGuide } from '@/lib/guides';
import PixelFlower from './PixelFlower';

interface WelcomeAnimationProps {
  onComplete: () => void;
  spreadType: string;
  characterId?: string;
}

// Строка ритуального входа
interface BootLine {
  timestamp: string;
  tag: string;
  text: string;
  id: number;
}

// Последовательности проводниц
const BOOT_SEQUENCES: Record<string, {
  tag: string;
  lines: { tag: string; text: string }[];
  ready: string;
}> = {
  shadow_walker: {
    tag: 'луна',
    lines: [
      { tag: 'луна', text: 'зажигаю свечи' },
      { tag: 'тайна', text: 'чаши наполняются водой' },
      { tag: 'луна', text: 'карты слышат тебя' },
    ],
    ready: 'луна готова',
  },
  ruin_keeper: {
    tag: 'очаг',
    lines: [
      { tag: 'очаг', text: 'раздуваю огонь' },
      { tag: 'тайна', text: 'хлеб и соль на столе' },
      { tag: 'очаг', text: 'карты разложены' },
    ],
    ready: 'очаг горит',
  },
  spark_of_chaos: {
    tag: 'искра',
    lines: [
      { tag: 'искра', text: 'чиркаю спичкой' },
      { tag: 'тайна', text: 'вишня в бокале, карты веером' },
      { tag: 'искра', text: 'ну-с, посмотрим' },
    ],
    ready: 'искра жива',
  },
};

function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TYPE_SPEED = 16; // мс на символ

export default function WelcomeAnimation({ onComplete, spreadType, characterId = 'shadow_walker' }: WelcomeAnimationProps) {
  const [lines, setLines] = useState<BootLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [showSigil, setShowSigil] = useState(false);
  const [typedLine, setTypedLine] = useState<{ lineId: number; text: string } | null>(null);
  const completedRef = useRef(false);
  const lineIdRef = useRef(0);

  const guide = useMemo(() => getGuide(characterId), [characterId]);
  const boot = useMemo(() => BOOT_SEQUENCES[characterId] || BOOT_SEQUENCES.shadow_walker, [characterId]);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFading(true);
    setTimeout(onComplete, 320);
  }, [onComplete]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timeouts.push(setTimeout(fn, delay));
    };

    const typeLine = (line: BootLine, baseDelay: number) => {
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
      }, baseDelay + line.text.length * TYPE_SPEED + 40);
    };

    let cursor = 260;

    // ── Первая строка: приглашение проводницы ──
    const firstLine: BootLine = {
      timestamp: now(),
      tag: boot.tag,
      text: `${guide.name.toLowerCase()} приветствует тебя`,
      id: lineIdRef.current++,
    };
    typeLine(firstLine, cursor);
    cursor += firstLine.text.length * TYPE_SPEED + 140;

    // ── Сигил проявляется рано ──
    schedule(() => setShowSigil(true), 420);

    // ── Строки ритуала ──
    boot.lines.forEach((l) => {
      const line: BootLine = {
        timestamp: now(),
        tag: l.tag,
        text: l.text,
        id: lineIdRef.current++,
      };
      typeLine(line, cursor);
      cursor += line.text.length * TYPE_SPEED + 110;
    });

    // ── Прогресс ──
    const progressLine: BootLine = {
      timestamp: now(),
      tag: 'тайна',
      text: 'прогресс',
      id: lineIdRef.current++,
    };
    schedule(() => {
      setLines((prev) => [...prev, progressLine]);
    }, cursor);
    cursor += 140;
    for (let p = 5; p <= 100; p += 5) {
      schedule(() => setProgress(p), cursor + p * 11);
    }
    cursor += 100 * 11 + 140;

    // ── Готовность ──
    const readyLine: BootLine = {
      timestamp: now(),
      tag: 'готово',
      text: boot.ready,
      id: lineIdRef.current++,
    };
    typeLine(readyLine, cursor);
    cursor += readyLine.text.length * TYPE_SPEED + 380;

    schedule(() => complete(), cursor);

    return () => timeouts.forEach(clearTimeout);
  }, [boot, guide.name, complete]);

  const renderLine = (line: BootLine) => {
    if (line.text === 'прогресс') {
      return (
        <div key={line.id} className="boot-log-line boot-log-progress flex items-center gap-2.5">
          <span className="boot-tag" style={{ color: guide.accent }}>[натрой]</span>
          <span className="progress-track flex-1 min-w-[100px] max-w-[180px]">
            <span className="progress-fill block" style={{ width: `${progress}%` }} />
          </span>
          <span className="boot-pct">{progress}%</span>
        </div>
      );
    }

    return (
      <div key={line.id} className="boot-log-line">
        <span className="boot-ts">[{line.timestamp}]</span>{' '}
        <span className="boot-tag" style={{ color: guide.accent }}>[{line.tag}]</span>{' '}
        <span className="boot-msg">{line.text}</span>
      </div>
    );
  };

  const renderTypedLine = () => {
    if (!typedLine) return null;
    let tag = boot.tag;
    if (typedLine.lineId > 0) {
      const idx = typedLine.lineId - 1;
      if (idx < boot.lines.length) tag = boot.lines[idx].tag;
    }

    return (
      <div className="boot-log-line boot-typing">
        <span className="boot-ts">[{now()}]</span>{' '}
        <span className="boot-tag" style={{ color: guide.accent }}>[{tag}]</span>{' '}
        <span className="boot-msg">
          {typedLine.text}
          <span className="boot-cursor">▌</span>
        </span>
      </div>
    );
  };

  return (
    <div
      className={`relative flex flex-col w-full min-h-full overflow-hidden transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{
        '--guide-accent': guide.accent,
        '--guide-accent-deep': guide.accentDeep,
      } as React.CSSProperties}
    >
      {/* ── ирис-схема: прорастает слева-снизу, наполовину за экраном ── */}
      <div
        className="absolute pointer-events-none z-0"
        style={{ bottom: '-20%', left: '-26%', width: '72vmin' }}
        aria-hidden="true"
      >
        <PixelFlower
          seed={5}
          size={680}
          color={guide.accent}
          bgColor="var(--paper)"
          opacity={0.24}
        />
      </div>

      {/* ─– второй, справа-сверху, растворяется в фоне ── */}
      <div
        className="absolute pointer-events-none z-0"
        style={{ top: '-12%', right: '-28%', width: '56vmin' }}
        aria-hidden="true"
      >
        <PixelFlower
          seed={42}
          size={560}
          color={guide.accent}
          accentColor="var(--accent-violet)"
          opacity={0.12}
        />
      </div>

      {/* ── ГЕРОЙ: огромная строчная типографика, асимметрия ── */}
      <div className="relative z-30 px-6 pt-8">
        <h1 className="display-hero welcome-title">
          arcanum
          <span style={{ color: guide.accentDeep }}>.ocv</span>
        </h1>
        <div
          className="tech-label mt-3 inline-block"
          style={{ transform: 'rotate(-1.6deg)', color: guide.accentDeep }}
        >
          ✦ {guide.subtitle} · digital tarot ✦
        </div>
      </div>

      {/* ── ритуальный лог — внизу, как техническая колонка ── */}
      <div className="relative z-30 mt-auto px-6 pb-6">
        <div className="rule-h mb-3" style={{ opacity: 0.5 }} />
        {lines.map(renderLine)}
        {renderTypedLine()}
      </div>
    </div>
  );
}
