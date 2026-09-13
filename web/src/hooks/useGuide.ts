'use client';

// ─────────────────────────────────────────────────────────────
// useGuide — смена проводника: тень/хаос/руины. Один предмет —
// выбор проводника сеанса с эхо-командой и локальной памятью.
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as SFX from '@/lib/sound';
import { getGuide } from '@/lib/guides';
import { randomWhisper } from '@/lib/transcript';
import { track } from '@/lib/analytics';
import type { TarotSession } from '@/hooks/useTarotSession';

export interface TarotGuide {
  runGuideSet: (id: string) => Promise<void>;
}

export function useGuide(session: TarotSession): TarotGuide {
  const { echoCmd, push, pushOut, setCharacterId } = session;

  // ── смена проводника ──
  const runGuideSet = useCallback(async (id: string) => {
    const guide = getGuide(id);
    await echoCmd(`taro guide ${id}`);
    setCharacterId(id);
    try { localStorage.setItem('taro_character', id); } catch {}
    track('guide_selected', { guide: id });
    SFX.sWhisper();
    push({ kind: 'ok', msg: `проводник сменён: ${guide.name} · ${guide.tag}` });
    pushOut([
      { text: `«${guide.greeting}»`, tone: 'comment' },
      { text: randomWhisper(), tone: 'comment' },
    ]);
  }, [echoCmd, push, pushOut, setCharacterId]);

  return { runGuideSet };
}