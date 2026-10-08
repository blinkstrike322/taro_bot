'use client';

// ─────────────────────────────────────────────────────────────
// useGuide — смена проводника: ритуал перехода (мотив звука,
// перекраска, приветствие голосом нового).
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import * as API from '@/lib/api';
import { getGuide } from '@/lib/guides';
import { setCurrentGuideSound, sGuide, sWhisper } from '@/lib/sound';
import type { TarotSession } from '@/hooks/useTarotSession';

export interface TarotGuide {
  runGuideSet: (id: string) => Promise<void>;
}

export function useGuide(session: TarotSession): TarotGuide {
  const { characterId, setCharacterId, push, pushOut, echoCmd, setMode } = session;

  const runGuideSet = useCallback(
    async (id: string) => {
      if (id === characterId) {
        pushOut([{ text: 'проводник уже в сеансе', tone: 'dim' }]);
        return;
      }
      try {
        const confirmed = await API.setCharacter(id);
        const guide = getGuide(confirmed);
        await echoCmd(`taro guides --set ${confirmed}`);

        // ритуал перехода: шорох пелены + мотив нового проводника
        sWhisper();
        sGuide(confirmed);
        setCurrentGuideSound(confirmed);
        setCharacterId(confirmed);
        try {
          localStorage.setItem('taro_character', confirmed);
        } catch {}

        const greeting = guide.greetings[Math.floor(Math.random() * guide.greetings.length)];
        pushOut([
          { text: 'пелена сменяет голос…', tone: 'comment' },
          { text: `${guide.name} · ${guide.subtitle}`, tone: 'accent' },
        ]);
        push({ kind: 'out', lines: [{ text: greeting, tone: 'bright' }] });
        setMode('ОЖИДАНИЕ');
      } catch (err: any) {
        push({ kind: 'error', msg: err?.message ?? 'проводник не отвечает' });
        setMode('ОЖИДАНИЕ');
      }
    },
    [characterId, setCharacterId, echoCmd, push, pushOut, setMode],
  );

  return { runGuideSet };
}
