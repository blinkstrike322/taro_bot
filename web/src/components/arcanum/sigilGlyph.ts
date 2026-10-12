// ─────────────────────────────────────────────────────────────
// sigilGlyph.ts v5 — КАНОНИЧЕСКАЯ ПЕЧАТЬ ARCANUM.
//
// Сигил — самостоятельный оккультный знак (не литера): пентакль
// в духе гравюр гримуаров, сшитый по ДНК лого проекта (hairline-
// кольца, четырёхлучевые звёзды, монохром серебра + одна капля
// акцента проводника):
//
//   · пентаграмма остриём вверх — один непрерывный ход
//     (V0→V2→V4→V1→V3→V0), R=118;
//   · вписанный пентагон (V0→V1→…→V4) — внешний корпус звезды,
//     едет с ней в одном колесе;
//   · пять семян стихий — микро-круги на вершинах ВНУТРЕННЕЙ
//     пентаграммы звезды (R≈45, инверсные углы) — тоже в колесе;
//   · пять ТРОЙНЫХ печатей стихий на вершинах: кольцо 10.5 +
//     кольцо 6 + точка 1.8 (печать сидит на круге-замке);
//   · двойной круг-замок: сплошной R=126 + пунктирный R=120;
//   · пунктирный спутник R=132 с двумя бусинами-узлами —
//     встречное вращение (механика небес);
//   · внутренняя пара пунктирных колец: R=97 и R=88;
//   · средняя двойная полоса: дуги R=156 с двумя разрывами +
//     тонкая R=147 с разрывами со сдвигом (плетение);
//   · ГРАДУИРОВАННЫЙ ЛИМБ: 72 деления каждые 5° (R 166→171),
//     каждое шестое — главная риска через 30° (R 162→174);
//   · перекрестие: горизонтальный + вертикальный диаметры;
//   · внешняя ДВОЙНАЯ звёздная карта: бисер R=182 + мелкий
//     бисер R=190;
//   · полумесяц (∪, рога вверх) со звездой в чаше — корона
//     Жрицы; четырёхлучевые звёзды: внизу (ось) и по бокам;
//   · сердце печати: круг r=24 + пунктирное гало r=31 + тихое
//     кольцо r=38 + звезда-искра ЦВЕТОМ ПРОВОДНИКА (единственная
//     капля цвета, как на лого).
//
// ГЕОМЕТРИЯ КАНОНИЧНА: seed не меняет композицию — печать как
// герб/логотип, один и тот же знак в заставке и в ambient-слое.
// Это критично для бесшовной эстафеты: сигил заставки в конце
// перетекает точно в ambient-сигил (та же геометрия, тот же
// масштаб штрихов).
//
// ТАЙМИНГИ: новые штрихи раунда v5 наследуют СУЩЕСТВУЮЩИЕ биты
// проявления (k: beads / ring-outer / ticks / ring-inner / penta /
// ring-seal / ring-seal-dash / crescent / core-ring) — хронометраж
// заставки не сдвинут ни на миллисекунду; счётчик 'vertex' держит
// ровно пять печатей.
//
// Слои: 'orbit' — медленный оборот (бисер, кольца, лимб, риски);
// 'rev' — встречное вращение (пунктирный спутник с узлами);
// 'core' — вертикален навсегда, только дыхание (замки, луна,
// звёзды, сердце). Пентаграмма, пентагон, семена и печати стихий
// хранятся в 'core' (g-поле — данные), но рендер AmbientSigil
// выделяет их (k 'penta'/'vertex') в отдельное колесо с медленным
// поворотом: печати стихий едут на остриях звезды.
// ─────────────────────────────────────────────────────────────

export type SigilInk = 'accent' | 'pale';
export type SigilLayer = 'orbit' | 'rev' | 'core';

export interface SigilStroke {
  /** SVG path, абсолютные команды */
  d: string;
  /** толщина хода в единицах viewBox */
  w: number;
  /** прозрачность хода 0.04–0.10 (ambient); рендерер множит на буст */
  o: number;
  /** чернила: accent — проводник (CSS-переменная), pale — лунное серебро */
  ink: SigilInk;
  /** слой анимации: orbit / rev / core */
  g: SigilLayer;
  /** паттерн штриха (пунктир) в user units — нет = сплошной */
  dash?: string;
  /** форма концов: round — бусины, butt — плиты */
  cap?: 'round' | 'butt';
  /** вид хода — заставка ставит задержки проявления по этому полю */
  k?: string;
}

