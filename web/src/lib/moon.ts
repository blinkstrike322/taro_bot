// ─────────────────────────────────────────────────────────────
// moon.ts — фазы луны без библиотек: синодический цикл,
// юлианские дни, векторный диск и глифы. Оккультный терминал
// обязан знать луну — она вне досягаемости юрисдикции, но
// не вне досягаемости арифметики.
// ─────────────────────────────────────────────────────────────

/** синодический месяц, суток */
export const SYNODIC = 29.530588853;

/** эпоха среднего новолуния: JD 2451550.1 (2000-01-06, вечер по UTC) */
const EPOCH_JD = 2451550.1;

/** юлианская дата из Date (UTC-миллисекунды → JD) */
function toJulian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export interface MoonPhase {
  /** 0..7 — индекс фазы (8 равных сегментов цикла) */
  phaseIndex: number;
  /** русское название фазы */
  phaseName: string;
  /** освещённость 0..1 */
  illum: number;
  /** возраст луны: дней от новолуния, 0..29.53 */
  age: number;
  /** дней до ближайшего полнолуния */
  nextFull: number;
  /** дней до ближайшего новолуния */
  nextNew: number;
  /** true — убывает (свет слева), false — растёт (свет справа) */
  waning: boolean;
}

export const PHASE_NAMES: string[] = [
  'новолуние',
  'растущий серп',
  'первая четверть',
  'растущая луна',
  'полнолуние',
  'убывающая луна',
  'последняя четверть',
  'убывающий серп',
];

/** глиф фазы для строки данных и статус-лайна (закрашенное = свет) */
export const MOON_GLYPHS: string[] = ['○', '☾', '◑', '◕', '●', '◕', '◐', '☽'];

/** фаза 5 (убывающая) — глиф 3 зеркалится по горизонтали (тень справа) */
export function glyphMirrored(phaseIndex: number): boolean {
  return phaseIndex === 5;
}

/**
 * фаза луны на момент date (локальное время пользователя).
 * age = ((JD − эпоха) / 29.530588853) mod 1 → дни от новолуния;
 * illum = (1 − cos(2π·age/29.53)) / 2;
 * phaseIndex = 8 равных сегментов цикла (age / 3.69).
 */
export function moonPhase(date: Date): MoonPhase {
  const jd = toJulian(date);
  let frac = ((jd - EPOCH_JD) / SYNODIC) % 1;
  if (frac < 0) frac += 1;
  const age = frac * SYNODIC;
  const phaseIndex = Math.min(7, Math.floor(age / (SYNODIC / 8)));
  const illum = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const full = SYNODIC / 2; // возраст полнолуния ≈ 14.77
  const nextFull = age <= full ? full - age : SYNODIC - age + full;
  const nextNew = (SYNODIC - age) % SYNODIC;
  return {
    phaseIndex,
    phaseName: PHASE_NAMES[phaseIndex],
    illum,
    age,
    nextFull,
    nextNew,
    waning: phaseIndex >= 4,
  };
}

// ── заметки по фазам: что делать, терминальным языком ──

export const PHASE_NOTES: string[] = [
  // 0 · новолуние
  'время начинать в тишине: замыслы, а не поступки. новые расклады ложатся мягче',
  // 1 · растущий серп
  'лёгкий свет набирает силу. мелкие шаги сегодня не расплёскиваются — это семена',
  // 2 · первая четверть
  'проверка решимости: маленький шаг сегодня весит двойного',
  // 3 · растущая луна
  'прилив близок — энергию держи в узде. крупные вопросы формулируй письменно',
  // 4 · полнолуние
  'всё видно как есть — и хорошее, и нет. не давай обещаний до утра',
  // 5 · убывающая луна
  'отдавать легче, чем брать: раздай лишнее — долги и обиды в первую очередь',
  // 6 · последняя четверть
  'пора отпускать то, что проверку не прошло. поблагодари — и дальше',
  // 7 · убывающий серп
  'тонкий свет — время итогов и сна. расклады отложи, слушай тишину',
];

// ── векторный диск: путь светлой части через эллипс-терминатор ──

/** viewBox диска MoonDisc: 0 0 100 100, центр 50, радиус 46 */
const DISC_R = 46;

/** тёмный диск: полная окружность из двух дуг (путь, не <circle> — по контракту) */
const DISC_PATH = `M50 4A${DISC_R} ${DISC_R} 0 1 1 50 96A${DISC_R} ${DISC_R} 0 1 1 50 4Z`;

export interface MoonDiscPaths {
  /** путь тёмного диска */
  disc: string;
  /** путь освещённой части: полуокружность светлой стороны + терминатор-эллипс */
  lit: string;
}

/**
 * геометрия векторной луны по фазе (та же математика, что у
 * MoonGlyph статус-лайна, в масштабе блока): терминатор —
 * эллиптическая дуга с rx = R·|1−2·illum|; при растущей луне
 * свет справа, при убывающей — слева.
 */
export function moonDiscPaths(illum: number, waning: boolean): MoonDiscPaths {
  const k = Math.min(0.998, Math.max(0.002, illum));
  const gibbous = k > 0.5;
  const rx = +(DISC_R * (gibbous ? 2 * k - 1 : 1 - 2 * k)).toFixed(2);
  // полуокружность светлой стороны: растёт — правая, убывает — левая
  const sideSweep = waning ? 0 : 1;
  // терминатор (возврат снизу вверх): до четверти выпукл в светлую
  // сторону (тонкий серп), после — в тёмную (горб)
  const termSweep = waning ? (gibbous ? 0 : 1) : (gibbous ? 1 : 0);
  const lit = `M50 4A${DISC_R} ${DISC_R} 0 0 ${sideSweep} 50 96A${rx} ${DISC_R} 0 0 ${termSweep} 50 4Z`;
  return { disc: DISC_PATH, lit };
}

/** «07 окт, 07.10.2026» — подпись дня в шапке блока */
export function formatMoonDate(date: Date): string {
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = date.getFullYear();
  return `${dd} ${months[date.getMonth()]}, ${dd}.${mm}.${yy}`;
}
