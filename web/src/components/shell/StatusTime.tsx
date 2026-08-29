'use client';

// Изолированные 1с-часы/uptime: тикают ТОЛЬКО сами в маленьком спане,
// а не пересчитывают весь Shell (до этого setInterval в Shell ре-рендерил
// весь транскрипт каждую секунду).

import { useEffect, useState } from 'react';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** uptime в титл-баре (⏱ 12:34) */
export function TitleUptime() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return <span>⏱ {pad2(Math.floor(s / 60))}:{pad2(s % 60)}</span>;
}

/** часы в статус-лайн (--:--:--) */
export function StatusClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = now
    ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
    : '--:--:--';
  return <span>{clock}</span>;
}