/** залитая форма (сердце-звезда) */
export interface SigilShape {
  d: string;
  /** прозрачность заливки 0.05–0.10 (ambient) */
  o: number;
  ink: SigilInk;
  g: SigilLayer;
  k?: string;
}

export interface SigilDot {
  x: number;
  y: number;
  r: number;
  /** прозрачность точки 0.04–0.10 */
  o: number;
  ink: SigilInk;
  g: SigilLayer;
}

export interface SigilGlyph {
  strokes: SigilStroke[];
  shapes: SigilShape[];
  dots: SigilDot[];
}

/** центр viewBox 400×400 */
const C = 200;
const TAU = Math.PI * 2;

const f2 = (v: number): number => Math.round(v * 100) / 100;
const polar = (r: number, a: number): [number, number] => [
  C + Math.cos(a) * r,
  C + Math.sin(a) * r,
];

/** дуга: полярный вход → полярный выход */
function arc(r: number, a0: number, a1: number): string {
  const sweep = Math.abs(a1 - a0);
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  return `M${f2(p0[0])} ${f2(p0[1])}A${f2(r)} ${f2(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${f2(p1[0])} ${f2(p1[1])}`;
}

/** полное кольцо из двух полуарок (для dash-паттерна целиком) */
function fullCircle(r: number, startAngle: number): string {
  const a0 = startAngle;
  const a1 = a0 + Math.PI;
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  return (
    `M${f2(p0[0])} ${f2(p0[1])}A${f2(r)} ${f2(r)} 0 0 1 ${f2(p1[0])} ${f2(p1[1])}` +
    `A${f2(r)} ${f2(r)} 0 0 1 ${f2(p0[0])} ${f2(p0[1])}`
  );
}

/** малый круг одним path (печать стихии, сердце, бусина) */
function circlePath(cx: number, cy: number, r: number): string {
  return `M${f2(cx - r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(cx + r)} ${f2(cy)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(cx - r)} ${f2(cy)}`;
}

/** четырёхлучевая звезда с длинными острыми лучами (✦ как на лого):
 *  ширина основания луча 0.16·s — острее, чем у обычной звезды */
function star4(x: number, y: number, s: number): string {
  const b = s * 0.16;
  return (
    `M${f2(x)} ${f2(y - s)}` +
    `L${f2(x + b)} ${f2(y - b)}L${f2(x + s)} ${f2(y)}` +
    `L${f2(x + b)} ${f2(y + b)}L${f2(x)} ${f2(y + s)}` +
    `L${f2(x - b)} ${f2(y + b)}L${f2(x - s)} ${f2(y)}` +
    `L${f2(x - b)} ${f2(y - b)}Z`
  );
}

// ── геометрия пентакля ──
/** радиус описанной окружности пентаграммы (вершины) */
const PENTA_R = 118;
/** круг-замок: классический пентакль — звезда, замкнутая кругом */
const SEAL_R = 126;
/** вершины внутреннего пятиугольника звезды (точки плетения) */
const INNER_R = Math.round(PENTA_R * 0.382);

/** вершины пентаграммы остриём вверх: верх + четыре по кругу */
const VERTICES: [number, number][] = Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + (i * TAU) / 5;
  return [f2(C + Math.cos(a) * PENTA_R), f2(C + Math.sin(a) * PENTA_R)];
});

/** семена стихий: вершины ВНУТРЕННЕЙ (инверсной) пентаграммы */
const SEEDS: [number, number][] = Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + Math.PI / 5 + (i * TAU) / 5;
  return [f2(C + Math.cos(a) * INNER_R), f2(C + Math.sin(a) * INNER_R)];
});

/**
 * Печать канонична: seed сохранён в сигнатуре для совместимости
 * call-сайтов (AmbientSigil/SplashIntro), но геометрия постоянна —
 * как у герба. Проводник красит только сердце-звезду (CSS-переменная).
 */
