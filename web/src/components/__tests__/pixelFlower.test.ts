import { describe, it, expect } from 'vitest';
import { generateIris, GRID_W, GRID_H } from '../pixelFlowerCore';

describe('generateIris v2', () => {
  it('returns cells within grid bounds', () => {
    const cells = generateIris(7);
    expect(cells.length).toBeGreaterThan(1500);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(GRID_W);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(GRID_H);
    }
  });

  it('deterministic per seed', () => {
    const a = JSON.stringify(generateIris(11));
    const b = JSON.stringify(generateIris(11));
    const c = JSON.stringify(generateIris(12));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('has filaments and buds organs', () => {
    const cells = generateIris(3);
    const organs = new Set(cells.map((c) => c.organ));
    expect(organs.has(8)).toBe(true);
    expect(organs.has(9)).toBe(true);
    expect(organs.has(10)).toBe(true);
    expect(organs.has(11)).toBe(true);
  });
});
