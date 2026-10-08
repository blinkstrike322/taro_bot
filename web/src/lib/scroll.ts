// ─────────────────────────────────────────────────────────────
// scroll.ts — сборка ASCII-свитка из завершённого чтения.
// Чистая функция без React: interpretation + карты + вопрос +
// метаданные → моноширинный текст. Уходит в буфер обмена и
// в свиток.txt. Секции зеркалят то, что рендерит ReadingResult:
// шёпот → signal → позиции/день → нить → совет → закрытие.
// ─────────────────────────────────────────────────────────────
import type { Interpretation } from '@/lib/api';
import { getGuide } from '@/lib/guides';

/** минимальная карта для свитка — имя и ориентация */
export interface ScrollCard {
  name: string;
  is_reversed?: boolean;
}

export interface ScrollSource {
  interpretation: Interpretation;
  cards?: ScrollCard[];
  question?: string | null;
  spreadLabel: string;
  characterId?: string;
  /** фраза-закрытие с экрана (генерится в ReadingResult при маунте) */
  closing?: string;
  /** момент чтения; по умолчанию — сейчас */
  at?: Date;
}

/** результат сборки: то, что уходит в транскрипт и буфер */
export interface ScrollExport {
  text: string;
  filename: string;
  lineCount: number;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** дд мес гггг · чч:мм */
function scrollStamp(d: Date): string {
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** имя файла: свиток-дд.мм.гггг-чч.мм.txt */
function scrollFilename(d: Date): string {
  const date = `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
  return `свиток-${date}-${time}.txt`;
}

interface ScrollSection {
  label: string;
  prose: string;
}

/**
 * секции тела свитка — те же, что рендерятся на экране:
 * позиции → трактовки (для раскладов); проявление /
 * на что смотреть / траектория дня (для карты дня);
 * значение (для одиночных карт). «нить» (связь карт)
 * идёт отдельной секцией после тела.
 */
function bodySections(
  interp: Interpretation,
): { sections: ScrollSection[]; synthesis: string | null } {
  const positions = Array.isArray(interp['позиции']) ? interp['позиции'] : null;

  if (positions && positions.length > 0) {
    const sections: ScrollSection[] = [];
    positions.forEach((p, i) => {
      if (!p['трактовка']) return;
      const num = String(i + 1).padStart(2, '0');
      sections.push({
        label: p['позиция'] ? `${num} · ${p['позиция']}` : num,
        prose: p['трактовка'],
      });
    });
    return { sections, synthesis: interp['связь_карт'] ?? null };
  }

  if (interp['проявление'] || interp['на_что_смотреть'] || interp['траектория']) {
    const sections: ScrollSection[] = [];
    if (interp['проявление']) {
      sections.push({ label: 'проявление', prose: interp['проявление'] });
    }
    if (interp['на_что_смотреть']) {
      sections.push({ label: 'на что смотреть', prose: interp['на_что_смотреть'] });
    }
    const traj = interp['траектория'];
    if (traj) {
      const parts: ScrollSection[] = [];
      for (const t of ['утро', 'день', 'вечер'] as const) {
        const v = traj[t];
        if (v) parts.push({ label: t, prose: v });
      }
      if (parts.length > 0) {
        // заголовок-лидер раскрытого блока «траектория дня»
        sections.push({ label: 'траектория дня', prose: '' });
        sections.push(...parts);
      }
    }
    return { sections, synthesis: null };
  }

  const meanings = Array.isArray(interp.card_meaning)
    ? interp.card_meaning
    : interp.card_meaning
      ? [interp.card_meaning]
      : [];
  const sections = meanings.map((m, i) => ({
    label: meanings.length > 1 ? `значение · ${pad2(i + 1)}` : 'значение',
    prose: m,
  }));
  return { sections, synthesis: null };
}

/** рамка-шапка: ширина подстраивается под заголовок и мету */
function scrollHead(title: string, meta: string): string[] {
  const inner = Math.max(title.length, meta.length, 34);
  const bar = '═'.repeat(inner + 2);
  return [
    `╔${bar}╗`,
    `║ ${title.padEnd(inner, ' ')} ║`,
    `║ ${meta.padEnd(inner, ' ')} ║`,
    `╚${bar}╝`,
  ];
}

// ── подписи для транскрипта ──

/** склонение: строка / строки / строк */
export function linesWord(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'строка';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'строки';
  return 'строк';
}

/** «свиток переписан в буфер · N строк(и)» */
export function scrollCopiedLabel(lineCount: number): string {
  return `свиток переписан в буфер · ${lineCount} ${linesWord(lineCount)}`;
}

/** буфер недоступен (пермиссия/небезопасный контекст) — файл остаётся */
export const SCROLL_FALLBACK_LABEL = 'буфер недоступен — сохрани свиток файлом';

// ── сборка ──

export function buildScrollText(src: ScrollSource): ScrollExport {
  const { interpretation: interp, cards, question, spreadLabel } = src;
  const guide = getGuide(src.characterId);
  const at = src.at ?? new Date();

  const title = `ARCANUM · ${spreadLabel.toUpperCase()}`;
  const meta = `${scrollStamp(at)} · проводник: ${guide.name}`;

  const lines: string[] = [...scrollHead(title, meta)];

  if (question) {
    lines.push('', `вопрос — «${question}»`);
  }

  // карты: номер · позиция — имя (ориентация)
  const positions = Array.isArray(interp['позиции']) ? interp['позиции'] : null;
  const list = cards ?? [];
  const count = Math.max(list.length, positions?.length ?? 0);
  const cardLines: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = pad2(i + 1);
    const pos = positions?.[i]?.['позиция'] ?? null;
    const name = positions?.[i]?.['карта'] ?? list[i]?.name ?? '';
    const reversed = Boolean(positions?.[i]?.['реверс'] ?? list[i]?.is_reversed ?? false);
    const orient = reversed ? 'перевёрнутая' : 'прямая';
    cardLines.push(pos ? `${num} · ${pos} — ${name} (${orient})` : `${num} · ${name} (${orient})`);
  }
  if (cardLines.length > 0) {
    lines.push('', ...cardLines);
  }

  // шёпот — вход проводника
  if (interp.intro) {
    lines.push('', '// шёпот', interp.intro);
  }

  // сигнал — короткий ответ
  if (interp.short_answer) {
    lines.push('', '─ signal ─', interp.short_answer);
  }

  // тело: позиции / день / значения
  const { sections, synthesis } = bodySections(interp);
  sections.forEach((s) => {
    lines.push('', `// ${s.label}`);
    if (s.prose) lines.push(s.prose);
  });

