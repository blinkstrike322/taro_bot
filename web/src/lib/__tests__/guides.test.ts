// Guide metadata contract — getGuide per id + fallback for unknown ids.
// Each guide in the palette has a distinct visual identity (accent/cardBack/tag).

import { describe, it, expect } from 'vitest';
import { GUIDES, getGuide, GUIDE_IDS } from '@/lib/guides';

describe('guides / getGuide metadata', () => {
  it('resolves the three known guides by id', () => {
    expect(getGuide('shadow_walker')?.name).toBe('Странница Теней');
    expect(getGuide('ruin_keeper')?.name).toBe('Хранитель Руин');
    expect(getGuide('spark_of_chaos')?.name).toBe('Искра Хаоса');
  });

  it('falls back to shadow_walker for an unknown id', () => {
    const unknown = getGuide('does_not_exist');
    expect(unknown?.name).toBe('Странница Теней');
    expect(unknown?.id).toBe('shadow_walker');
  });

  it('falls back to shadow_walker for undefined/null id', () => {
    expect(getGuide(undefined)?.id).toBe('shadow_walker');
    expect(getGuide(null)?.id).toBe('shadow_walker');
  });

  it('every guide in the palette has distinct visual identity', () => {
    expect(GUIDE_IDS).toEqual(['shadow_walker', 'ruin_keeper', 'spark_of_chaos']);
    const accents = GUIDE_IDS.map((id) => GUIDES[id].accent);
    // All three accents are pairwise different.
    expect(new Set(accents).size).toBe(3);
    // Card backs and tags differ per guide too.
    const backs = GUIDE_IDS.map((id) => GUIDES[id].cardBack);
    expect(new Set(backs).size).toBe(3);
    const tags = GUIDE_IDS.map((id) => GUIDES[id].tag);
    expect(new Set(tags).size).toBe(3);
  });
});