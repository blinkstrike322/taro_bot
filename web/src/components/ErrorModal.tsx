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
      }, 6000);
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

  // Символ проводницы — детерминированный от сообщения
  const sigil = useMemo(
    () => guide.ambientSymbols[(message?.length || 0) % guide.ambientSymbols.length],
    [guide, message],
  );

  return (
    <div
      className={`error-overlay ${show ? 'visible' : ''}`}
      onClick={handleDismiss}
      role="alertdialog"
      aria-modal="true"
      style={{
        '--guide-accent': guide.accent,
        '--guide-accent-deep': guide.accentDeep,
      } as React.CSSProperties}
    >
      <div
        className="error-box"
        style={{ border: `1.5px solid ${guide.accentDim}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* символ проводницы */}
        <div
          className="error-sigil mx-auto"
          style={{ color: guide.accent, filter: `drop-shadow(0 0 10px ${guide.accentDim})` }}
        >
          {sigil}
        </div>

        {/* сообщение */}
        <div className="error-message">{message}</div>

        {/* подписка */}
        {needsSubscription && (
          <div className="error-subscribe">
            <div className="error-sub-divider" />
            <button className="error-sub-btn font-sans font-bold" onClick={handleDismiss}>
              Понятно
            </button>
            <div className="error-sub-hint font-pixel">
              НАПИШИ /SUBSCRIBE В ЧАТЕ С БОТОМ
            </div>
          </div>
        )}

        {/* закрыть */}
        {!needsSubscription && (
          <div className="error-close-hint" onClick={handleDismiss}>
            [ коснись, чтобы закрыть ]
          </div>
        )}
      </div>
    </div>
  );
}
