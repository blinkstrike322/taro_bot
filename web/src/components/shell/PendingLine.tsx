'use client';

// ─────────────────────────────────────────────────────────────
// PendingLine — неопределённое ожидание шёпота канала.
// Брайль-спиннер + рыщущий фосфорный блок по пустой шкале
// (как старые индикаторы активности): живёт, пока канал думает,
// и исчезает, когда шёпот доставлен.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface PendingLineProps {
  label: string;
}

export default function PendingLine({ label }: PendingLineProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPIN_FRAMES.length), 90);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pending-line tl tl-dim" role="status" aria-live="polite">
      <span className="pd-spin" aria-hidden="true">{SPIN_FRAMES[frame]}</span>
      <span className="pd-label">{label}</span>
      <span className="pd-track" aria-hidden="true">
        <span className="pd-knight" />
      </span>
      <span className="pd-dots" aria-hidden="true">…</span>
    </div>
  );
}
