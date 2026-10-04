'use client';

// ProseType v2 — проза печатается движком typeFlow (rAF + DOM-инжект):
// ноль React-ререндеров на символ, паузы на знаках, тонкий курсор.
import { useEffect, useRef, useState } from 'react';
import { sType } from '@/lib/sound';
import { joinedParagraphs } from '@/lib/prose';
import { typeInto, type TypeFlowHandle } from '@/lib/typeFlow';
import { typingActivity } from '@/lib/typingActivity';

interface ProseTypeProps {
  text: string;
  /** мс до первого символа — оркестрация последовательности */
  startDelay?: number;
  /** скорость печати, символов в секунду (бывшие ~8мс/символ ≈ 110cps; 72 — спокойнее) */
  cps?: number;
  /** устаревшее имя скорости — мс/символ, конвертируется в cps (1000/speed) */
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
  tail?: string;
  quotes?: boolean;
  shimmer?: boolean;
  sound?: boolean;
  /** мгновенный вывод без посимвольной печати (журнал) */
  instant?: boolean;
  onDone?: () => void;
}

// сколько займёт печать строки (мс) — оценка для внешних оркестраторов
export function proseDuration(text: string, cps = 72): number {
  const target = joinedParagraphs(text);
  let ms = (target.length * 1000) / cps;
  for (const ch of target) ms += ('.!?…'.includes(ch) ? 120 : ',;:—'.includes(ch) ? 50 : 0);
  return ms + 90;
}

export default function ProseType({
  text, startDelay = 0, cps = 72, speed, className, style, tail,
  shimmer = false, sound = true, instant = false, quotes = true, onDone,
}: ProseTypeProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const flowRef = useRef<TypeFlowHandle | null>(null);
  const [done, setDone] = useState(Boolean(instant || !text));
  // onDone в ref — эффект не должен перезапускаться от смены коллбэка
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // legacy speed (мс/символ) → cps: 1000/speed
  const effCps = speed != null ? Math.max(1, Math.round(1000 / speed)) : cps;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    flowRef.current?.cancel();
    flowRef.current = null;
    const reduced = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduced || !text) {
      host.textContent = joinedParagraphs(text);
      setDone(true);
      onDoneRef.current?.();
      return;
    }
    setDone(false);
    host.textContent = '';
    const node = document.createTextNode('');
    host.appendChild(node);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      if (cancelled) return;
      // begin/end строго парны: finished резолвится и при cancel(), поэтому
      // единственный end живёт в .then — двойного декремента не бывает.
      typingActivity.begin();
      flowRef.current = typeInto(node, joinedParagraphs(text), {
        cps: effCps,
        onTick: sound ? sType : undefined,
      });
      flowRef.current.finished.then(() => {
        typingActivity.end();
        if (cancelled) return;
        setDone(true);
        onDoneRef.current?.();
      });
    };
    timer = startDelay > 0 ? setTimeout(start, startDelay) : (start(), undefined);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      flowRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, instant, effCps]);

  return (
    <span className={`j-prose ${className ?? ''}`} style={style}>
      {quotes && '"'}
      <span className={done && shimmer ? 'j-shimmer' : undefined}>
        <span ref={hostRef} />
        {!done && !instant && <span className="prose-cursor" aria-hidden="true">│</span>}
      </span>
      {done && quotes && '"'}
      {done && tail && <span className="j-punct">{tail}</span>}
    </span>
  );
}
