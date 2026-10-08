// ─────────────────────────────────────────────────────────────
// chronicle.ts — «хроника карты»: вся история выпадений аркана
// в журнале оператора. Чистые функции без React и сети: имя →
// карта колоды (с forgiving-поиском), строки журнала → события
// хроники (дата, расклад, ориентация, вопрос, голос).
// ─────────────────────────────────────────────────────────────
import deckJson from '@/lib/tarot-deck.json';
import type { HistoryRow } from '@/lib/transcript';

export interface ChronicleCard {
  id: string;
  name: string;
  arcana: string;
  suit: string | null;
  number: number;
  filename: string;
  upright: string;
  reversed: string;
}

const DECK: ChronicleCard[] = deckJson as ChronicleCard[];

/** нормализация запроса: lowercase, ё→е, лишние пробелы */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е');
}

/** сколько строк показать в подсказке о неоднозначности */
const AMBIGUOUS_LIMIT = 5;

export interface CardQueryResult {
  status: 'ok' | 'ambiguous' | 'notfound';
  card?: ChronicleCard;
  /** кандидаты для уточнения (ambiguous / notfound-подсказки) */
  matches: ChronicleCard[];
}

/** стемы мастей: «мечи» находит всех мечей (в колоде — родительный
 *  падеж «Двойка Мечей», прямой contains не сработает) */
const SUIT_STEMS: Record<string, string> = {
  'мечи': 'меч', 'меч': 'меч',
  'жезлы': 'жезл', 'жезл': 'жезл', 'посохи': 'жезл', 'посох': 'жезл',
  'кубки': 'кубк', 'кубок': 'кубк', 'чаши': 'кубк', 'чаша': 'кубк',
  'пентакли': 'пентакл', 'пентакль': 'пентакл', 'монеты': 'пентакл', 'монета': 'пентакл',
  'старшие': 'старш', 'старший': 'старш', 'мажоры': 'старш',
};

/**
 * поиск карты по имени: точное совпадение → contains-совпадения →
 * стемы мастей. «дама мечей», «Дама Мечей», «мечи» — находят своих.
 */
export function resolveCardQuery(query: string): CardQueryResult {
  const q = norm(query);
  if (!q) return { status: 'notfound', matches: [] };

  // точное имя или id («the-fool», «the fool»)
  const exact = DECK.find(
    (c) => norm(c.name) === q || c.id === q || norm(c.id) === q,
  );
  if (exact) return { status: 'ok', card: exact, matches: [exact] };

  // вхождение: «шут» найдёт «Шут», «меч» — всех мечей
  let contains = DECK.filter((c) => norm(c.name).includes(q));
  // стем масти: «мечи» → «меч» — найти родительный падеж колоды
  if (contains.length === 0 && SUIT_STEMS[q]) {
    contains = DECK.filter((c) => norm(c.name).includes(SUIT_STEMS[q]));
  }
  if (contains.length === 1) {
    return { status: 'ok', card: contains[0], matches: contains };
  }
  if (contains.length > 1) {
    return { status: 'ambiguous', matches: contains.slice(0, 12) };
  }

  // id с вхождением: «fool» найдёт the-fool
  const idContains = DECK.filter((c) => norm(c.id).includes(q));
  if (idContains.length >= 1) {
    if (idContains.length === 1) {
      return { status: 'ok', card: idContains[0], matches: idContains };
    }
    return { status: 'ambiguous', matches: idContains.slice(0, 12) };
  }

  // ничего: подсказки — первые по алфавиту, пусть назовёт точнее
  return {
    status: 'notfound',
    matches: DECK.slice(0, AMBIGUOUS_LIMIT),
  };
}

/** одно событие хроники: как карта выпала в конкретном чтении */
export interface ChronicleEvent {
  /** ISO-дата чтения */
  created_at: string;
  /** русское имя расклада (spreadLabelFromType уже применён) */
  spreadLabel: string;
  /** легла перевёрнутой? */
  reversed: boolean;
  /** вопрос чтения (если был) */
  question: string | null;
  /** голос проводника (строки без character_id — легаси) */
  character_id?: string;
}

export interface Chronicle {
  /** события, свежие сверху */
  events: ChronicleEvent[];
  /** всего выпадений */
  total: number;
  /** перевёрнутых из них */
  reversedCount: number;
  /** первый/последний раз (ISO), null — никогда */
  firstAt: string | null;
  lastAt: string | null;
}

/** карты строки журнала (cards_data — объект или массив) */
function rowCards(row: HistoryRow): { name: string; is_reversed?: boolean }[] {
  const data = row.cards_data;
  const cards = Array.isArray(data)
    ? data
    : Array.isArray(data?.cards)
      ? data.cards
      : [];
  return cards.filter(
    (c) => typeof c?.name === 'string' && c.name.trim().length > 0,
  );
}

/**
 * собрать хронику карты из строк журнала: где имя совпало —
 * фиксируем событие. Строки приходят desc — события уже свежие
 * сверху; первый раз = последний элемент.
 */
export function buildChronicle(
  cardName: string,
  rows: HistoryRow[],
  spreadLabelOf: (type: string) => string,
): Chronicle {
  const target = norm(cardName);
  const events: ChronicleEvent[] = [];

  for (const row of rows) {
    let fellReversed = false;
    let found = false;
    for (const c of rowCards(row)) {
      if (norm(c.name) === target) {
        found = true;
        fellReversed = Boolean(c.is_reversed);
        break; // одна карта в чтении достаточно
      }
    }
    if (!found) continue;
    events.push({
      created_at: row.created_at,
      spreadLabel: spreadLabelOf(row.type),
      reversed: fellReversed,
      question: row.question ?? null,
      character_id: row.character_id,
    });
  }

  const total = events.length;
  const reversedCount = events.filter((e) => e.reversed).length;
  return {
    events,
    total,
    reversedCount,
    firstAt: total > 0 ? events[total - 1].created_at : null,
    lastAt: total > 0 ? events[0].created_at : null,
  };
}

/** дд мес гггг для хроники (год важен: события бывают давние) */
export function chronicleDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** сколько событий показываем в таймлайне — не лента, а выборка */
export const CHRONICLE_TIMELINE_LIMIT = 8;
