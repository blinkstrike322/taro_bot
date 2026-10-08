// ─────────────────────────────────────────────────────────────
// arcana.ts — «личный аркан»: нумерологическое ядро даты
// рождения. Все цифры даты складываются, сумма редуцируется
// к 1-22 → старший аркан. Число даты рождения не меняется
// день ото дня — аркан один навсегда.
// Чистые функции без React: парсинг, валидация, вычисление.
// ─────────────────────────────────────────────────────────────
import deckJson from '@/lib/tarot-deck.json';

export interface DeckCard {
  id: string;
  name: string;
  arcana: string;
  suit: string | null;
  number: number;
  filename: string;
  upright: string;
  reversed: string;
}

const DECK: DeckCard[] = deckJson as DeckCard[];

/** один шаг редукции: выражение «2+5+0+…» и его сумма */
export interface ArcanaStep {
  expr: string;
  sum: number;
}

export interface ArcanaResult {
  /** нормализованная дата дд.мм.гггг */
  dateStr: string;
  /** все цифры даты (для первого шага) */
  digits: number[];
  /** цепочка редукции: первый шаг — сумма цифр даты, далее — свёртки */
  steps: ArcanaStep[];
  /** итог 1..22 (22 — числовой яд Шута, аркан №0) */
  core: number;
  /** найденный старший аркан */
  card: DeckCard;
}

export type ParsedDate =
  | { ok: true; dateStr: string; y: number; m: number; d: number }
  | { ok: false };

/**
 * разобрать дату рождения: дд.мм.гггг (разделители . - /),
 * год 1900-2100, месяц 1-12, день 1-31, возраст 0-130 лет.
 */
export function parseBirthDate(raw: string): ParsedDate {
  const m = raw.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!m) return { ok: false };
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);

  if (y < 1900 || y > 2100) return { ok: false };
  if (mo < 1 || mo > 12) return { ok: false };
  if (d < 1 || d > 31) return { ok: false };

  // возраст 0-130: не из будущего и не из глубины веков
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  if (age < 0 || age > 130) return { ok: false };

  const dateStr = `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${y}`;
  return { ok: true, dateStr, y, m: mo, d };
}

function digitSum(n: number): number {
  return String(n).split('').reduce((acc, ch) => acc + Number(ch), 0);
}

/**
 * вычислить личный аркан: сумма всех цифр даты, затем редукция
 * к 1-22 (пока >22 — складываем цифры суммы). 22 → аркан №0
 * (Шут: нумерологическое ядро «обнуляется» в нулевой аркан).
 */
export function computeArcana(dateStr: string): ArcanaResult | null {
  const digits = dateStr.replace(/\D/g, '').split('').map(Number);
  if (!digits.length) return null;

  let sum = digits.reduce((a, b) => a + b, 0);
  const steps: ArcanaStep[] = [{ expr: digits.join('+'), sum }];

  // редукция: сворачиваем сумму, пока она больше 22
  let guard = 0;
  while (sum > 22 && guard++ < 8) {
    // expr строится из ПРЕДЫДУЩЕЙ суммы (29 → «2+9»), а sum — уже свёрнутая
    const prev = sum;
    sum = digitSum(sum);
    steps.push({ expr: String(prev).split('').join('+'), sum });
  }
  if (sum < 1 || sum > 22) return null;

  // 22 — числовое ядро Шута: в колоде Шут имеет number 0
  const cardNumber = sum === 22 ? 0 : sum;
  const card = DECK.find((c) => c.arcana === 'major' && c.number === cardNumber);
  if (!card) return null;

  return { dateStr, digits, steps, core: sum, card };
}

/** локальный ключ сохранённой даты рождения */
export const ARCANA_LS_KEY = 'taro_arcana';

/** прочитать сохранённую дату (null — если нет или протухла) */
export function readSavedArcanaDate(): string | null {
  try {
    const raw = localStorage.getItem(ARCANA_LS_KEY);
    if (!raw) return null;
    const parsed = parseBirthDate(raw);
    return parsed.ok ? parsed.dateStr : null;
  } catch {
    return null;
  }
}

/** запомнить дату рождения (молча: квота — не наша беда) */
export function saveArcanaDate(dateStr: string): void {
  try {
    localStorage.setItem(ARCANA_LS_KEY, dateStr);
  } catch {}
}

/** забыть сохранённую дату (taro arcana --new) */
export function forgetArcanaDate(): void {
  try {
    localStorage.removeItem(ARCANA_LS_KEY);
  } catch {}
}
