import { describe, it, expect } from 'vitest';
import { findEchoes, type EchoCurrent } from '../echo';
import type { HistoryRow } from '@/lib/transcript';

// адаптация под снапшот: строка журнала — HistoryRow
// { id, type, question, created_at, cards_data?: { cards?: TarotCard[] } };
// TarotCard требует id/name/image_url/is_reversed (поле type — не spread_type).

const HOUR = 60 * 60 * 1000;
const OLD = 2 * HOUR; // старше 3-минутного окна «само-чтения»

let seq = 0;
function row(names: string[], ageMs: number = OLD, id?: string, question: string | null = null): HistoryRow {
  seq += 1;
  return {
    id: id ?? `row-${seq}`,
    type: 'three',
    question,
    created_at: new Date(Date.now() - ageMs).toISOString(),
    cards_data: {
      cards: names.map((name, i) => ({
        id: `card-${seq}-${i}`,
        name,
        image_url: `/cards/${i}.png`,
        is_reversed: false,
      })),
    },
  };
}

const current: EchoCurrent = {
  cards: [{ name: 'Луна' }, { name: 'Солнце' }, { name: 'Башня' }],
  question: 'он меня любит?',
  spreadLabel: 'три карты',
};

describe('findEchoes', () => {
  it('порог ≥2 общих карт для расклада из 3', () => {
    const rows = [
      row(['Луна', 'Солнце', 'Звезда']), // 2 общих — совпадение
      row(['Луна', 'Звезда', 'Маг']), // 1 общая — ниже порога
    ];
    const m = findEchoes(current, rows);
    expect(m).toHaveLength(1);
    expect(m[0]?.sharedCount).toBe(2);
    expect(m[0]?.sharedNames).toEqual(['Луна', 'Солнце']);
  });

  it('одиночное чтение — достаточно 1 общей карты', () => {
    const single: EchoCurrent = {
      cards: [{ name: 'Луна' }],
      question: null,
      spreadLabel: 'карта дня',
    };
    const m = findEchoes(single, [row(['Луна', 'Маг'])]);
    expect(m).toHaveLength(1);
    expect(m[0]?.sharedCount).toBe(1);
  });

  it('свежие строки (<3 мин) исключены — это само текущее чтение', () => {
    const rows = [
      row(['Луна', 'Солнце', 'Башня'], 0), // только что записано
      row(['Луна', 'Солнце', 'Мир'], OLD, 'old-row'),
    ];
    const m = findEchoes(current, rows);
    expect(m).toHaveLength(1);
    expect(m[0]?.row.id).toBe('old-row');
  });

  it('excludeDbId исключает строку инстант-разворота', () => {
    const rows = [row(['Луна', 'Солнце', 'Башня'], OLD, 'db-1')];
    expect(findEchoes(current, rows, 'db-1')).toHaveLength(0);
    expect(findEchoes(current, rows, 'db-other')).toHaveLength(1);
  });

  it('сортировка: общие ↓ → дата ↓; топ-3', () => {
    const rows = [
      row(['Луна', 'Солнце', 'Маг'], 5 * HOUR), // 2 общих, старее
      row(['Луна', 'Солнце', 'Башня'], 4 * HOUR), // 3 общих
      row(['Луна', 'Звезда', 'Колесница'], 3 * HOUR), // 1 общая
      row(['Луна', 'Башня', 'Император'], 2 * HOUR), // 2 общих, свежее
    ];
    const m = findEchoes(current, rows);
    expect(m.map((x) => x.sharedCount)).toEqual([3, 2, 2]);
    // топ-3: строка с 1 общей осталась за бортом
    expect(m).toHaveLength(3);
  });

  it('тот же вопрос и тот же набор карт — дубль, не отголосок', () => {
    const rows = [
      row(['Башня', 'Луна', 'Солнце'], OLD, undefined, 'он меня любит?'),
      row(['Луна', 'Солнце', 'Мир'], OLD, undefined, 'другой вопрос'),
    ];
    const m = findEchoes(current, rows);
    expect(m).toHaveLength(1);
    expect(m[0]?.row.question).toBe('другой вопрос');
  });
});
