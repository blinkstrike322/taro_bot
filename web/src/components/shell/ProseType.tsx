'use client';

// ─────────────────────────────────────────────────────────────
// ProseType — печатает прозаическое значение посимвольно,
// как настоящий вывод канала: паузы на знаках препинания,
// мигающий блок-курсор, открывающая кавычка ждёт текст.
// Когда допечатал — может включить мерцание фосфора (shimmer).
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { sType } from '@/lib/sound';
import { joinedParagraphs } from '@/lib/prose';

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
  /** тикать телетайпом при печати — звук вывода канала */
  sound?: boolean;
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
  const target = joinedParagraphs(text);
  let ms = target.length * (speed + 4);
  for (const ch of target) ms += charDelay(ch);
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
  sound = true,
  onDone,
}: ProseTypeProps) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);
  const target = useMemo(() => joinedParagraphs(text), [text]);

  useEffect(() => {
    setN(0);
    doneRef.current = false;
    if (!target) {
      onDone?.();
      return;
    }
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setN(i);
      if (sound) sType();
      if (i >= target.length) {
        doneRef.current = true;
        onDone?.();
        return;
      }
      t = setTimeout(step, speed + charDelay(target[i - 1]) + Math.random() * 8);
    };
    t = setTimeout(step, startDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, startDelay, speed]);

  const done = n >= target.length;

  return (
    <span className={`j-prose ${className ?? ''}`} style={style}>
      {'"'}
      <span className={done && shimmer ? 'j-shimmer' : undefined}>{target.slice(0, n)}</span>
      {!done && <span className="prose-cursor" aria-hidden="true">▊</span>}
      {done && '"'}
      {done && tail && <span className="j-punct">{tail}</span>}
    </span>
  );
}
