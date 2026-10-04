// ─────────────────────────────────────────────────────────────
// transcript.ts — модель записей терминального скроллбэка.
// Весь флоу приложения — это растущий журнал: команды,
// вывод, меню, карты, JSON. Никаких модалок и экранов.
// ─────────────────────────────────────────────────────────────
import type { TarotCard } from '@/components/Card';
import type { Interpretation } from '@/lib/api';
import { GUIDES } from '@/lib/guides';
import { SPREADS } from '@/lib/spreads';

export type OutTone =
  | 'plain' | 'dim' | 'faint' | 'ok' | 'err' | 'warn'
  | 'info' | 'accent' | 'bright' | 'comment';

export interface OutLine {
  text: string;
  tone?: OutTone;
}

/** Строка журнала — несёт полные данные чтения, чтобы тап
 *  разворачивал сеанс в том же виде, каким он был изначально. */
export interface HistoryRow {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
  /** полные карты расклада (вариант: {cards: [...], spread_type} | {chosen_card}) */
  cards_data?: any;
  /** сохранённое толкование */
  interpretation?: Interpretation;
  /** проводник сеанса — влияет на акцент повторного рендера */
  character_id?: string;
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
      spreadLabel: string; count: number;
      /** id расклада каталога (в журнале — spread_<id>) */
      spreadId?: string;
      /** макет расклада из каталога (column1/pyramid/trio/spine/pentagram/arc) */
      layout?: string;
      /** порядок вскрытия карт — ключи позиций (position_keys бэкенда или каталог) */
      flipOrder?: string[];
      /** ключи позиций от бэкенда — Task 10 читает при рендере */
      positionKeys?: string[];
      /** имена позиций расклада от бэкенда (замена легаси П/Н/Б) */
      positions?: string[];
      whisperReady?: boolean;
    }
  | {
      id: number; kind: 'json';
      interpretation: Interpretation;
      cards: TarotCard[];
      question: string | null;
      spreadLabel: string;
      /** мгновенный рендер без посимвольной печати (повторный просмотр из журнала) */
      instant?: boolean;
      /** проводник сеанса — для повторного рендера в цвете оригинала */
      characterId?: string;
    }
  | { id: number; kind: 'menu'; menuId: 'catalog' | 'guides' }
  | { id: number; kind: 'history'; rows: HistoryRow[] }
  | { id: number; kind: 'error'; msg: string }
  | { id: number; kind: 'ok'; msg: string }
  /** пелена сомкнулась — продуктовый paywall в стилистике ARCANUM */
  | { id: number; kind: 'paywall'; msg: string };

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

export function randomWhisper(guideId?: string | null): string {
  const pool = guideId ? GUIDES[guideId]?.whispers : undefined;
  const source = pool && pool.length ? pool : WHISPERS;
  return source[Math.floor(Math.random() * source.length)];
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
    // Safari строг к не-ISO строкам: new Date('2026-01-01 10:00') не бросает,
    // а возвращает Invalid Date → getDate() = NaN без этой проверки.
    if (Number.isNaN(d.getTime())) return iso;
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dd} ${months[d.getMonth()]} · ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

/** Метка расклада по типу записи журнала. */
export function spreadLabelFromType(type: string): string {
  if (type === 'daily') return 'карта дня';
  if (type === 'spread_1') return 'одна карта';
  if (type === 'spread_3') return 'три карты';
  if (type.startsWith('spread_')) {
    const id = type.slice('spread_'.length);
    if (SPREADS[id]) return SPREADS[id].name;
  }
  return type;
}
