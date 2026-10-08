import { describe, it, expect } from 'vitest';
import { buildWeekDigest } from '../week';
import type { HistoryRow } from '@/lib/transcript';

// снапшот: buildWeekDigest(rows: HistoryRow[]) — реверс и прямая
// карты считаются под одним именем (is_reversed в ключ не входит).

let seq = 0;
function row(names: { name: string; is_reversed?: boolean }[], ageMs: number = 0, type = 'daily'): HistoryRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    type,
    question: null,
    created_at: new Date(Date.now() - ageMs).toISOString(),
    cards_data: {
      cards: names.map((c, i) => ({
        id: `card-${seq}-${i}`,
        name: c.name,
        image_url: `/cards/${i}.png`,
        is_reversed: c.is_reversed ?? false,
      })),
    },
  };
}

describe('buildWeekDigest', () => {
  it('пустой журнал → total 0 и пустые счётчики', () => {
    const d = buildWeekDigest([]);
    expect(d.total).toBe(0);
    expect(d.days_active).toBe(0);
    expect(d.spread_counts).toEqual({});
    expect(d.card_counts).toEqual({});
    expect(d.guide_counts).toEqual({});
    expect(d.questions).toEqual([]);
  });

  it('реверс и прямая одной карты — одно имя, оба голоса', () => {
    const d = buildWeekDigest([
      row([{ name: 'Луна' }]),
      row([{ name: 'Луна', is_reversed: true }]),
    ]);
    expect(Object.keys(d.card_counts)).toEqual(['Луна']);
    expect(d.card_counts['Луна']).toBe(2);
  });

  it('считает total, дни, расклады и вопросы', () => {
    const d = buildWeekDigest([
      row([{ name: 'Луна' }], 0, 'daily'),
      row([{ name: 'Солнце' }], 48 * 3600 * 1000, 'pentagram'),
    ]);
    expect(d.total).toBe(2);
    expect(d.days_active).toBe(2); // сегодня и позавчера
    expect(d.spread_counts['карта дня']).toBe(1); // spreadLabelFromType('daily')
    expect(d.spread_counts['пентаграмма']).toBe(1);
    expect(d.card_counts['Луна']).toBe(1);
    expect(d.card_counts['Солнце']).toBe(1);
  });
});
