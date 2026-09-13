'use client';

// ─────────────────────────────────────────────────────────────
// useSound — звук терминала вкл/выкл с памятью в localStorage.
// Один предмет — звуковая настройка (SFX-вызовы идут напрямую).
// ─────────────────────────────────────────────────────────────
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import * as SFX from '@/lib/sound';

export interface TarotSound {
  soundOn: boolean;
  setSoundOn: Dispatch<SetStateAction<boolean>>;
  toggleSound: () => void;
}

export function useSound(): TarotSound {
  const [soundOn, setSoundOn] = useState(true);

  // ── звук терминала: вкл/выкл с памятью ──
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      SFX.setSoundEnabled(next);
      SFX.saveSoundPref(next);
      if (next) SFX.sEnter();
      return next;
    });
  }, []);

  return { soundOn, setSoundOn, toggleSound };
}