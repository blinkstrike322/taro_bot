// ─────────────────────────────────────────────────────────────
// month.ts — «месячный дайджест»: агрегация журнала за текущий
// календарный месяц. Клиент тянет окно 62 дня (API days=62) и
// фильтрует по локальному месяцу — так день месяца не важен,
// дайджест всегда смотрит на месяц целиком. Паттерн — week.ts,
// плюс две секции, которых нет у недели: полоса дней месяца
// (день за днём) и баланс аркан (старшие против мастей).
// ─────────────────────────────────────────────────────────────
import type { HistoryRow } from '@/lib/transcript';
import { spreadLabelFromType } from '@/lib/transcript';
import { getGuide } from '@/lib/guides';
import deckJson from '@/lib/tarot-deck.json';

/** окно запроса: 62 дня гарантируют захват любого календарного
 *  месяца независимо от сегодняшнего числа */
export const MONTH_WINDOW_DAYS = 62;

/** топ карт в списке: топ-1 — карта месяца */
export const MONTH_TOP_CARDS = 6;

/** сколько дней показывать в полосе месяца с данными и без */
export interface MonthDay {
  /** число месяца, 1..N */
  day: number;
  /** чтений в этот день */
  count: number;
}

export interface MonthDigest {
  /** всего чтений за календарный месяц */
  total: number;
  /** уникальных дат с чтениями */
  days_active: number;
  /** дней в месяце по календарю */
  days_in_month: number;
  /** номер месяца 0-11 — для шапки */
  month_idx: number;
  /** полное русское имя месяца — «октябрь» */
  month_name: string;
  /** год месяца */
  year: number;
  /** русское имя расклада → число чтений (сортировка ↓) */
  spread_counts: Record<string, number>;
  /** имя карты → число выпадений (топ-6, реверс не важен) */
  card_counts: Record<string, number>;
  /** имя проводника → число чтений его голосом */
  guide_counts: Record<string, number>;
  /** старшие арканы: число выпадений */
  majors: number;
  /** масть → выпадений (кубки/жезлы/мечи/пентакли) */
  suit_counts: Record<string, number>;
  /** день за днём: полоса активностей месяца */
  days: MonthDay[];
  /** непустые вопросы, до 6 */
  questions: string[];
}

const MONTHS_FULL = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/** масть карты по имени — из колоды (полнее, чем стема имени) */
interface DeckEntry {
  name: string;
  arcana: string;
  suit: string;
}
const DECK: DeckEntry[] = deckJson as DeckEntry[];
const SUIT_BY_NAME = new Map(DECK.map((c) => [c.name, c.suit]));
const MAJOR_BY_NAME = new Set(
  DECK.filter((c) => c.arcana === 'major').map((c) => c.name),
);

/** карты строки журнала (cards_data — объект или массив) */
function rowCards(row: HistoryRow): { name: string }[] {
  const data = row.cards_data;
  const cards = Array.isArray(data)
    ? data
    : Array.isArray(data?.cards)
      ? data.cards
      : [];
  return cards.filter((c) => typeof c?.name === 'string' && c.name.trim().length > 0);
}

/** «имя → N» в стабильный порядок: число ↓, имя по алфавиту */
function sortedCounts(map: Map<string, number>): Record<string, number> {
  const entries = [...map.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'),
  );
  const out: Record<string, number> = {};
  for (const [k, n] of entries) out[k] = n;
  return out;
}

/**
 * Агрегация журнала за текущий календарный месяц.
 *
 * · строки вне локального месяца отбрасываются — окно 62 дня
 *   шире месяца, фильтр честный;
 * · days — полоса месяца: каждый календарный день и его счёт;
 * · majors/suit_counts — баланс аркан: как часто колода брала
 *   старшими против мелких, и какая масть звучала чаще.
 */
export function buildMonthDigest(rows: HistoryRow[]): MonthDigest {
  const now = new Date();
  const monthIdx = now.getMonth();
  const year = now.getFullYear();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  // фильтр к текущему календарному месяцу
  const inMonth = rows.filter((row) => {
    const d = new Date(row.created_at);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === monthIdx;
  });

  const spreads = new Map<string, number>();
  const cards = new Map<string, number>();
  const guides = new Map<string, number>();
  const questions: string[] = [];
  const dayCounts = new Map<number, number>();
  let majors = 0;
  const suits = new Map<string, number>();

  for (const row of inMonth) {
    const d = new Date(row.created_at);
    if (!Number.isNaN(d.getTime())) {
      dayCounts.set(d.getDate(), (dayCounts.get(d.getDate()) ?? 0) + 1);
    }

    const label = spreadLabelFromType(row.type);
    spreads.set(label, (spreads.get(label) ?? 0) + 1);

    for (const c of rowCards(row)) {
      const name = c.name.trim();
      cards.set(name, (cards.get(name) ?? 0) + 1);
      if (MAJOR_BY_NAME.has(name)) {
        majors++;
      } else {
        const suit = SUIT_BY_NAME.get(name);
        if (suit) suits.set(suit, (suits.get(suit) ?? 0) + 1);
      }
    }

    if (row.character_id) {
      const gName = getGuide(row.character_id).name;
      guides.set(gName, (guides.get(gName) ?? 0) + 1);
    }

    const q = (row.question ?? '').trim();
    if (q.length > 0 && questions.length < 6) questions.push(q);
  }

  // топ-6 карт: топ-1 — «карта месяца»
  const cardCountsFull = sortedCounts(cards);
  const cardCounts: Record<string, number> = {};
  for (const [k, n] of Object.entries(cardCountsFull).slice(0, MONTH_TOP_CARDS)) {
    cardCounts[k] = n;
  }

  const days: MonthDay[] = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    count: dayCounts.get(i + 1) ?? 0,
  }));

  return {
    total: inMonth.length,
    days_active: dayCounts.size,
    days_in_month: daysInMonth,
    month_idx: monthIdx,
    month_name: MONTHS_FULL[monthIdx],
    year,
    spread_counts: sortedCounts(spreads),
    card_counts: cardCounts,
    guide_counts: sortedCounts(guides),
    majors,
    suit_counts: sortedCounts(suits),
    days,
    questions,
  };
}
