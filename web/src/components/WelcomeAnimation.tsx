'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getGuide } from '@/lib/guides';

interface WelcomeAnimationProps {
  onComplete: () => void;
  spreadType: string;
  characterId?: string;
}

interface Line {
  text: string;
  type: 'header' | 'text' | 'progress' | 'ready';
}

// Per-guide boot sequences
const BOOT_SEQUENCES: Record<string, {
  header: string;
  lines: string[];
  ready: string;
  modeLabel: string;
}> = {
  shadow_walker: {
    header: '┌─[OCGV_V1.0]─[shadow@taro]─[~]',
    lines: [
      'пробуждение теней...',
      'калибровка лунного света...',
      'чтение шёпота леса...',
      'manifest arcana modules...',
    ],
    ready: '✦ ТЕНИ ГОТОВЫ ✦',
    modeLabel: 'SHADOW MODE',
  },
  ruin_keeper: {
    header: '┌─[OCGV_V1.0]─[ruin@taro]─[~]',
    lines: [
      'очистка пыли веков...',
      'пробуждение камня...',
      'дешифровка рун...',
      'manifest arcana modules...',
    ],
    ready: '✦ КАМЕНЬ ПОМНИТ ✦',
    modeLabel: 'RUIN MODE',
  },
  spark_of_chaos: {
    header: '┌─[OCGV_V1.0]─[chaos@taro]─[~]',
    lines: [
      'искра зажжена...',
      'хaos engine warming...',
      'расфокусировка реальности...',
      'manifest arcana modules...',
    ],
    ready: '✦ ИСКРА ЖИВА ✦',
    modeLabel: 'CHAOS MODE',
  },
};

