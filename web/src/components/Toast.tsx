'use client';

import { useState, useEffect, useRef } from 'react';

interface ToastProps {
  message?: string;
  visible: boolean;
  onHide?: () => void;
}

export default function Toast({ message, visible, onHide }: ToastProps) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setShow(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShow(false);
        onHide?.();
      }, 1700);
    } else {
      setShow(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, onHide]);

  return (
    <div className={`toast ${show ? 'visible' : ''}`}>
      {message}
    </div>
  );
}
