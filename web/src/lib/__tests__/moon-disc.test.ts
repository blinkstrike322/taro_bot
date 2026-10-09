import { describe, it, expect } from 'vitest';
import { SYNODIC, moonDiscPaths, moonPhase } from '../moon';

// ─────────────────────────────────────────────────────────────
// moonDiscPaths — векторный диск луны для MoonBlock: тёмный
// диск + освещённый сегмент через эллиптическую дугу-терминатор.
// Проверяем все 8 фаз циклом дат: геометрия пути, зеркальность
// роста/убывания, края цикла (новолуние/полнолуние/четверть).
// ─────────────────────────────────────────────────────────────

const R = 46;
const DISC = `M50 4A46 46 0 1 1 50 96A46 46 0 1 1 50 4Z`;

/** разобрать путь светлой части: флаги полуокружности, rx терминатора, флаг терминатора */
function parseLit(lit: string): { side: number; rx: number; term: number } {
  const m = /^M50 4A46 46 0 0 (\d) 50 96A([\d.]+) 46 0 0 (\d) 50 4Z$/.exec(lit);
  expect(m, `путь не разобран: ${lit}`).toBeTruthy();
  return { side: Number(m![1]), rx: Number(m![2]), term: Number(m![3]) };
}

/** ожидаемые флаги по фазе: та же математика, что у MoonGlyph */
function expectedFlags(illum: number, waning: boolean): { side: number; term: number } {
  const k = Math.min(0.998, Math.max(0.002, illum));
  const gib = k > 0.5;
  return {
    side: waning ? 0 : 1,
    term: waning ? (gib ? 0 : 1) : (gib ? 1 : 0),
  };
}

describe('moonDiscPaths', () => {
  it('тёмный диск — стабильная окружность из двух дуг', () => {
    expect(moonDiscPaths(0.3, false).disc).toBe(DISC);
    expect(moonDiscPaths(0.9, true).disc).toBe(DISC);
  });

  it('все 8 фаз цикла дат рисуются: флаги и rx честны по illum/waning', () => {
    // 35 дней подряд накрывают синодический месяц (29.53) — все 8 сегментов
    const seen = new Set<number>();
    for (let d = 0; d < 35; d++) {
      const p = moonPhase(new Date(2026, 8, 20 + d));
      seen.add(p.phaseIndex);
      const { disc, lit } = moonDiscPaths(p.illum, p.waning);
      expect(disc).toBe(DISC);
      const f = parseLit(lit);
      const exp = expectedFlags(p.illum, p.waning);
      expect(f.side, `phaseIndex ${p.phaseIndex}: сторона света`).toBe(exp.side);
      expect(f.term, `phaseIndex ${p.phaseIndex}: выпуклость терминатора`).toBe(exp.term);
      // rx терминатора: 0 (четверть) .. R (серп/полная), по illum
      const k = Math.min(0.998, Math.max(0.002, p.illum));
      const expRx = R * (k > 0.5 ? 2 * k - 1 : 1 - 2 * k);
      expect(f.rx).toBeGreaterThanOrEqual(0);
      expect(f.rx).toBeLessThanOrEqual(R);
      expect(Math.abs(f.rx - expRx)).toBeLessThan(0.06);
    }
    expect(seen.size, 'цикл дат должен пройти все 8 фаз').toBe(8);
  });

  it('новолуние: свет — тонкий серп (rx почти R), рост — свет справа', () => {
    const p = moonPhase(new Date('2000-01-06T18:14:00Z')); // эпоха формулы
    expect(p.illum).toBeLessThan(0.05);
    const f = parseLit(moonDiscPaths(p.illum, p.waning).lit);
    expect(f.side).toBe(1);
    expect(f.rx).toBeGreaterThan(R * 0.95);
  });

  it('полнолуние: свет — почти весь диск (rx почти R), терминатор выгнут в тёмную', () => {
    const p = moonPhase(new Date('2026-10-26T00:00:00Z'));
    expect(p.illum).toBeGreaterThan(0.95);
    const f = parseLit(moonDiscPaths(p.illum, p.waning).lit);
    expect(f.rx).toBeGreaterThan(R * 0.9);
    expect(f.term).toBe(p.waning ? 0 : 1);
  });

  it('точная четверть: терминатор — прямая (rx ≈ 0)', () => {
    // эпоха формулы JD 2451550.1 → мс; возраст = SYNODIC/4 → illum ≈ 0.5
    const epochMs = (2451550.1 - 2440587.5) * 86400000;
    const p = moonPhase(new Date(epochMs + (SYNODIC / 4) * 86400000));
    expect(Math.abs(p.illum - 0.5)).toBeLessThan(0.01);
    const f = parseLit(moonDiscPaths(p.illum, p.waning).lit);
    expect(f.rx).toBeLessThan(1.5);
  });

  it('зеркальность: серп роста и серп убывания при равной освещённости симметричны', () => {
    const wax = moonDiscPaths(0.2, false).lit;
    const wan = moonDiscPaths(0.2, true).lit;
    const fw = parseLit(wax);
    const fn = parseLit(wan);
    expect(fw.side).toBe(1);
    expect(fn.side).toBe(0);
    expect(fw.term).toBe(0);
    expect(fn.term).toBe(1);
    expect(fw.rx).toBe(fn.rx);
  });
});