export default function WelcomeAnimation({ onComplete, spreadType, characterId = 'shadow_walker' }: WelcomeAnimationProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [showSigil, setShowSigil] = useState(false);
  const completedRef = useRef(false);

  const guide = useMemo(() => getGuide(characterId), [characterId]);
  const boot = useMemo(() => BOOT_SEQUENCES[characterId] || BOOT_SEQUENCES.shadow_walker, [characterId]);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFading(true);
    setTimeout(onComplete, 400);
  }, [onComplete]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, delay: number) => {
      timeouts.push(setTimeout(fn, delay));
    };

    // ── boot sequence ──
    schedule(() => {
      setLines(prev => [...prev, { text: boot.header, type: 'header' }]);
    }, 100);

    // lines stream in
    boot.lines.forEach((line, i) => {
      schedule(() => {
        setLines(prev => [...prev, { text: line, type: 'text' }]);
      }, 400 + i * 350);
    });

    // progress bar appears
    const progressStart = 400 + boot.lines.length * 350 + 200;
    schedule(() => {
      setLines(prev => [...prev, { text: 'progress', type: 'progress' }]);
      for (let i = 1; i <= 10; i++) {
        schedule(() => setProgress(i), progressStart + i * 100);
      }
    }, progressStart);

    // sigil materializes (overlapping with progress)
    schedule(() => setShowSigil(true), progressStart + 600);

    // ready line
    schedule(() => {
      setLines(prev => [...prev, { text: boot.ready, type: 'ready' }]);
    }, progressStart + 1200);

    // mode label
    schedule(() => {
      setLines(prev => [...prev, { text: `${boot.modeLabel}: ${spreadType}`, type: 'text' }]);
    }, progressStart + 1600);

    // complete
    schedule(() => complete(), progressStart + 2200);

    return () => timeouts.forEach(clearTimeout);
  }, [boot, spreadType, complete]);

  const progressFilled = '█'.repeat(progress);
  const progressEmpty = '░'.repeat(10 - progress);

  return (
    <div
      className={`relative flex flex-col items-center justify-center w-full min-h-full bg-black transition-opacity duration-400 overflow-hidden px-3 py-4 ${fading ? 'opacity-0' : 'opacity-100'}`}
      style={{ '--guide-accent': guide.accent } as React.CSSProperties}
    >
      {/* ── materializing sigil (background, behind boot text) ── */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none px-4"
        aria-hidden="true"
      >
        <div
          className="welcome-sigil w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64"
          style={{
            opacity: showSigil ? 1 : 0,
            transition: 'opacity 1.2s ease-out, transform 1.5s ease-out',
            transform: showSigil ? 'scale(1)' : 'scale(0.7)',
          }}
        >
          <WelcomeSigil guide={guide} />
        </div>
      </div>

      {/* ── boot text overlay ── */}
      <div className="relative z-10 font-pixel text-[10px] sm:text-[11px] text-white space-y-2 px-3 max-w-full overflow-x-hidden">
        {lines.map((line, i) => {
          if (line.type === 'header') {
            return (
              <div key={i} className="text-white/60 tracking-tight">
                {line.text}
              </div>
            );
          }
          if (line.type === 'progress') {
            return (
              <div key={i} className="tracking-wide">
                [{progressFilled}{progressEmpty}] {progress}/10
              </div>
            );
          }
          if (line.type === 'ready') {
            return (
              <div
                key={i}
                className="text-white blink text-center"
                style={{ color: guide.accent, textShadow: `0 0 6px ${guide.accentDim}` }}
              >
                {line.text}
              </div>
            );
          }
          return (
            <div key={i} className="text-white/80">
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Per-guide welcome sigil — abstract pixel composition with orbits + accent glow ──
function WelcomeSigil({ guide }: { guide: ReturnType<typeof getGuide> }) {
  // 4 concentric orbit rings + center glow + falling sparks
  const rings = [60, 90, 120, 150];
  const ringCounts = [12, 18, 24, 30];

  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
      shapeRendering="crispEdges"
    >
      {/* center accent glow */}
      <circle
        cx="200"
        cy="200"
        r="40"
        fill={guide.accent}
        opacity="0.15"
      />
      <circle
        cx="200"
        cy="200"
        r="20"
        fill={guide.accent}
        opacity="0.3"
      />
      <rect x="197" y="197" width="6" height="6" fill={guide.accent} />

      {/* orbit rings */}
      {rings.map((r, ri) => {
        const count = ringCounts[ri];
        return Array.from({ length: count }, (_, i) => {
          const angle = (i / count) * Math.PI * 2 + ri * 0.2;
          const x = 200 + Math.cos(angle) * r;
          const y = 200 + Math.sin(angle) * r;
          const isAccent = (i + ri) % 4 === 0;
          return (
            <rect
              key={`r${ri}-d${i}`}
              x={x - 1}
              y={y - 1}
              width={2}
              height={2}
              fill={isAccent ? guide.accent : '#fff'}
              opacity={0.4 + (i % 3) * 0.15}
              className="welcome-orbit-dot"
              style={{
                animationDelay: `${(i + ri * 5) * 0.1}s`,
              }}
            />
          );
        });
      })}

      {/* faint outer ring outlines */}
      {rings.map((r, ri) => (
        <circle
          key={`o${ri}`}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}

      {/* 4 cardinal long tick marks */}
      <rect x="199" y="30"  width="2" height="20" fill={guide.accent} opacity="0.6" />
      <rect x="199" y="350" width="2" height="20" fill={guide.accent} opacity="0.6" />
      <rect x="30"  y="199" width="20" height="2" fill={guide.accent} opacity="0.6" />
      <rect x="350" y="199" width="20" height="2" fill={guide.accent} opacity="0.6" />

      {/* corner accent marks */}
      <rect x="60"  y="60"  width="3" height="3" fill={guide.accent} opacity="0.5" />
      <rect x="337" y="60"  width="3" height="3" fill={guide.accent} opacity="0.5" />
      <rect x="60"  y="337" width="3" height="3" fill={guide.accent} opacity="0.5" />
      <rect x="337" y="337" width="3" height="3" fill={guide.accent} opacity="0.5" />
    </svg>
  );
}
