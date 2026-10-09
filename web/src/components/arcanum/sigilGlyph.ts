// ─────────────────────────────────────────────────────────────
// sigilGlyph.ts — генератор векторного гримуар-глифа фонового
// сигила ARCANUM. Детерминированный: один seed (проводник +
// карта дня) → один и тот же глиф, сервер и клиент совпадают.
//
// Композиция (спека §7): НЕ «магический круг», а авторский
// псевдо-глиф:
//   · хребет — 4–7 ходов, сшитых в незамкнутый контур: швы трёх
//     почерков (провисающая дуга / прямой стежок / пологая дуга),
//     часть швов обрывается — «недошито»;
//   · 1–2 сломанные дуги-эха (отголоски колец, никогда не полные);
//   · 1–2 засечки-штриха через случайный сустав;
//   · 2–4 узла-точки на суставах.
// Асимметрия заложена в углы (неровные шаги) и радиусы вершин.
// Прозрачности 0.04–0.10 — глиф едва проступает из темноты;
// цвет — только через CSS-переменную проводника (--guide-accent).
// ─────────────────────────────────────────────────────────────

export type SigilInk = 'accent' | 'pale';

export interface SigilStroke {
  /** SVG path, абсолютные команды */
  d: string;
  /** толщина хода в единицах viewBox (≈1–2px на экране после масштаба) */
  w: number;
  /** прозрачность хода 0.04–0.10 */
  o: number;
  /** чернила: accent — проводник (CSS-переменная), pale — лунное серебро */
  ink: SigilInk;
}

export interface SigilDot {
  x: number;
  y: number;
  r: number;
  /** прозрачность точки 0.04–0.10 */
  o: number;
  ink: SigilInk;
}

export interface SigilGlyph {
  strokes: SigilStroke[];
  dots: SigilDot[];
}

const TAU = Math.PI * 2;
/** центр viewBox 400×400 */
const C = 200;

/** FNV-1a 32bit: строка контекста чтения → число-зерно */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — компактный детерминированный PRNG [0..1) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f2 = (v: number): number => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const polar = (r: number, a: number): [number, number] => [
  C + Math.cos(a) * r,
  C + Math.sin(a) * r,
];
/** точка квадратичной кривой Безье (де Кастельжо) */
const quadAt = (
  p0: [number, number], c: [number, number], p1: [number, number], t: number,
): [number, number] => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
];

export function buildSigilGlyph(seed: string): SigilGlyph {
  const rnd = mulberry32(fnv1a(seed));
  const strokes: SigilStroke[] = [];
  const dots: SigilDot[] = [];
  /** суставы — кандидаты для узлов и засечек */
  const joints: [number, number][] = [];

  // ── хребет: 4–7 вершин, неровные угловые шаги и радиусы ──
  const n = 4 + Math.floor(rnd() * 4); // 4..7 ходов
  let ang = rnd() * TAU;
  const verts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    ang += (TAU / n) * (0.55 + rnd() * 0.9); // шаги не равны — асимметрия
    const r = 88 + rnd() * 84; // 88..172 — рваный силуэт
    verts.push(polar(r, ang));
  }
  joints.push(...verts);

  // ── швы хребта: три почерка, часть швов обрывается ──
  let spine = '';
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const broken = rnd() < 0.25;
    const tEnd = broken ? 0.35 + rnd() * 0.35 : 1; // обрыв на 35–70% хода
    const ex = lerp(a[0], b[0], tEnd);
    const ey = lerp(a[1], b[1], tEnd);
    const style = rnd();
    if (style < 0.5) {
      // провис: квадратичная дуга, контроль выдавлен перпендикуляром
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dist = Math.hypot(dx, dy) || 1;
      const bow = (rnd() - 0.5) * dist * 0.7;
      const c: [number, number] = [
        (a[0] + b[0]) / 2 + (-dy / dist) * bow,
        (a[1] + b[1]) / 2 + (dx / dist) * bow,
      ];
      // обрыв куска кривой — точно, де Кастельжо
      const q = quadAt(a, c, b, tEnd);
      const c1: [number, number] = [lerp(a[0], c[0], tEnd), lerp(a[1], c[1], tEnd)];
      spine += `M${f2(a[0])} ${f2(a[1])}Q${f2(c1[0])} ${f2(c1[1])} ${f2(q[0])} ${f2(q[1])}`;
      joints.push([q[0], q[1]]);
    } else if (style < 0.8) {
      // прямой стежок
      spine += `M${f2(a[0])} ${f2(a[1])}L${f2(ex)} ${f2(ey)}`;
      joints.push([ex, ey]);
    } else {
      // пологая дуга-«стежок» через A: радиус больше хорды
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const rr = f2(dist * (0.65 + rnd() * 0.5));
      spine += `M${f2(a[0])} ${f2(a[1])}A${rr} ${rr} 0 0 ${rnd() < 0.5 ? 0 : 1} ${f2(ex)} ${f2(ey)}`;
      joints.push([ex, ey]);
    }
  }
  strokes.push({
    d: spine,
    w: f2(1.0 + rnd() * 0.2), // основной ход — толще прочих
    o: f2(0.09 + rnd() * 0.01),
    ink: 'accent',
  });

  // ── дуги-эха: 1–2 сломанных кольца-отголоска (никогда не полные) ──
  const echoCount = 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < echoCount; k++) {
    const r = 58 + rnd() * 118;
    const start = rnd() * TAU;
    const sweep = (40 + rnd() * 160) * (Math.PI / 180); // 40..200°
    const ccw = rnd() < 0.5;
    const s = polar(r, start);
    const e = polar(r, ccw ? start - sweep : start + sweep);
    strokes.push({
      d: `M${f2(s[0])} ${f2(s[1])}A${f2(r)} ${f2(r)} 0 ${sweep > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${f2(e[0])} ${f2(e[1])}`,
      w: f2(0.6 + rnd() * 0.3),
      o: f2(0.07 + rnd() * 0.02),
      ink: rnd() < 0.4 ? 'accent' : 'pale',
    });
    joints.push(s, e);
  }

  // ── засечки: 1–2 коротких штриха через случайный сустав ──
  let ticks = '';
  const tickCount = 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < tickCount; k++) {
    const j = joints[Math.floor(rnd() * joints.length)];
    const ta = rnd() * TAU;
    const len = 12 + rnd() * 14;
    ticks += `M${f2(j[0] - Math.cos(ta) * len)} ${f2(j[1] - Math.sin(ta) * len)}` +
      `L${f2(j[0] + Math.cos(ta) * len * 0.45)} ${f2(j[1] + Math.sin(ta) * len * 0.45)}`;
  }
  strokes.push({ d: ticks, w: 0.7, o: f2(0.07 + rnd() * 0.02), ink: 'accent' });

  // ── узлы: 2–4 точки, каждый сустав не больше одного раза ──
  const order = joints.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const dotCount = Math.min(2 + Math.floor(rnd() * 3), order.length);
  for (let k = 0; k < dotCount; k++) {
    const j = joints[order[k]];
    dots.push({
      x: f2(j[0]),
      y: f2(j[1]),
      r: f2(2.2 + rnd() * 2),
      o: f2(0.09 + rnd() * 0.01),
      ink: rnd() < 0.65 ? 'accent' : 'pale',
    });
  }

  return { strokes, dots };
}