  // нить — связь карт
  if (synthesis) {
    lines.push('', '// нить', synthesis);
  }

  // совет
  if (interp.advice) {
    lines.push('', '// совет', interp.advice);
  }

  // финал: фраза-закрытие (та же, что на экране) + подпись
  const closing = (src.closing ?? '').trim() || 'свиток запечатан';
  lines.push('', `— ${closing} —`, '', `${guide.tag} · arcanum terminal`);

  return {
    text: lines.join('\n'),
    filename: scrollFilename(at),
    lineCount: lines.length,
  };
}

// ── свиток дайджеста недели ──

/** склонение: 1 чтение · 2 чтения · 5 чтений (локальная копия
 *  из WeekBlock — scroll.ts не тянет React-модули) */
function readingsWordScroll(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'чтение';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'чтения';
  return 'чтений';
}

export interface WeekScrollSource {
  digest: {
    total: number;
    days_active: number;
    spread_counts: Record<string, number>;
    card_counts: Record<string, number>;
    guide_counts: Record<string, number>;
    date_from: string;
    date_to: string;
  };
  /** LLM-рефлексия, если успела прийти */
  reflection?: string | null;
  characterId?: string;
  at?: Date;
}

/** свиток недели: числа/расклады/карта недели/голоса/рефлексия */
export function buildWeekScrollText(src: WeekScrollSource): ScrollExport {
  const { digest, reflection } = src;
  const guide = getGuide(src.characterId);
  const at = src.at ?? new Date();

  const title = 'ARCANUM · НЕДЕЛЯ В КАРТАХ';
  const meta = `${digest.date_from} — ${digest.date_to} · ${digest.total} ${readingsWordScroll(digest.total)} · проводник: ${guide.name}`;

  const lines: string[] = [...scrollHead(title, meta)];

  // числа недели
  lines.push(
    '',
    '─ числа ─',
    `${digest.total} ${readingsWordScroll(digest.total)} · ${digest.days_active} из 7 дней с картами`,
  );

  // расклады
  const spreads = Object.entries(digest.spread_counts);
  if (spreads.length > 0) {
    lines.push('', '// расклады');
    for (const [name, n] of spreads) lines.push(`${name} — ${n}`);
  }

  // карта недели + соседи
  const cards = Object.entries(digest.card_counts);
  if (cards.length > 0) {
    lines.push('', '// карта недели');
    for (const [name, n] of cards) lines.push(`${name} — ${n}`);
  }

  // голоса
  const voices = Object.entries(digest.guide_counts);
  if (voices.length > 0) {
    lines.push('', '// голоса');
    for (const [name, n] of voices) lines.push(`${name} — ${n}`);
  }

  // рефлексия проводника
  if (reflection && reflection.trim()) {
    lines.push('', '// рефлексия', reflection.trim());
  }

  lines.push('', '— неделя запечатана —', '', `${guide.tag} · arcanum terminal`);

  const date = `${pad2(at.getDate())}.${pad2(at.getMonth() + 1)}.${at.getFullYear()}`;
  return {
    text: lines.join('\n'),
    filename: `свиток-недели-${date}.txt`,
    lineCount: lines.length,
  };
}

