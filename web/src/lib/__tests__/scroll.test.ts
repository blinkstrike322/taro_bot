import { describe, it, expect } from 'vitest';
import { buildScrollText } from '../scroll';

// снапшот: buildScrollText(src: ScrollSource) → { text, filename, lineCount };
// filename строится из локального времени src.at: свиток-дд.мм.гггг-чч.мм.txt.

const AT = new Date(2026, 9, 8, 14, 30); // локальное 08.10.2026 14:30

function build() {
  return buildScrollText({
    interpretation: {
      intro: 'карты легли ровно',
      short_answer: 'да, но не сразу',
      advice: 'держи паузу',
    },
    cards: [{ name: 'Луна', is_reversed: true }, { name: 'Солнце' }],
    question: 'он меня любит?',
    spreadLabel: 'три карты',
    characterId: 'shadow_walker',
    at: AT,
  });
}

describe('buildScrollText', () => {
  const s = build();

  it('filename вида свиток-дд.мм.гггг-чч.мм.txt', () => {
    expect(s.filename).toBe('свиток-08.10.2026-14.30.txt');
  });

  it('строки рамки одной длины', () => {
    const [l1, l2, l3, l4] = s.text.split('\n');
    expect(new Set([l1?.length, l2?.length, l3?.length, l4?.length]).size).toBe(1);
  });

  it('lineCount совпадает с числом строк текста', () => {
    expect(s.lineCount).toBe(s.text.split('\n').length);
  });

  it('вопрос, карты, секции и закрытие попадают в текст', () => {
    expect(s.text).toContain('вопрос — «он меня любит?»');
    expect(s.text).toContain('01 · Луна (перевёрнутая)');
    expect(s.text).toContain('02 · Солнце (прямая)');
    expect(s.text).toContain('// шёпот');
    expect(s.text).toContain('─ signal ─');
    expect(s.text).toContain('// совет');
    expect(s.text).toContain('— свиток запечатан —'); // closing по умолчанию
  });
});
