// ─────────────────────────────────────────────────────────────
// week.ts — «дайджест недели»: чистая агрегация журнала за 7 дней.
// Никакого React и сети — только строки HistoryRow. Клиент зовёт
// после API.getReadingsDays(7), результат летит и в блок, и в
// /api/week для LLM-рефлексии.
// ─────────────────────────────────────────────────────────────
import type { HistoryRow } from '@/lib/transcript';
import { spreadLabelFromType } from '@/lib/transcript';
import { getGuide } from '@/lib/guides';

/** окно дайджеста — ровно неделя */
export const WEEK_DAYS = 7;

/** топ карт в списке: топ-1 — герой блока, остальные — рядом */
export const WEEK_TOP_CARDS = 5;

export interface WeekDigest {
  /** всего чтений за окно */
  total: number;
  /** уникальных дат с чтениями */
  days_active: number;
  /** русское имя расклада → число чтений (сортировка ↓) */
  spread_counts: Record<string, number>;
  /** имя карты → число выпадений (сортировка ↓, топ-5, реверсы не важны) */
  card_counts: Record<string, number>;
  /** имя проводника → число чтений его голосом */
  guide_counts: Record<string, number>;
  /** непустые вопросы, до 5 */
  questions: string[];
  /** границы окна для шапки: «дд ммм — дд ммм» */
  date_from: string;
  date_to: string;
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «дд ммм» из ISO — для шапки дайджеста */
export function formatWeekDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;
}

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
 * Агрегация журнала за 7 дней: числа, имена, вопросы.
 *
 * · total — все строки;
 * · days_active — уникальные локальные даты;
 * · spread_counts — русские имена через spreadLabelFromType;
 * · card_counts — имена карт, реверс не важен (повтор реверса
 *   и прямая — одна карта), топ-5;
 * · guide_counts — имена проводников из character_id;
 * · questions — непустые, до 5.
 */
export function buildWeekDigest(rows: HistoryRow[]): WeekDigest {
  const spreads = new Map<string, number>();
  const cards = new Map<string, number>();
  const guides = new Map<string, number>();
  const questions: string[] = [];
  const activeDays = new Set<string>();

  for (const row of rows) {
    // локальная дата «гггг-мм-дд» — уникальный день с картами
    const d = new Date(row.created_at);
    if (!Number.isNaN(d.getTime())) {
      activeDays.add(
        `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      );
    }

    const label = spreadLabelFromType(row.type);
    spreads.set(label, (spreads.get(label) ?? 0) + 1);

    // повтор реверса и прямой карты — один голос колоды
    for (const c of rowCards(row)) {
      const name = c.name.trim();
      cards.set(name, (cards.get(name) ?? 0) + 1);
    }

    if (row.character_id) {
      const gName = getGuide(row.character_id).name;
      guides.set(gName, (guides.get(gName) ?? 0) + 1);
    }

    const q = (row.question ?? '').trim();
    if (q.length > 0 && questions.length < 5) questions.push(q);
  }

  // топ-5 карт: топ-1 — «карта недели»
  const cardCountsFull = sortedCounts(cards);
  const cardCounts: Record<string, number> = {};
  for (const [k, n] of Object.entries(cardCountsFull).slice(0, WEEK_TOP_CARDS)) {
    cardCounts[k] = n;
  }

  // границы окна: сегодня − 6 дней … сегодня
  const now = new Date();
  const from = new Date(now.getTime() - (WEEK_DAYS - 1) * 86400000);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`;

  return {
    total: rows.length,
    days_active: activeDays.size,
    spread_counts: sortedCounts(spreads),
    card_counts: cardCounts,
    guide_counts: sortedCounts(guides),
    questions,
    date_from: fmt(from),
    date_to: fmt(now),
  };
}
