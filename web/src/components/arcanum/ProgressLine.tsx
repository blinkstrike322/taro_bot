'use client';

// ─────────────────────────────────────────────────────────────
// ProgressLine / PendingLine — тасование (тайм-бар) и ожидание
// шёпота (рыщущий курсор).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

export function ProgressLine({ label, durMs }: { label: string; durMs: number }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / durMs, 1);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [durMs]);

  const pct = Math.round(progress * 100);
  return (
    <div className="progress-line" role="status" aria-label={label}>
      <span className="pl-label tl tl-dim">{label}</span>
      <span className="pl-track" aria-hidden="true">
        <span className="pl-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="pl-pct tl tl-faint">{pct}%</span>
    </div>
  );
}

const SWEEP_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function PendingLine({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SWEEP_FRAMES.length), 110);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pending-line tl tl-dim" role="status" aria-label={label}>
      <span className="cd-spinner" aria-hidden="true">{SWEEP_FRAMES[frame]}</span>{' '}
      {label}
      <span className="blink" aria-hidden="true"> …</span>
    </div>
  );
}
