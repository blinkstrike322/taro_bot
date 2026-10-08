'use client';

// ─────────────────────────────────────────────────────────────
// RestoreOffer — предложение поднять прошлый сеанс после бута.
// Терминальный блок с двумя чипами: восстановить / начать чисто.
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

  return (
    <div className="restore-offer frame-ritual p-3">
      <span className="corner corner-tl">╔</span>
      <span className="corner corner-tr">┐</span>
      <span className="corner corner-bl">└</span>
      <span className="corner corner-br">╝</span>

      <div className="restore-head">
        <span className="restore-title">прошлый сеанс</span>
        <span className="restore-meta">
          {count} {count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей'} ·{' '}
          {formatDateTime(new Date(savedAt).toISOString())}
        </span>
      </div>

      <div className="restore-hint tl tl-comment">
        {'// терминал помнит, на чём ты остановился'}
      </div>

      <div className="restore-actions">
        <button type="button" className="chip restore-chip restore-chip--main" onClick={restore}>
          <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" />
          восстановить сеанс
        </button>
        <button type="button" className="chip restore-chip" onClick={discard}>
          <X size={13} strokeWidth={2} aria-hidden="true" />
          начать чисто
        </button>
      </div>
    </div>
  );
}
