'use client';

// ─────────────────────────────────────────────────────────────
// RestoreOffer — предложение поднять прошлый сеанс после бута.
// Раунд 24 «чистый старт»: без рамки-свитка и углов — тихая
// строка-мета и два текстовых действия. Терминал помнит молча.
// ─────────────────────────────────────────────────────────────
import { RotateCcw, X } from 'lucide-react';
import { formatDateTime } from '@/lib/transcript';
import { sMenu, haptic } from '@/lib/sound';

interface RestoreOfferProps {
  count: number;
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

export default function RestoreOffer({ count, savedAt, onRestore, onDiscard }: RestoreOfferProps) {
  const restore = () => {
    sMenu();
    haptic('tap');
    onRestore();
  };
  const discard = () => {
    sMenu();
    haptic('tick');
    onDiscard();
  };

  const countLabel = count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей';

  return (
    <div className="restore-offer">
      <div className="restore-meta tl">
        прошлый сеанс · {count} {countLabel} · {formatDateTime(new Date(savedAt).toISOString())}
      </div>
      <div className="restore-actions">
        <button type="button" className="restore-btn restore-btn--main" onClick={restore}>
          <RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
          восстановить
        </button>
        <button type="button" className="restore-btn" onClick={discard}>
          <X size={12} strokeWidth={2} aria-hidden="true" />
          начать чисто
        </button>
      </div>
    </div>
  );
}
