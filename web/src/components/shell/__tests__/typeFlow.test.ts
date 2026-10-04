import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { punctDelay, typeInto } from '@/lib/typeFlow';

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

// Кадры дёргаем руками: performance.now фиксируем, rAF подменяем,
// чтобы проверить семантику догона без реального тайминга.
describe('typeInto catch-up', () => {
  let cb: FrameRequestCallback | null;

  beforeEach(() => {
    cb = null;
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.stubGlobal('requestAnimationFrame', (c: FrameRequestCallback) => {
      cb = c;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('при обычном кадре не «выстреливает» — 1 символ', () => {
    const node = document.createTextNode('');
    typeInto(node, 'abcdefghij', { cps: 55 });
    cb!(1016); // кадр только на 16 мс позже старта
    expect(node.textContent).toBe('a');
  });

  it('догоняет после залипания, но не более 2 символов за кадр', () => {
    const node = document.createTextNode('');
    typeInto(node, 'abcdefghij', { cps: 125 });
    cb!(1016); // первый кадр — до 2 символов
    expect(node.textContent).toBe('ab');
    cb!(1200); // кадр сильно запаздывает — расписание ушло вперёд
    expect(node.textContent).toBe('abcd');
  });
});