// ── свиток прогноза дня ──

export interface ForecastScrollSource {
  cardName: string;
  reversed?: boolean;
  forecast: {
    лозунг: string;
    утро: string;
    день: string;
    вечер: string;
    фокус: string;
    тонус: number;
    удача: number;
    общение: number;
    глоток: string;
  };
  fallback?: boolean;
  characterId?: string;
  at?: Date;
}

/** бар шкалы для свитка: ▰▱ + число */
function scaleLine(label: string, v: number): string {
  return `${label} ${'▰'.repeat(v)}${'▱'.repeat(Math.max(0, 10 - v))} ${v}/10`;
}

/** свиток прогноза: лозунг/времена/фокус/шкалы/глоток */
export function buildForecastScrollText(src: ForecastScrollSource): ScrollExport {
  const { forecast: f, cardName } = src;
  const guide = getGuide(src.characterId);
  const at = src.at ?? new Date();

  const today = at.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  const orient = src.reversed ? 'перевёрнутой' : 'прямой';

  const title = 'ARCANUM · ПРОГНОЗ ДНЯ';
  const meta = `${today} · по карте «${cardName}» (${orient}) · ${guide.name}`;

  const lines: string[] = [...scrollHead(title, meta)];

  lines.push('', `«${f.лозунг}»`);

  lines.push(
    '',
    '// утро', f.утро,
    '', '// день', f.день,
    '', '// вечер', f.вечер,
  );

  lines.push('', '─ фокус ─', f.фокус);

  lines.push(
    '',
    '// шкалы дня',
    scaleLine('тонус   ', f.тонус),
    scaleLine('удача   ', f.удача),
    scaleLine('общение ', f.общение),
  );

  lines.push('', '// глоток дня', f.глоток);

  if (src.fallback) {
    lines.push('', '(отражение от колоды — без связи с эфиром)');
  }

  lines.push('', '— день запечатан —', '', `${guide.tag} · arcanum terminal`);

  const date = `${pad2(at.getDate())}.${pad2(at.getMonth() + 1)}.${at.getFullYear()}`;
  return {
    text: lines.join('\n'),
    filename: `свиток-прогноза-${date}.txt`,
    lineCount: lines.length,
  };
}

