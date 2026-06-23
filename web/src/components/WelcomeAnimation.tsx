'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getGuide } from '@/lib/guides';
import GuideSigil from './GuideSigil';

interface WelcomeAnimationProps {
  onComplete: () => void;
  spreadType: string;
  characterId?: string;
}

// Boot log line — structured for colored rendering
interface BootLine {
  timestamp: string;
  tag: 'BOOT' | 'INFO' | 'OK' | 'WARN' | 'SYS';
  text: string;
  id: number;
}

// Per-guide boot sequences
const BOOT_SEQUENCES: Record<string, {
  header: string;
  lines: { tag: 'INFO' | 'OK' | 'WARN'; text: string }[];
  ready: string;
  modeLabel: string;
  summoned: string;
}> = {
  shadow_walker: {
    header: 'OCGV_V1.0 / shadow@taro',
    lines: [
      { tag: 'INFO', text: 'пробуждение теней' },
      { tag: 'INFO', text: 'калибровка лунного света' },
      { tag: 'OK',   text: 'шёпот леса услышан' },
      { tag: 'INFO', text: 'manifest arcana modules' },
      { tag: 'WARN', text: 'туман плотный, видимость 30%' },
      { tag: 'OK',   text: 'shdw.wlkr* призван' },
    ],
    ready: '✦ ТЕНИ ГОТОВЫ ✦',
    modeLabel: 'SHADOW MODE',
    summoned: 'shdw.wlkr*',
  },
  ruin_keeper: {
    header: 'OCGV_V1.0 / ruin@taro',
    lines: [
      { tag: 'INFO', text: 'очистка пыли веков' },
      { tag: 'INFO', text: 'пробуждение камня' },
      { tag: 'OK',   text: 'руны дешифрованы' },
      { tag: 'INFO', text: 'manifest arcana modules' },
      { tag: 'WARN', text: 'две колонны разрушены сверх меры' },
      { tag: 'OK',   text: 'ruin.kpr* призван' },
    ],
    ready: '✦ КАМЕНЬ ПОМНИТ ✦',
    modeLabel: 'RUIN MODE',
    summoned: 'ruin.kpr*',
  },
  spark_of_chaos: {
    header: 'OCGV_V1.0 / chaos@taro',
    lines: [
      { tag: 'INFO', text: 'искра зажжена' },
      { tag: 'INFO', text: 'chaos engine warming' },
      { tag: 'OK',   text: 'реальность расфокусирована' },
      { tag: 'WARN', text: 'entropy spike detected' },
      { tag: 'INFO', text: 'manifest arcana modules' },
      { tag: 'OK',   text: 'sprk.chs* призван' },
    ],
    ready: '✦ ИСКРА ЖИВА ✦',
    modeLabel: 'CHAOS MODE',
    summoned: 'sprk.chs*',
  },
};

// Format current time as HH:MM:SS
function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// All tags use guide.accent color (per-guide identity)

