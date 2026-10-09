// History helper contracts — формат-normalization cards_data при повторном
// развороте чтения из журнала (открытие по тапу в истории и в отголосках).
// Три исторических формата: массив карт, { cards, spread_type } (текущий)
// и { chosen_index, chosen_card } (легаси карты дня).

import { describe, it, expect } from 'vitest';
import { cardsFromHistory } from '@/hooks/useHistory';

describe('useHistory / cardsFromHistory format compat', () => {
  it('passes a plain cards array through', () => {
    const arr = [
      { id: 'moon', name: 'Луна', image_url: '/cards/the-moon.png', is_reversed: false },
    ];
    expect(cardsFromHistory(arr)).toEqual(arr);
  });

  it('reads the current format { cards, spread_type }', () => {
    const result = cardsFromHistory({
      cards: [
        { id: 'moon', name: 'Луна', image_url: '', is_reversed: false },
        { id: 'star', name: 'Звезда', image_url: '', is_reversed: true },
      ],
      spread_type: 'spread_3',
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'moon', name: 'Луна', image_url: '', is_reversed: false });
  });

  it('reads the legacy daily-card format { chosen_index, chosen_card }', () => {
    const result = cardsFromHistory({
      chosen_index: 2,
      chosen_card: { id: 'sun', name: 'Солнце', image_url: '', is_reversed: false },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'sun', name: 'Солнце', image_url: '', is_reversed: false });
  });

  it('returns [] for empty/unknown data', () => {
    expect(cardsFromHistory({})).toEqual([]);
    expect(cardsFromHistory({ cards: [] })).toEqual([]);
    expect(cardsFromHistory(undefined)).toEqual([]);
    expect(cardsFromHistory(null)).toEqual([]);
  });
});
