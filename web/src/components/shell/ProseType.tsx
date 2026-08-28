'use client';

// ─────────────────────────────────────────────────────────────
// ProseType — печатает прозаическое значение посимвольно,
// как настоящий вывод канала: паузы на знаках препинания,
// мигающий блок-курсор, открывающая кавычка ждёт текст.
// Когда допечатал — может включить мерцание фосфора (shimmer).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

interface ProseTypeProps {
  text: string;
  /** мс до первого символа — оркестрация последовательности */
  startDelay?: number;
  /** базовая скорость мс/символ */
  speed?: number;
  className?: string;
  /** инлайн-стиль внешнего спана (цвет, свечение) */
  style?: React.CSSProperties;
  /** завершающий символ после закрывающей кавычки (запятая JSON) */
  tail?: string;
  /** включить shimmer после печати (мерцание фосфора) */
  shimmer?: boolean;
  onDone?: () => void;
}

// пауза после знака — пусть текст дышит
function charDelay(ch: string): number {
  if ('.!?…'.includes(ch)) return 240;
  if (',;:—'.includes(ch)) return 105;
  return 0;
}

// сколько займёт печать строки (мс) — для оркестратора
export function proseDuration(text: string, speed = 15): number {
  let ms = text.length * (speed + 4);
  for (const ch of text) ms += charDelay(ch);
  return ms + 90;
}

export default function ProseType({
  text,
  startDelay = 0,
  speed = 15,
  className,
  style,
  tail,
  shimmer = false,
  onDone,
}: ProseTypeProps) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    setN(0);
    doneRef.current = false;
    if (!text) {
      onDone?.();
      return;
    }
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setN(i);
      if (i >= text.length) {
        doneRef.current = true;
        onDone?.();
        return;
      }
      t = setTimeout(step, speed + charDelay(text[i - 1]) + Math.random() * 8);
    };
    t = setTimeout(step, startDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, startDelay, speed]);

  const done = n >= text.length;

  return (
    <span className={`j-prose ${className ?? ''}`} style={style}>
      {'"'}
      <span className={done && shimmer ? 'j-shimmer' : undefined}>{text.slice(0, n)}</span>
      {!done && <span className="prose-cursor" aria-hidden="true">▊</span>}
      {done && '"'}
      {done && tail && <span className="j-punct">{tail}</span>}
    </span>
  );
}
