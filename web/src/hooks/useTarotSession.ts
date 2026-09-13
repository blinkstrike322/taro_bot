'use client';

// ─────────────────────────────────────────────────────────────
// useTarotSession — фундамент-журнал ARCANUM: состояние сеанса,
// рефы и посылка записей в транскрипт. Один предмет — сеанс.
// Всё остальное (шёпот, расклады, журнал, проводник) строится
// поверх этого ядра через передачу объекта session.
// ─────────────────────────────────────────────────────────────
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ShellMode } from '@/components/shell/Shell';
import { typeDuration } from '@/components/shell/Typewriter';
import { sleep, type Entry, type OutLine } from '@/lib/transcript';

/** Параметры журнала, которыми другие хуки пользуются напрямую. */
export interface TarotSession {
  entries: Entry[];
  setEntries: Dispatch<SetStateAction<Entry[]>>;
  scrollTick: number;
  setScrollTick: Dispatch<SetStateAction<number>>;
  mode: ShellMode;
  setMode: Dispatch<SetStateAction<ShellMode>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  busyRef: { current: boolean };
  nidRef: { current: number };
  characterId: string;
  setCharacterId: Dispatch<SetStateAction<string>>;
  bootDone: boolean;
  setBootDone: Dispatch<SetStateAction<boolean>>;
  sessionHex: string;
  setSessionHex: Dispatch<SetStateAction<string>>;
  /** последний остаток квоты — тихая строка под завершённым раскладом */
  quotaRef: { current: { remaining?: number; limit?: number } };
  push: (partial: Omit<Entry, 'id'> & Record<string, unknown>) => number;
  pushOut: (lines: OutLine[], stagger?: boolean) => void;
  pushCmd: (text: string) => void;
  updateEntry: (id: number, patch: Partial<Entry>) => void;
  echoCmd: (text: string) => Promise<void>;
}

export function useTarotSession(): TarotSession {
  const [entries, setEntries] = useState<Entry[]>([{ id: 0, kind: 'boot' }]);
  const [bootDone, setBootDone] = useState(false);
  const [characterId, setCharacterId] = useState('shadow_walker');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ShellMode>('БУТ');
  const [sessionHex, setSessionHex] = useState('');
  const [scrollTick, setScrollTick] = useState(0);

  const nidRef = useRef(1);
  const busyRef = useRef(false);
  const quotaRef = useRef<{ remaining?: number; limit?: number }>({});

  // ── помощники журнала ──
  const push = useCallback((partial: Omit<Entry, 'id'> & Record<string, unknown>) => {
    const id = nidRef.current++;
    setEntries((prev) => [...prev, { ...(partial as object), id } as Entry]);
    setScrollTick((t) => t + 1);
    return id;
  }, []);

  const pushOut = useCallback((lines: OutLine[], stagger = false) => {
    push({ kind: 'out', lines, stagger });
  }, [push]);

  const pushCmd = useCallback((text: string) => {
    push({ kind: 'cmd', text });
  }, [push]);

  const updateEntry = useCallback((id: number, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as Entry) : e)));
    setScrollTick((t) => t + 1);
  }, []);

  // ── эхо команды с печатью посимвольно ──
  const echoCmd = useCallback(async (text: string) => {
    pushCmd(text);
    await sleep(typeDuration(text, 18));
  }, [pushCmd]);

  return {
    entries,
    setEntries,
    scrollTick,
    setScrollTick,
    mode,
    setMode,
    busy,
    setBusy,
    busyRef,
    nidRef,
    characterId,
    setCharacterId,
    bootDone,
    setBootDone,
    sessionHex,
    setSessionHex,
    quotaRef,
    push,
    pushOut,
    pushCmd,
    updateEntry,
    echoCmd,
  };
}