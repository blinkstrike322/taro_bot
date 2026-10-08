'use client';

// ─────────────────────────────────────────────────────────────
// StatusTime — живые часы и uptime титл-бара.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function StatusClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // rAF-дефер первого тика: часы оживают после гидрации
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);
  if (!now) return <span className="sl-right">--:--</span>;
  return <span className="sl-right">{pad(now.getHours())}:{pad(now.getMinutes())}</span>;
}

export function TitleUptime() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return (
    <span className="st-up">
      up {mm > 59 ? `${Math.floor(mm / 60)}h ${mm % 60}m` : mm > 0 ? `${mm}m ` : ''}{pad(ss)}s
    </span>
  );
}
