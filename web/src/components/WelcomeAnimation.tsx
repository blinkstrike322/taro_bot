'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface WelcomeAnimationProps {
  onComplete: () => void;
  spreadType: string; // 'daily' | '1' | '3'
}

interface Line {
  text: string;
  type: 'header' | 'text' | 'progress' | 'ready';
}

export default function WelcomeAnimation({ onComplete, spreadType }: WelcomeAnimationProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const completedRef = useRef(false);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFading(true);
    setTimeout(onComplete, 300);
  }, [onComplete]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, delay: number) => {
      timeouts.push(setTimeout(fn, delay));
    };

    schedule(() => {
      setLines(prev => [...prev, { text: '┌─[OCGV_V1.0]─[root@taro]─[~]', type: 'header' }]);
    }, 100);

    schedule(() => {
      setLines(prev => [...prev, { text: 'Loading arcana modules...', type: 'text' }]);
    }, 600);

    schedule(() => {
      setLines(prev => [...prev, { text: 'progress', type: 'progress' }]);
      for (let i = 1; i <= 10; i++) {
        schedule(() => setProgress(i), 600 + i * 120);
      }
    }, 1100);

    schedule(() => {
      setLines(prev => [...prev, { text: '✦ SYSTEM READY ✦', type: 'ready' }]);
    }, 2400);

    schedule(() => {
      setLines(prev => [...prev, { text: `SPREAD MODE: ${spreadType}`, type: 'text' }]);
    }, 2800);

    schedule(() => complete(), 3300);

    return () => timeouts.forEach(clearTimeout);
  }, [spreadType, complete]);

  const progressFilled = '█'.repeat(progress);
  const progressEmpty = '░'.repeat(10 - progress);

  return (
    <div
      className={`flex items-center justify-center w-full min-h-[60vh] bg-black transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="font-pixel text-[11px] text-white space-y-2 px-4">
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
              <div key={i} className="text-white blink">
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
