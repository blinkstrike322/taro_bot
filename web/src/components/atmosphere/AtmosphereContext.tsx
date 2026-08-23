'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type AtmospherePhase = 'welcome' | 'draw' | 'reveal' | 'reading';

interface AtmosphereValue {
  phase: AtmospherePhase;
  setPhase: (p: AtmospherePhase) => void;
  guideId: string;
}

const AtmosphereContext = createContext<AtmosphereValue | null>(null);

export function AtmosphereProvider({ characterId, children }: { characterId: string; children: ReactNode }) {
  const [phase, setPhaseState] = useState<AtmospherePhase>('welcome');
  const setPhase = useCallback((p: AtmospherePhase) => setPhaseState(p), []);
  const value = useMemo(
    () => ({ phase, setPhase, guideId: characterId }),
    [phase, setPhase, characterId],
  );
  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>;
}

export function useAtmosphere(): AtmosphereValue {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) throw new Error('useAtmosphere must be used within AtmosphereProvider');
  return ctx;
}
