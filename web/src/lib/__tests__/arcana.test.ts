import { describe, it, expect } from 'vitest';
import { parseBirthDate, computeArcana } from '../arcana';

// адаптация под снапшот: parseBirthDate возвращает юнион
// { ok: true; dateStr; ... } | { ok: false }, а не null;
// поле — dateStr (не normalized). computeArcana возвращает
// { core: 1..22; card: DeckCard } — число аркана живёт в
// card.number (Шут: core=22, card.number=0).

describe('parseBirthDate', () => {
  it('нормализует дд.мм.гггг', () => {
    const p = parseBirthDate('25.03.1990');
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.dateStr).toBe('25.03.1990');
  });
  it('отвергает мусор', () => {
    for (const bad of ['99.99.9999', '32.01.2000', '13.13.2000', '01.01.1899', '01.01.2101', '25031990']) {
      expect(parseBirthDate(bad).ok).toBe(false);
    }
  });
});

describe('computeArcana', () => {
  it('25.03.1990 → 29 → 11', () => {
    const r = computeArcana('25.03.1990');
    expect(r).not.toBeNull();
    expect(r?.core).toBe(11);
    expect(r?.card.number).toBe(11);
    // цепочка редукции: первый шаг — сумма цифр даты
    expect(r?.steps[0]?.expr).toBe('2+5+0+3+1+9+9+0');
    expect(r?.steps[0]?.sum).toBe(29);
  });
  it('08.09.2003 → 22 → Шут (ветвление 22→0)', () => {
    const r = computeArcana('08.09.2003');
    expect(r?.core).toBe(22);
    expect(r?.card.number).toBe(0);
  });
  it('15.06.1985 → 35 → 8', () => {
    const r = computeArcana('15.06.1985');
    expect(r?.core).toBe(8);
    expect(r?.card.number).toBe(8);
  });
});
