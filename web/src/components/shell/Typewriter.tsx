'use client';

// Typewriter — печатает строку посимвольно, как будто её вводят.
// Используется для эха команд: терминал должен чувствоваться живым.
// Движок — typeFlow (rAF + DOM-инжект), как у прозы: ноль ререндеров
// на символ, микро-вариация скорости плавная.
import { useEffect, useRef, useState } from 'react';
import { sKey } from '@/lib/sound';
import { typeInto, type TypeFlowHandle } from '@/lib/typeFlow';
import { typingActivity } from '@/lib/typingActivity';

interface TypewriterProps {
  text: string;
  /** задержка между символами (мс) — legacy, конвертируется в cps */
  speedMs?: number;
  className?: string;
  /** щёлкать клавишами при печати */
  sound?: boolean;
  onDone?: () => void;
}

export default function Typewriter({ text, speedMs = 22, className, sound = false, onDone }: TypewriterProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const flowRef = useRef<TypeFlowHandle | null>(null);
  const [done, setDone] = useState(!text);
  // onDone в ref — эффект не должен перезапускаться от смены коллбэка
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // legacy мс/символ → cps (обратная совместимость: Shell шлёт speedMs=18)
  const cps = Math.max(1, Math.round(1000 / speedMs));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    flowRef.current?.cancel();
    flowRef.current = null;
    const reduced = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!text || reduced) {
      host.textContent = text;
      setDone(true);
      onDoneRef.current?.();
      return;
    }
    setDone(false);
    host.textContent = '';
    const node = document.createTextNode('');
    host.appendChild(node);
    let cancelled = false;

    // begin/end строго парны: finished резолвится и при cancel(),
    // поэтому единственный end живёт в .then.
    typingActivity.begin();
    flowRef.current = typeInto(node, text, {
      cps,
      onTick: sound ? sKey : undefined,
    });
    flowRef.current.finished.then(() => {
      typingActivity.end();
      if (cancelled) return;
      setDone(true);
      onDoneRef.current?.();
    });

    return () => {
      cancelled = true;
      flowRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, cps]);

  return (
    <span className={className}>
      <span ref={hostRef} />
      {!done && <span className="tw-cursor" aria-hidden="true">▊</span>}
    </span>
  );
}

// Сколько времени займёт печать строки (мс) — оценка для внешних оркестраторов
export function typeDuration(text: string, cps = 55): number {
  return Math.round((text.length * 1000) / cps) + 60;
}