// ── свиток дайджеста месяца ──

export interface MonthScrollSource {
  digest: {
    total: number;
    days_active: number;
    days_in_month: number;
    month_name: string;
    year: number;
    spread_counts: Record<string, number>;
    card_counts: Record<string, number>;
    guide_counts: Record<string, number>;
    majors: number;
    suit_counts: Record<string, number>;
    days: { day: number; count: number }[];
  };
  /** LLM-рефлексия, если успела прийти */
  reflection?: string | null;
  characterId?: string;
  at?: Date;
}

/** свиток месяца: числа/дни/баланс аркан/расклады/карта/рефлексия */
export function buildMonthScrollText(src: MonthScrollSource): ScrollExport {
  const { digest, reflection } = src;
  const guide = getGuide(src.characterId);
  const at = src.at ?? new Date();

  const monthUpper = digest.month_name.toUpperCase();
  const title = `ARCANUM · ${monthUpper} В КАРТАХ`;
  const meta = `${digest.month_name} ${digest.year} · ${digest.total} ${readingsWordScroll(digest.total)} · проводник: ${guide.name}`;

  const lines: string[] = [...scrollHead(title, meta)];

  // числа месяца
  lines.push(
    '',
    '─ числа ─',
    `${digest.total} ${readingsWordScroll(digest.total)} · ${digest.days_active} из ${digest.days_in_month} дней с картами`,
  );

  // полоса дней: одна строка на декаду, клетка = день
  lines.push('', '// дни месяца');
  const cells = digest.days.map((d) => {
    if (d.count > 3) return '◆';
    if (d.count > 0) return '▪';
    return '·';
  });
  for (let i = 0; i < cells.length; i += 10) {
    const from = i + 1;
    const to = Math.min(i + 10, cells.length);
    lines.push(`${pad2(from)}-${pad2(to)}  ${cells.slice(i, i + 10).join('')}`);
  }

  // баланс аркан
  const suits = Object.entries(digest.suit_counts);
  if (digest.majors > 0 || suits.length > 0) {
    lines.push('', '// баланс аркан');
    const parts = [`${digest.majors} старших`];
    for (const [suit, n] of suits) parts.push(`${n} ${suit}`);
    lines.push(parts.join(' · '));
  }

  // расклады
  const spreads = Object.entries(digest.spread_counts);
  if (spreads.length > 0) {
    lines.push('', '// расклады');
    for (const [name, n] of spreads) lines.push(`${name} — ${n}`);
  }

  // карта месяца + соседи
  const cards = Object.entries(digest.card_counts);
  if (cards.length > 0) {
    lines.push('', '// карта месяца');
    for (const [name, n] of cards) lines.push(`${name} — ${n}`);
  }

  // голоса
  const voices = Object.entries(digest.guide_counts);
  if (voices.length > 0) {
    lines.push('', '// голоса');
    for (const [name, n] of voices) lines.push(`${name} — ${n}`);
  }

  // рефлексия проводника
  if (reflection && reflection.trim()) {
    lines.push('', '// рефлексия', reflection.trim());
  }

  lines.push('', `— ${digest.month_name} запечатан —`, '', `${guide.tag} · arcanum terminal`);

  const date = `${pad2(at.getDate())}.${pad2(at.getMonth() + 1)}.${at.getFullYear()}`;
  return {
    text: lines.join('\n'),
    filename: `свиток-${digest.month_name}-${digest.year}.txt`,
    lineCount: lines.length,
  };
}
