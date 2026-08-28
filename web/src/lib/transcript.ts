// ─────────────────────────────────────────────────────────────
// transcript.ts — модель записей терминального скроллбэка.
// Весь флоу приложения — это растущий журнал: команды,
// вывод, меню, карты, JSON. Никаких модалок и экранов.
// ─────────────────────────────────────────────────────────────
import type { TarotCard } from '@/components/Card';
import type { Interpretation } from '@/lib/api';

export type OutTone =
  | 'plain' | 'dim' | 'faint' | 'ok' | 'err' | 'warn'
  | 'info' | 'accent' | 'bright' | 'comment';

export interface OutLine {
  text: string;
  tone?: OutTone;
}

export interface HistoryRow {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
}

export type Entry =
  | { id: number; kind: 'cmd'; text: string }
  | { id: number; kind: 'out'; lines: OutLine[]; stagger?: boolean }
  | { id: number; kind: 'boot' }
  | { id: number; kind: 'motd' }
  | { id: number; kind: 'progress'; label: string; durMs: number }
  /** неопределённое ожидание шёпота — рыщущий бар, живёт пока канал думает */
  | { id: number; kind: 'pending'; label: string }
  | {
      id: number; kind: 'daily'; card: TarotCard; flipped: boolean;
      interpretation: Interpretation | null;
      /** шёпот уже доставлен из канала — можно вскрывать без паузы */
      whisperReady?: boolean;
    }
  | {
      id: number; kind: 'spread';
      cards: TarotCard[]; flipped: boolean[];
      question: string | null;
      interpretation: Interpretation | null;
      spreadLabel: string; count: 1 | 3;
      whisperReady?: boolean;
    }
  | {
      id: number; kind: 'json';
      interpretation: Interpretation;
      cards: TarotCard[];
      question: string | null;
      spreadLabel: string;
    }
  | { id: number; kind: 'menu'; menuId: 'catalog' | 'guides' }
  | { id: number; kind: 'history'; rows: HistoryRow[] }
  | { id: number; kind: 'error'; msg: string }
  | { id: number; kind: 'ok'; msg: string };

// ── шёпот системы — вкусовые реплики между делами ──
export const WHISPERS: string[] = [
  'тени перешёптываются',
  'где-то далеко скрипнула свеча',
  'луна одобряет',
  'канал стабилен. помехи минимальны',
  'карты дышат в такт',
  'эхо пустоты вернулось с ответом',
  'связь с продавцом тумана восстановлена',
];

export function randomWhisper(): string {
  return WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
}

export function randomHex(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dd} ${months[d.getMonth()]} · ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
