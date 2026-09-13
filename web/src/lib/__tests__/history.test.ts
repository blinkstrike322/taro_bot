// History helper contracts — spread label mapping and legacy/current card-format
// normalization used when a stored reading is re-rendered from the journal.

import { describe, it, expect } from 'vitest';
import { spreadLabelFromType } from '@/lib/transcript';
import { cardsFromHistory } from '@/hooks/useHistory';

describe('transcript / spreadLabelFromType', () => {
  it('maps known session types to human labels', () => {
    expect(spreadLabelFromType('daily')).toBe('карта дня');
    expect(spreadLabelFromType('spread_1')).toBe('одна карта');
    expect(spreadLabelFromType('spread_3')).toBe('три карты');
  });

  it('returns the raw type string for unknown types', () => {
    expect(spreadLabelFromType('some_unknown')).toBe('some_unknown');
  });
});

describe('useHistory / cardsFromHistory format compat', () => {
  it('reads the current format { cards, spread_type }', () => {
    const result = cardsFromHistory({
      cards: [
        { id: 'moon', name: 'Луна', orientation: 'upright' },
        { id: 'star', name: 'Звезда', is_reversed: true },
      ],
      spread_type: 'spread_3',
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'moon',
      name: 'Луна',
      image_url: '/cards/moon.png',
      is_reversed: false,
    });
    expect(result[1]).toEqual({
      id: 'star',
      name: 'Звезда',
      image_url: '/cards/star.png',
      is_reversed: true,
    });
  });

  it('reads the legacy daily-card format { chosen_card }', () => {
    const result = cardsFromHistory({
      chosen_index: 2,
      chosen_card: { id: 'sun', name: 'Солнце', orientation: 'reversed' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'sun',
      name: 'Солнце',
      image_url: '/cards/sun.png',
      is_reversed: true, // derived from orientation === 'reversed'
    });
  });

  it('maps is_reversed from a Boolean is_reversed field', () => {
    const result = cardsFromHistory({
      cards: [{ id: 'a', name: 'A', is_reversed: false }],
    });
    expect(result[0]?.is_reversed).toBe(false);
  });

  it('drops incomplete entries and returns [] for empty data', () => {
    expect(cardsFromHistory({ cards: [{ id: 'x' }, { name: 'no-id' }, { id: 'ok', name: 'OK' }] })).toHaveLength(1);
    expect(cardsFromHistory({})).toEqual([]);
    expect(cardsFromHistory({ cards: [] })).toEqual([]);
    expect(cardsFromHistory(undefined)).toEqual([]);
    expect(cardsFromHistory(null)).toEqual([]);
  });
});