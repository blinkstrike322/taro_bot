// ─────────────────────────────────────────────────────────────
// moon.ts — фазы луны без библиотек: синодический цикл,
// юлианские дни, пиксель-арт и глифы. Оккультный терминал
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

// ── пиксель-арт: круг 9×9, терминатор — эллипс ──

export type MoonPixel = 'lit' | 'pen' | 'dark' | 'void';

export interface MoonArt {
  /** 9 строк по 9 символов: ● свет, ▒ полутень, · тень, пробел вне круга */
  rows: string[];
  /** классы символов для раскраски (те же размеры, что rows) */
  cls: MoonPixel[][];
}

/**
 * терминальный пиксель-арт луны 9×9, честно отражающий фазу:
 * терминатор — полуэллипс (x = C ± cosφ·√(R²−dy²));
 * при растущей луне свет справа, при убывающей — слева.
 * полутень ▒ — клетка в ~одной колонке от терминатора.
 */
export function moonArt(phase: MoonPhase): MoonArt {
  const R = 4.5; // радиус в клетках (круг диаметром 9)
  const C = 4; // центр
  const phi = (2 * Math.PI * phase.age) / SYNODIC;
  const cosPhi = Math.cos(phi);
  const rows: string[] = [];
  const cls: MoonPixel[][] = [];
  for (let row = 0; row < 9; row++) {
    const dy = row - C;
    const half = Math.sqrt(Math.max(0, R * R - dy * dy));
    // терминатор: при росте сдвинут вправо от центра при cosφ>0
    const xT = phase.waning ? C - cosPhi * half : C + cosPhi * half;
    let line = '';
    const lineCls: MoonPixel[] = [];
    for (let col = 0; col < 9; col++) {
      const dx = col - C;
      if (dx * dx + dy * dy > R * R) {
        line += ' ';
        lineCls.push('void');
        continue;
      }
      const dist = Math.abs(col - xT);
      if (dist <= 0.9) {
        line += '▒';
        lineCls.push('pen');
        continue;
      }
      const lit = phase.waning ? col <= xT : col >= xT;
      line += lit ? '●' : '·';
      lineCls.push(lit ? 'lit' : 'dark');
    }
    rows.push(line);
    cls.push(lineCls);
  }
  return { rows, cls };
}

/** «07 окт, 07.10.2026» — подпись дня в шапке блока */
export function formatMoonDate(date: Date): string {
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = date.getFullYear();
  return `${dd} ${months[date.getMonth()]}, ${dd}.${mm}.${yy}`;
}
