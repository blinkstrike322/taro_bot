'use client';

// ProgressLine — живой прогресс-бар из блоков, как в apt/pip:
//   тасование колоды  [██████████░░░░░░░░░░░░]  47%
import { useEffect, useState } from 'react';

interface ProgressLineProps {
  label: string;
  durMs: number;
  width?: number; // количество ячеек
}

export default function ProgressLine({ label, durMs, width = 20 }: ProgressLineProps) {
  const [pct, setPct] = useState(0);
  // защита от кривого durMs: отрицательное/нулевое/NaN значение не должно
  // дать filled<0 и уронить '█'.repeat(-1) → RangeError (Android WebView)
  const safeDur = Number.isFinite(durMs) && durMs > 0 ? durMs : 1500;
  const w = Math.max(1, Math.floor(width));

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(100, ((t - t0) / safeDur) * 100);
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safeDur]);

  const filled = Math.max(0, Math.min(w, Math.round((pct / 100) * w)));
  const bar = '█'.repeat(filled) + '░'.repeat(w - filled);

  return (
    <div className="pbar tl">
      <span className="pb-label">{label}</span>
      <span className="pb-bracket">[</span>
      <span className="pb-fill">{bar.slice(0, filled)}</span>
      <span className="pb-empty">{bar.slice(filled)}</span>
      <span className="pb-bracket">]</span>
      <span className="pb-pct">{String(Math.floor(pct)).padStart(3, '\u00A0')}%</span>
    </div>
  );
}
