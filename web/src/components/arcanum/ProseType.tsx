'use client';

// ─────────────────────────────────────────────────────────────
// ProseType — посимвольная печать прозы чтений.
// Печать через rAF прямо в Text-ноду: ноль ререндеров.
// onDone двигает стадии чтения — без pre-computed задержек.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { typeInto } from '@/lib/typeFlow';
import { typingActivity } from '@/lib/typingActivity';
import { sType } from '@/lib/sound';

interface ProseTypeProps {
  text: string;
  instant?: boolean;
  className?: string;
  onDone?: () => void;
}

export default function ProseType({ text, instant = false, className = '', onDone }: ProseTypeProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (instant || text.length === 0) {
      el.textContent = text;
      const raf = requestAnimationFrame(() => {
        setDone(true);
        onDone?.();
      });
      return () => cancelAnimationFrame(raf);
    }

    // очистка и старт с пустой Text-ноды
    el.textContent = '';
    const node = document.createTextNode('');
    el.appendChild(node);

    typingActivity.begin();
    let i = 0;
    const handle = typeInto(node, text, {
      cps: 62,
      onChar: () => {
        i += 1;
        if (i % 3 === 0) sType(1 + (Math.random() - 0.5) * 0.3);
      },
      onDone: () => {
        typingActivity.end();
        setDone(true);
        onDone?.();
      },
    });

    // если unmount до конца — досчитать мгновенно и отписаться
    return () => {
      handle.cancel();
    };
     
  }, [text, instant]);

  return (
    <span ref={ref} className={`prose-type ${className}${done ? ' prose-type--done' : ''}`} />
  );
}
