import { describe, it, expect, vi } from 'vitest';
import { punctDelay } from '@/lib/typeFlow';

describe('punctDelay', () => {
  it('pauses on sentence ends', () => {
    expect(punctDelay('.')).toBe(120);
    expect(punctDelay('!')).toBe(120);
    expect(punctDelay('…')).toBe(120);
  });
  it('short pause on commas', () => {
    expect(punctDelay(',')).toBe(50);
    expect(punctDelay('—')).toBe(50);
  });
  it('no pause on letters', () => {
    expect(punctDelay('а')).toBe(0);
  });
});