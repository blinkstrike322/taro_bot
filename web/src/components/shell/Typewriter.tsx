'use client';

// Typewriter — печатает строку посимвольно, как будто её вводят.
// Используется для эха команд: терминал должен чувствоваться живым.
import { useEffect, useState } from 'react';
import { sKey } from '@/lib/sound';

interface TypewriterProps {
  text: string;
  speedMs?: number;      // задержка между символами
  className?: string;
  /** щёлкать клавишами при печати */
  sound?: boolean;
  onDone?: () => void;
}

export default function Typewriter({ text, speedMs = 22, className, sound = false, onDone }: TypewriterProps) {
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(0);
    if (!text) {
      onDone?.();
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(i);
      if (sound) sKey();
      if (i >= text.length) {
        clearInterval(t);
        onDone?.();
      }
    }, speedMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span className={className}>
      {text.slice(0, n)}
      {n < text.length && <span className="tw-cursor" aria-hidden="true">▊</span>}
    </span>
  );
}

// Сколько времени займёт печать строки (мс) — чтобы оркестратор ждал
export function typeDuration(text: string, speedMs = 22): number {
  return text.length * speedMs + 60;
}
