'use client';

/**
 * Typing-движок ARCANUM v2: печать через requestAnimationFrame
 * прямой инжекцией в Text-нод. Никаких React-ререндеров на символ,
 * никакого случайного джиттера — микро-вариация скорости плавная.
 * Расписание символов копится относительно предыдущей задержки
 * (nextAt += delay), а не пересчитывается от текущего кадра: средний
 * cps держится выше частоты кадров. После залипания кадра догоняем
 * максимум 2 символами за кадр — текст не «выстреливает» блоком.
 */

export interface TypeFlowHandle {
  cancel: () => void;
  finished: Promise<void>;
}

export interface TypeFlowOptions {
  /** базовая скорость, символов в секунду */
  cps?: number;
  /** звук на тик (движок сам троттлит); pitch 0.7–1.1 — тон тика */
  onTick?: (pitch: number) => void;
  minSoundIntervalMs?: number;
}

/** Пауза после знака препинания, мс. */
export function punctDelay(ch: string): number {
  if ('.!?…'.includes(ch)) return 120;
  if (',;:—'.includes(ch)) return 50;
  return 0;
}

export function typeInto(
  node: Text,
  text: string,
  opts: TypeFlowOptions = {},
): TypeFlowHandle {
  const cps = Math.max(10, opts.cps ?? 72);
  const minSoundIntervalMs = opts.minSoundIntervalMs ?? 48;
  let i = 0;
  let lastSound = 0;
  let raf = 0;
  let cancelled = false;
  // первый символ печатается сразу — расписание от старта потока
  const flowStart = performance.now();
  let nextAt = flowStart;
  let resolveDone: (() => void) | undefined;

  const finished = new Promise<void>((resolve) => { resolveDone = resolve; });
  const finish = () => { if (!cancelled) resolveDone?.(); };

  const baseDelay = () => {
    const wobble = 1 + 0.12 * Math.sin(i * 0.35);
    return 1000 / (cps * wobble);
  };

  const step = (now: number) => {
    if (cancelled) return;
    if (i >= text.length) { finish(); return; }
    if (now < nextAt) { raf = requestAnimationFrame(step); return; }
    let budget = 2; // жёсткий кап на кадр — анти-«блок»
    while (budget-- > 0 && i < text.length && now >= nextAt) {
      i += 1;
      node.textContent = text.slice(0, i);
      if (opts.onTick) {
        const t = performance.now();
        if (t - lastSound >= minSoundIntervalMs) {
          lastSound = t;
          // пинч синхронен с wobble скорости — твёрдый, стабильный окрас
          opts.onTick(0.9 + 0.2 * Math.sin(i * 0.35));
        }
      }
      nextAt += baseDelay() + punctDelay(text[i - 1]);
    }
    if (i >= text.length) { finish(); return; }
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);

  return {
    cancel: () => { cancelled = true; cancelAnimationFrame(raf); resolveDone?.(); },
    finished,
  };
}
