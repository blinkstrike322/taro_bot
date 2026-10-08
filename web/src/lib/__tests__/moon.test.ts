import { describe, it, expect } from 'vitest';
import { moonPhase } from '../moon';

describe('moonPhase', () => {
  it('2000-01-06 — новолуние (эпоха формулы)', () => {
    const p = moonPhase(new Date('2000-01-06T18:14:00Z'));
    expect(p.phaseIndex).toBe(0);
    expect(p.illum).toBeLessThan(0.05);
  });
  it('2026-10-26 — полнолуние 100%', () => {
    const p = moonPhase(new Date('2026-10-26T00:00:00Z'));
    expect(p.phaseIndex).toBe(4);
    expect(p.illum).toBeGreaterThan(0.95);
  });
  it('illum в [0,1], nextFull/nextNew положительны', () => {
    for (let d = 0; d < 30; d++) {
      const p = moonPhase(new Date(2026, 9, 1 + d));
      expect(p.illum).toBeGreaterThanOrEqual(0);
      expect(p.illum).toBeLessThanOrEqual(1);
      expect(p.nextFull).toBeGreaterThan(0);
      expect(p.nextNew).toBeGreaterThan(0);
    }
  });
});
