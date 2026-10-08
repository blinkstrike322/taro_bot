'use client';

// ─────────────────────────────────────────────────────────────
// Typewriter — печать коротких строк (эхо команд, MOTD).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { typeInto } from '@/lib/typeFlow';
import { typingActivity } from '@/lib/typingActivity';
import { sType } from '@/lib/sound';

interface TypewriterProps {
  text: string;
  className?: string;
  speedMs?: number;
  sound?: boolean;
  onDone?: () => void;
}

export default function Typewriter({
  text,
  className = '',
  speedMs = 16,
  sound = false,
  onDone,
}: TypewriterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (text.length === 0) {
      const raf = requestAnimationFrame(() => {
        setDone(true);
        onDone?.();
      });
      return () => cancelAnimationFrame(raf);
    }
    el.textContent = '';
    const node = document.createTextNode('');
    el.appendChild(node);

    typingActivity.begin();
    let i = 0;
    const handle = typeInto(node, text, {
      cps: Math.round(1000 / speedMs),
      onChar: () => {
        i += 1;
        if (sound && i % 2 === 0) sType(1 + (Math.random() - 0.5) * 0.2);
      },
      onDone: () => {
        typingActivity.end();
        setDone(true);
        onDone?.();
      },
    });
    return () => {
      handle.cancel();
    };
     
  }, [text, speedMs, sound]);

  return <span ref={ref} className={`typewriter ${className}${done ? ' typewriter--done' : ''}`} />;
}
