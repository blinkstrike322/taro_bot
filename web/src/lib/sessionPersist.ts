// ─────────────────────────────────────────────────────────────
// sessionPersist — восстановление сеанса после перезагрузки.
// Транскрипт сериализуется в localStorage (дебаунс); при возврате
// пользователь может поднять прошлый сеанс целиком.
// ─────────────────────────────────────────────────────────────
import type { Entry } from '@/lib/transcript';

const KEY = 'taro_session_v1';
const MAX_ENTRIES = 60;

interface SavedSession {
  version: 1;
  savedAt: number;
  entries: Entry[];
}

/** виды записей, которые переживают перезагрузку */
function isRestorable(e: Entry): boolean {
  switch (e.kind) {
    case 'cmd':
    case 'out':
    case 'json':
    case 'followup':
    case 'menu':
    case 'history':
    case 'ok':
    case 'error':
    case 'paywall':
      return true;
    // бут/мотд/прогрессы —Transient, пересоздаются заново;
    // карты (daily/spread) без завершённого чтения — зомби:
    // их шёпот уже не дождаться после рестарта
    default:
      return false;
  }
}

/** подготовить записи к сохранению: только переносимое */
function toRestorable(entries: Entry[]): Entry[] {
  return entries.filter(isRestorable).slice(-MAX_ENTRIES);
}

export function saveSession(entries: Entry[]): void {
  try {
    const restorable = toRestorable(entries);
    if (restorable.length === 0) return;
    const payload: SavedSession = {
      version: 1,
      savedAt: Date.now(),
      entries: restorable,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // квота/приватный режим — молча живём без восстановления
  }
}

export interface RestoredSession {
  entries: Entry[];
  savedAt: number;
  maxId: number;
}

export function loadSession(): RestoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSession;
    if (!data || data.version !== 1 || !Array.isArray(data.entries)) return null;

    const restored: Entry[] = [];
    let maxId = 0;
    for (const e of data.entries) {
      if (!e || typeof e.id !== 'number' || typeof e.kind !== 'string') continue;
      if (!isRestorable(e)) continue;
      // чтения из прошлого сеанса — сразу целиком, без стадий печати
      if (e.kind === 'json') {
        restored.push({ ...e, instant: true });
      } else {
        restored.push(e);
      }
      if (e.id > maxId) maxId = e.id;
    }
    if (restored.length === 0) return null;
    return { entries: restored, savedAt: data.savedAt ?? Date.now(), maxId };
  } catch {
    return null;
  }
}

export function peekSession(): { count: number; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSession;
    if (!data || data.version !== 1 || !Array.isArray(data.entries)) return null;
    const count = data.entries.filter(isRestorable).length;
    if (count === 0) return null;
    return { count, savedAt: data.savedAt ?? Date.now() };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