export function buildSigilGlyph(_seed?: string): SigilGlyph {
  const strokes: SigilStroke[] = [];
  const shapes: SigilShape[] = [];
  const dots: SigilDot[] = [];

  // ── ORBIT · ДВОЙНАЯ звёздная карта: бисер R=182 + мелкий R=190 ──
  strokes.push({
    d: fullCircle(182, -Math.PI / 2),
    w: 1.4,
    o: 0.06,
    ink: 'pale',
    g: 'orbit',
    k: 'beads',
    dash: '0.8 8.2',
  });
  strokes.push({
    d: fullCircle(190, -Math.PI / 2 + 0.37),
    w: 1.0,
    o: 0.05,
    ink: 'pale',
    g: 'orbit',
    k: 'beads',
    dash: '0.7 5.4',
  });

  // ── ORBIT · средняя двойная полоса: дуги R=156 (два разрыва) +
  //    тонкая R=147 с разрывами со сдвигом — плетение гравюры ──
  const ob1 = 0.42;                      // разрыв I
  const ob2 = 0.42 + Math.PI * 1.12;     // разрыв II (≈202° дальше)
  const ogap = 0.085;                    // ширина разрыва, рад
  strokes.push({
    d: arc(156, ob1 + ogap, ob2) + arc(156, ob2 + ogap, ob1),
    w: 1.0,
    o: 0.075,
    ink: 'pale',
    g: 'orbit',
    k: 'ring-outer',
  });
  strokes.push({
    d: arc(147, ob1 + ogap + 0.9, ob2 + 0.9) + arc(147, ob2 + ogap + 0.9, ob1 + 0.9),
    w: 0.55,
    o: 0.05,
    ink: 'pale',
    g: 'orbit',
    k: 'ring-outer',
  });

  // ── ORBIT · ГРАДУИРОВАННЫЙ ЛИМБ: 72 деления через 5°; каждое
  //    шестое — главная риска (30°), длиннее и отступает ближе.
  //    В заставке лимб прочерчивается круговым росчерком (72
  //    сабпути = последовательный обход, как стрелка прибора) ──
  let dial = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * TAU) / 72 - Math.PI / 2;
    const major = i % 6 === 0;
    const r0 = major ? 162 : 166;
    const r1 = major ? 174 : 171;
    const p0 = polar(r0, a);
    const p1 = polar(r1, a);
    dial += `M${f2(p0[0])} ${f2(p0[1])}L${f2(p1[0])} ${f2(p1[1])}`;
  }
  strokes.push({
    d: dial,
    w: 0.55,
    o: 0.05,
    ink: 'pale',
    g: 'orbit',
    k: 'ticks',
  });

  // ── ORBIT · перекрестие: оба диаметра, риски за лимбом ──
  strokes.push({
    d:
      `M${f2(C - 190)} ${C}L${f2(C - 174)} ${C}` +
      `M${f2(C + 174)} ${C}L${f2(C + 190)} ${C}` +
      `M${C} ${f2(C - 190)}L${C} ${f2(C - 174)}` +
      `M${C} ${f2(C + 174)}L${C} ${f2(C + 190)}`,
    w: 1,
    o: 0.05,
    ink: 'pale',
    g: 'orbit',
    k: 'ticks',
  });

  // ── ORBIT · внутренняя пара пунктирных колец: R=97 + R=88 ──
  strokes.push({
    d: fullCircle(97, Math.PI / 3),
    w: 0.7,
    o: 0.045,
    ink: 'pale',
    g: 'orbit',
    k: 'ring-inner',
    dash: '3.5 5.5',
  });
  strokes.push({
    d: fullCircle(88, Math.PI / 3 + 0.8),
    w: 0.55,
    o: 0.04,
    ink: 'pale',
    g: 'orbit',
    k: 'ring-inner',
    dash: '2.5 7',
  });

  // ── REV · пунктирный спутник круга-замка (R=132) с двумя
  //    бусинами-узлами на орбите — встречный ход: в ambient
  //    вращается против орбиты, механика глубины ──
  strokes.push({
    d: fullCircle(132, -Math.PI / 5),
    w: 0.8,
    o: 0.05,
    ink: 'pale',
    g: 'rev',
    k: 'ring-seal-dash',
    dash: '4 6',
  });
  const node0 = polar(132, -Math.PI / 5);
  const node1 = polar(132, -Math.PI / 5 + Math.PI);
  strokes.push({
    d: circlePath(node0[0], node0[1], 2.4) + circlePath(node1[0], node1[1], 2.4),
    w: 0.8,
    o: 0.06,
    ink: 'pale',
    g: 'rev',
    k: 'ring-seal-dash',
    cap: 'round',
  });

  // ── CORE · ПЕНТАГРАММА: один непрерывный ход остриём вверх.
  //    Порядок вершин «через одну» (V0→V2→V4→V1→V3→V0) даёт
  //    классическое плетение; pathLength=1 → рисуется штрихом ──
  const [v0, v1, v2, v3, v4] = VERTICES;
  strokes.push({
    d:
      `M${v0[0]} ${v0[1]}L${v2[0]} ${v2[1]}L${v4[0]} ${v4[1]}` +
      `L${v1[0]} ${v1[1]}L${v3[0]} ${v3[1]}Z`,
    w: 2.4,
    o: 0.09,
    ink: 'pale',
    g: 'core',
    k: 'penta',
  });

  // ── CORE · вписанный пентагон: внешний корпус звезды (обвод
  //    вершин по соседству) — едет в колесе пентаграммы ──
  strokes.push({
    d:
      `M${v0[0]} ${v0[1]}L${v1[0]} ${v1[1]}L${v2[0]} ${v2[1]}` +
      `L${v3[0]} ${v3[1]}L${v4[0]} ${v4[1]}Z`,
    w: 0.9,
    o: 0.05,
    ink: 'pale',
    g: 'core',
    k: 'penta',
  });

  // ── CORE · семена стихий: микро-круги на вершинах внутренней
  //    (инверсной) пентаграммы — пять искр в плетении звезды;
  //    колесо пентаграммы несёт их вместе с ходом ──
  strokes.push({
    d: SEEDS.map(([sx, sy]) => circlePath(sx, sy, 1.6)).join(''),
    w: 1.1,
    o: 0.055,
    ink: 'pale',
    g: 'core',
    k: 'penta',
    cap: 'round',
  });

  // ── CORE · двойной круг-замок: сплошной R=126 + пунктир R=120 ──
  strokes.push({
    d: fullCircle(SEAL_R, -Math.PI / 2),
    w: 1.4,
    o: 0.08,
    ink: 'pale',
    g: 'core',
    k: 'ring-seal',
  });
  strokes.push({
    d: fullCircle(120, -Math.PI / 2 + 0.26),
    w: 0.6,
    o: 0.05,
    ink: 'pale',
    g: 'core',
    k: 'ring-seal',
    dash: '1.5 4',
  });

  // ── CORE · ТРОЙНЫЕ печати стихий: кольцо 10.5 + кольцо 6 +
  //    точка 1.8 — печать сидит на круге-замке, как на гравюре ──
  VERTICES.forEach(([vx, vy]) => {
    strokes.push({
      d: circlePath(vx, vy, 10.5) + circlePath(vx, vy, 6) + circlePath(vx, vy, 1.8),
      w: 1.0,
      o: 0.065,
      ink: 'pale',
      g: 'core',
      k: 'vertex',
    });
  });

  // ── CORE · полумесяц со звездой в чаше (∪, корона Жрицы):
  //    глубокий серп с тонкими рогами — безье даёт живое
  //    утолщение к центру и острые рога, как гравюра; малая
  //    четырёхлучевая звезда спрятана в чаше серпа ──
  strokes.push({
    d:
      `M190 50C186.5 68 213.5 68 210 50C207 59.5 193 59.5 190 50Z` +
      star4(200, 56.5, 2.6),
    w: 1.1,
    o: 0.07,
    ink: 'pale',
    g: 'core',
    k: 'crescent',
  });

  // ── CORE · кардинальные четырёхлучевые звёзды: низ (ось) и бока ──
  strokes.push({ d: star4(C, 347, 10), w: 0.9, o: 0.07, ink: 'pale', g: 'core', k: 'star-v' });
  strokes.push({
    d: star4(89, 200, 6.5) + star4(311, 200, 6.5),
    w: 0.9,
    o: 0.06,
    ink: 'pale',
    g: 'core',
    k: 'star-h',
  });

  // ── CORE · сердце: круг r=24 + пунктирное гало r=31 + тихое
  //    кольцо r=38 + вертикальная ось точками ──
  strokes.push({
    d: circlePath(C, C, 24),
    w: 0.9,
    o: 0.055,
    ink: 'pale',
    g: 'core',
    k: 'core-ring',
  });
  strokes.push({
    d: circlePath(C, C, 31),
    w: 0.6,
    o: 0.05,
    ink: 'pale',
    g: 'core',
    k: 'core-ring',
    dash: '2 4.5',
  });
  strokes.push({
    d: circlePath(C, C, 38),
    w: 0.5,
    o: 0.04,
    ink: 'pale',
    g: 'core',
    k: 'core-ring',
  });
  dots.push({ x: C, y: 166, r: 1.5, o: 0.05, ink: 'pale', g: 'core' });
  dots.push({ x: C, y: 234, r: 1.5, o: 0.05, ink: 'pale', g: 'core' });

  // ── CORE · сердце-искра: единственная капля цвета проводника ──
  shapes.push({
    d: star4(C, C, 11),
    o: 0.1,
    ink: 'accent',
    g: 'core',
    k: 'core-star',
  });

  return { strokes, shapes, dots };
}
