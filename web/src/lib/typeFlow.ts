// ─────────────────────────────────────────────────────────────
// typeFlow.ts — планировщик посимвольной печати через rAF.
// Прямая инжекция в Text-ноду: ноль React-ререндеров на символ.
// База ~72 cps с wobble; паузы на знаках; после залипания
// кадра догоняем максимум 2 символами за кадр.
// ─────────────────────────────────────────────────────────────

export interface TypeHandle {
  cancel: () => void;
  finished: Promise<void>;
}

const PUNCT_LONG = '.!?…';
const PUNCT_SHORT = ',;:—';

export function typeInto(
  node: Text,
  text: string,
  opts: {
    cps?: number;
    onChar?: () => void;
    onDone?: () => void;
  } = {},
): TypeHandle {
  const { cps = 66, onChar, onDone } = opts;
  let i = 0;
  let nextAt = performance.now();
  let raf = 0;
  let dead = false;
  let resolveFinished: () => void = () => {};

  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
    const step = (now: number) => {
      if (dead) { resolve(); return; }
      // после длинного кадра не «выстреливаем» блоком
      if (nextAt < now - 260) nextAt = now - 2;

      let budget = 0;
      while (nextAt <= now && i < text.length && budget < 2) {
        const ch = text[i];
        i += 1;
        budget += 1;
        node.data += ch;
        onChar?.();
        const wobble = 1 + 0.14 * Math.sin(i * 0.4);
        let d = (1000 / cps) / wobble;
        if (PUNCT_LONG.includes(ch)) d += 110;
        else if (PUNCT_SHORT.includes(ch)) d += 45;
        nextAt += d;
      }

      if (i >= text.length) {
        dead = true;
        onDone?.();
        resolve();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  return {
    cancel: () => {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      node.data = text;
      onDone?.();
      resolveFinished();
    },
    finished,
  };
}

/** длительность печати строки для синхронизации эха */
export function typeDuration(text: string, msPerChar = 16): number {
  return Math.min(text.length * msPerChar, 1400);
}
