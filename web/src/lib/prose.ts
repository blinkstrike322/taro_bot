// Разбиение длинной прозы расклада на читаемые абзацы.
// Если в тексте уже есть переносы строк — уважаем их.
// Если сплошной текст длинный — группируем предложения в абзацы.

const LONG_ENOUGH = 260; // символы, после которых сплошной текст разбиваем
const SENTENCES_PER_PARA = 2; // предложений в абзаце при авто-разбиении
const MAX_PARAS = 4; // максимум авто-абзацев, остаток доливаем в последний

export function splitParagraphs(text: string): string[] {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return [];

  if (/\n/.test(t)) {
    return t
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (t.length <= LONG_ENOUGH) return [t];

  const sentences = t.split(/(?<=[.!?…])\s+/);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
    if (paras.length >= MAX_PARAS) {
      paras[paras.length - 1] += ' ' + sentences.slice(i).join(' ');
      break;
    }
    paras.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(' '));
  }
  return paras;
}

export function joinedParagraphs(text: string): string {
  return splitParagraphs(text).join('\n\n');
}