export default function WelcomeAnimation({ onComplete, spreadType, characterId = 'shadow_walker' }: WelcomeAnimationProps) {
  const [lines, setLines] = useState<BootLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [showSigil, setShowSigil] = useState(false);
  const [showScanlines, setShowScanlines] = useState(false);
  const [typedLine, setTypedLine] = useState<{ lineId: number; text: string } | null>(null);
  const completedRef = useRef(false);
  const lineIdRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const guide = useMemo(() => getGuide(characterId), [characterId]);
  const boot = useMemo(() => BOOT_SEQUENCES[characterId] || BOOT_SEQUENCES.shadow_walker, [characterId]);
  const isChaos = characterId === 'spark_of_chaos';

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFading(true);
    setTimeout(onComplete, 400);
  }, [onComplete]);

  // Auto-scroll log container to bottom when new lines appear
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

    // Typewriter for a single line — prints text char by char
    const typeLine = (line: BootLine, onDone: () => void, baseDelay: number, speed: number = 28) => {
      // Commit an empty placeholder so the line shows up with cursor
      schedule(() => {
        setTypedLine({ lineId: line.id, text: '' });
      }, baseDelay);

      // Print chars one by one
      for (let i = 1; i <= line.text.length; i++) {
        schedule(() => {
          setTypedLine({ lineId: line.id, text: line.text.slice(0, i) });
        }, baseDelay + i * speed);
      }

      // Finalize: commit to lines[], clear typedLine
      schedule(() => {
        setLines(prev => [...prev, line]);
        setTypedLine(null);
        onDone();
      }, baseDelay + line.text.length * speed + 60);
    };

    // ── Header line ──
    const headerLine: BootLine = {
      timestamp: now(),
      tag: 'BOOT',
      text: boot.header,
      id: lineIdRef.current++,
    };

    let cursor = 100;

    typeLine(headerLine, () => {}, cursor);
    cursor += headerLine.text.length * 28 + 200;

    // ── Sigil materializes early — right after header, parallel to body lines ──
    schedule(() => setShowSigil(true), 800);

    // ── Body lines ──
    boot.lines.forEach((l, i) => {
      const line: BootLine = {
        timestamp: now(),
        tag: l.tag,
        text: l.text,
        id: lineIdRef.current++,
      };
      typeLine(line, () => {}, cursor);
      cursor += line.text.length * 28 + 180;
    });

    // ── Progress bar (SYS line, smoothly animated) ──
    const progressLine: BootLine = {
      timestamp: now(),
      tag: 'SYS',
      text: 'manifest',
      id: lineIdRef.current++,
    };
    // Show the progress line container first (no text typed — it's the progress bar itself)
    schedule(() => {
      setLines(prev => [...prev, progressLine]);
    }, cursor);
    cursor += 200;

    // Animate progress smoothly from 0 to 100 over ~1.5s (60fps-ish via steps of 4)
    for (let p = 4; p <= 100; p += 4) {
      schedule(() => setProgress(p), cursor + (p * 15));
    }
    cursor += 100 * 15 + 200;

    // ── Scanlines overlay (after sigil is already visible) ──
    schedule(() => setShowScanlines(true), 2000);

    // ── Ready line ──
    const readyLine: BootLine = {
      timestamp: now(),
      tag: 'OK',
      text: boot.ready,
      id: lineIdRef.current++,
    };
    typeLine(readyLine, () => {}, cursor);
    cursor += readyLine.text.length * 28 + 200;

    // ── Mode label ──
    const modeLine: BootLine = {
      timestamp: now(),
      tag: 'BOOT',
      text: `${boot.modeLabel}: ${spreadType}`,
      id: lineIdRef.current++,
    };
    typeLine(modeLine, () => {}, cursor);
    cursor += modeLine.text.length * 28 + 600;

    // ── Complete ──
    schedule(() => complete(), cursor);

    return () => timeouts.forEach(clearTimeout);
  }, [boot, spreadType, complete]);

  // Render a single finalized line
  const renderLine = (line: BootLine) => {
    const tagColor = guide.accent;

    // Progress bar line — special rendering
    if (line.text === 'manifest' && line.tag === 'SYS') {
      const filled = Math.floor(progress / 5);   // 0..20 blocks
      const empty = 20 - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      return (
        <div key={line.id} className="boot-log-line boot-log-progress">
          <span className="boot-ts">[{line.timestamp}]</span>{' '}
          <span className="boot-tag" style={{ color: guide.accent }}>[SYS]</span>{' '}
          <span className="boot-bar">[{bar}]</span>{' '}
          <span className="boot-pct">{progress}%</span>
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

  // Render the currently typing line (with cursor)
  const renderTypedLine = () => {
    if (!typedLine) return null;
    // Find the tag for this line id from boot data
    // header is id 0, then boot.lines[i] = id i+1
    let tag: BootLine['tag'] = 'INFO';
    let text = typedLine.text;
    let ts = now();

    if (typedLine.lineId === 0) {
      tag = 'BOOT';
    } else {
      const idx = typedLine.lineId - 1;
      if (idx < boot.lines.length) {
        tag = boot.lines[idx].tag;
      }
    }

    const tagColor = guide.accent;

    // Glitch effect for spark_of_chaos: random char replaced with accent color
    const renderedText = isChaos ? text.split('').map((ch, i) => {
      if (i > 0 && Math.random() < 0.04 && ch !== ' ') {
        return <span key={i} style={{ color: guide.accent }}>{ch}</span>;
      }
      return <span key={i}>{ch}</span>;
    }) : text;

    return (
      <div className="boot-log-line boot-typing">
        <span className="boot-ts">[{ts}]</span>{' '}
        <span className="boot-tag" style={{ color: tagColor }}>[{tag}]</span>{' '}
        <span className="boot-msg">
          {renderedText}
          <span className="boot-cursor">▌</span>
        </span>
      </div>
    );
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-start w-full h-full bg-black transition-opacity duration-400 overflow-hidden ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ '--guide-accent': guide.accent } as React.CSSProperties}
    >
      {/* ── Materializing GuideSigil (background, dimmed, centered) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${showSigil ? 1 : 0.7})`,
          opacity: showSigil ? 0.7 : 0,
          filter: 'brightness(0.7)',
          transition: 'opacity 1.2s ease-out, transform 1.5s ease-out',
          width: 'min(90vw, 90vh, 480px)',
          height: 'min(90vw, 90vh, 480px)',
        }}
        aria-hidden="true"
      >
        <GuideSigil guideId={characterId} />
      </div>

      {/* ── CRT scanlines overlay (very subtle) ── */}
      {showScanlines && (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 3px)',
            opacity: 0.6,
            animation: 'crt-flicker 5s steps(5) infinite',
          }}
          aria-hidden="true"
        />
      )}

      {/* ── Boot logs overlay (scrolling terminal) ── */}
      <div
        ref={logContainerRef}
        className="relative z-30 w-full h-full overflow-y-auto px-3 py-3 font-pixel text-[10px] sm:text-[11px] leading-relaxed"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* finalized lines */}
        {lines.map(renderLine)}
        {/* currently typing line */}
        {renderTypedLine()}
      </div>
    </div>
  );
}
