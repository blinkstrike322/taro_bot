 'use client';

// ─────────────────────────────────────────────────────────────
// useSound — тумблер звука с персистом.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import * as SFX from '@/lib/sound';

export function useSound() {
  // ленивая инициализация: на клиенте читаем преф сразу
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === 'undefined') return true;
    return SFX.isSoundEnabled();
  });
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    // rAF-дефер: чтение префа после первого кадра (гидрация уже сошлась)
    const raf = requestAnimationFrame(() => {
      const pref = SFX.loadSoundPref();
      setSoundOn((prev) => (prev === pref ? prev : pref));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      SFX.setSoundEnabled(next);
      SFX.saveSoundPref(next);
      return next;
    });
  }, []);

  return { soundOn, setSoundOn, toggleSound };
}
