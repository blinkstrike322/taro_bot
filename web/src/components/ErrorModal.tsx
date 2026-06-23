'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getGuide } from '@/lib/guides';

interface ErrorModalProps {
  message?: string;
  visible: boolean;
  onHide?: () => void;
  characterId?: string;
}

export default function ErrorModal({ message, visible, onHide, characterId }: ErrorModalProps) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guide = getGuide(characterId);

  const needsSubscription = useMemo(
    () => message?.toLowerCase().includes('подписк') ?? false,
    [message],
  );

  useEffect(() => {
    if (visible) {
      setShow(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShow(false);
        onHide?.();
      }, 5000);
    } else {
      setShow(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, onHide]);

  const handleDismiss = () => {
    setShow(false);
    onHide?.();
  };

  return (
    <div
      className={`error-overlay ${show ? 'visible' : ''}`}
      onClick={handleDismiss}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="error-box"
        style={{ '--err-accent': guide.accent, '--err-accent-dim': guide.accentDim } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {/* scan overlay */}
        <div className="error-scan" aria-hidden="true" />

        {/* occult corner guards */}
        <span className="error-corner tl" style={{ color: guide.accent }}>╳</span>
        <span className="error-corner tr" style={{ color: guide.accent }}>╳</span>
        <span className="error-corner bl" style={{ color: guide.accent }}>╳</span>
        <span className="error-corner br" style={{ color: guide.accent }}>╳</span>

        {/* sigil header */}
        <div className="error-sigil" style={{ color: guide.accent }}>
          {guide.ambientSymbols[Math.floor(Math.random() * guide.ambientSymbols.length)]}
        </div>

        {/* main message */}
        <div className="error-message">{message}</div>

        {/* subscription CTA */}
        {needsSubscription && (
          <div className="error-subscribe">
            <div className="error-sub-divider" />
            <button
              className="error-sub-btn font-pixel"
              style={{ '--err-accent': guide.accent } as React.CSSProperties}
              onClick={handleDismiss}
            >
              ◈ ЗАКРЫТЬ
            </button>
            <div className="error-sub-hint font-pixel">
              НАПИШИ /subscribe В ЧАТЕ С БOТOМ
            </div>
          </div>
        )}

        {/* close hint */}
        {!needsSubscription && (
          <div className="error-close-hint font-pixel" onClick={handleDismiss}>
            [ НАЖМИ ЧТOБЫ ЗАКРЫТЬ ]
          </div>
        )}
      </div>
    </div>
  );
}
