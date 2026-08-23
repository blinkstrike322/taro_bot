/**
 * PixelFlower v2 — чистая геометрия ириса (без JSX).
 * Сетка STEP=1 (100×164 живых ячеек), 1px контуры, дизер-полутона
 * к краям лепестков (растровая печать), филаменты-тычинки,
 * бутоны-спирали, тонкий стебель. Детерминировано от seed.
 */

export const STEP = 1;
export const GRID_W = 100;
export const GRID_H = 164;

export type CellType = 'solid' | 'cross' | 'dot' | 'outline' | 'eye';

export interface Cell {
  x: number;
  y: number;
  t: CellType;
  organ: number;
  o: number;
  accent?: boolean;
}

export const ORGAN = {
  STD_L: 0, STD_C: 1, STD_R: 2,
  FALL_L: 3, FALL_R: 4, FALL_B: 5,
  STEM: 6, SPROUT: 7,
  FIL_L: 8, FIL_R: 9, BUD_L: 10, BUD_R: 11,
} as const;

interface PetalDef {
  organ: number;
  cx: number;
  cy: number;
  angle: number;
  len: number;
  halfW: number;
  bend: number;
  kind: 'lacey' | 'drop' | 'hatch' | 'mist';
}

const PETALS: PetalDef[] = [
  { organ: ORGAN.STD_L, cx: 50, cy: 52, angle: -Math.PI / 2 - 0.66, len: 34, halfW: 7.5, bend: -7, kind: 'lacey' },
  { organ: ORGAN.STD_C, cx: 50, cy: 52, angle: -Math.PI / 2, len: 40, halfW: 9, bend: 0, kind: 'lacey' },
  { organ: ORGAN.STD_R, cx: 50, cy: 52, angle: -Math.PI / 2 + 0.66, len: 34, halfW: 7.5, bend: 7, kind: 'lacey' },
  { organ: ORGAN.FALL_L, cx: 50, cy: 54, angle: Math.PI - 0.2, len: 36, halfW: 11.5, bend: -6, kind: 'drop' },
  { organ: ORGAN.FALL_R, cx: 50, cy: 54, angle: 0.36, len: 33, halfW: 10.5, bend: 8, kind: 'hatch' },
  { organ: ORGAN.FALL_B, cx: 50, cy: 54, angle: Math.PI / 2 + 0.12, len: 20, halfW: 7, bend: 2, kind: 'mist' },
];

function hash1(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function snap(v: number): number {
  return Math.round(v / STEP) * STEP - Math.floor(STEP / 2);
}

/** Полутон: плотность падает к краю лепестка — эффект растровой печати */
function halftone(edgeDist: number, h: number): CellType {
  if (edgeDist < 0.18) return h < 0.75 ? 'dot' : 'outline';
  const density = 0.35 + 0.6 * edgeDist;
  if (h < density * 0.5) return 'solid';
  if (h < density * 0.8) return 'cross';
  if (h < density * 0.95) return 'dot';
  return 'outline';
}

function sweepPetal(def: PetalDef, seed: number, cells: Map<string, Cell>) {
  const ax = Math.cos(def.angle);
  const ay = Math.sin(def.angle);
  const nx = -ay;
  const ny = ax;

  const stations = Math.round(def.len / STEP);
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const px = def.cx + ax * def.len * t + nx * def.bend * t * t;
    const py = def.cy + ay * def.len * t + ny * def.bend * t * t;
    const w = def.halfW * Math.sin(Math.PI * Math.pow(Math.max(t, 0.02), 0.72)) * (0.9 + 0.2 * hash1(seed + i * 3));

    const offs = Math.ceil(w / STEP);
    for (let j = -offs; j <= offs; j++) {
      const off = j * STEP;
      if (Math.abs(off) > w) continue;
      const x = snap(px + nx * off);
      const y = snap(py + ny * off);
      const key = `${x},${y}`;
      if (cells.has(key)) continue;

      const edgeDist = 1 - Math.abs(off) / Math.max(w, 0.001);
      const h = hash1(seed * 7 + i * 13 + j * 29);
      let t_: CellType;
      let o: number;

      if (edgeDist < 0.08) {
        t_ = 'outline';
        o = 0.9;
      } else {
        switch (def.kind) {
          case 'lacey':
            t_ = halftone(edgeDist, h);
            o = t_ === 'solid' ? 0.95 : 0.78;
            break;
          case 'drop':
            if (t < 0.34) { t_ = edgeDist > 0.5 ? 'solid' : halftone(edgeDist, h); o = 0.95; }
            else if (t < 0.7) { t_ = (x + y) % 2 === 0 ? 'solid' : 'dot'; o = 0.88; }
            else { t_ = h < 0.5 ? 'dot' : 'outline'; o = 0.65; }
            break;
          case 'hatch':
            if (t > 0.78) { t_ = h < 0.5 ? 'dot' : 'outline'; o = 0.65; }
            else { t_ = (x + y) % 4 < 2 ? (edgeDist > 0.6 ? 'solid' : 'cross') : 'cross'; o = 0.85; }
            break;
          case 'mist':
            t_ = h < 0.55 ? 'dot' : 'outline';
            o = 0.5;
            break;
        }
      }

      cells.set(key, {
        x, y, t: t_, organ: def.organ, o,
        accent: hash1(seed + i * 31 + j * 17) < 0.02,
      });
    }
  }
}

function drawArc(
  cells: Map<string, Cell>,
  organ: number,
  x0: number, y0: number,
  x1: number, y1: number,
  bow: number,
  seed: number,
) {
  const steps = 40;
  const chord = Math.hypot(x1 - x0, y1 - y0) || 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const cx = mx + ((y1 - y0) / chord) * bow;
    const cy = my - ((x1 - x0) / chord) * bow;
    const xa = x0 + (cx - x0) * t;
    const ya = y0 + (cy - y0) * t;
    const xb = cx + (x1 - cx) * t;
    const yb = cy + (y1 - cy) * t;
    const x = snap(xa + (xb - xa) * t);
    const y = snap(ya + (yb - ya) * t);
    const key = `${x},${y}`;
    if (cells.has(key)) continue;
    const h = hash1(seed + i * 7);
    cells.set(key, { x, y, t: h < 0.55 ? 'dot' : h < 0.85 ? 'cross' : 'outline', organ, o: 0.75 });
  }
}

function drawSpiral(cells: Map<string, Cell>, organ: number, cx: number, cy: number, r: number, seed: number) {
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI * 2.2;
    const rr = r * t;
    const x = snap(cx + Math.cos(ang) * rr);
    const y = snap(cy + Math.sin(ang) * rr * 0.8);
    const key = `${x},${y}`;
    if (cells.has(key)) continue;
    cells.set(key, { x, y, t: hash1(seed + i * 5) < 0.6 ? 'dot' : 'cross', organ, o: 0.7 });
  }
}

export function generateIris(seed: number): Cell[] {
  const cells = new Map<string, Cell>();

  const S = 44;
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const x = snap(50 - 3 * t - 13 * t * t);
    const y = snap(64 + 92 * t);
    const key = `${x},${y}`;
    if (cells.has(key)) continue;
    const h = hash1(seed + i * 11);
    cells.set(key, { x, y, t: h < 0.5 ? 'dot' : h < 0.8 ? 'cross' : 'outline', organ: ORGAN.STEM, o: 0.8 });
  }

  for (let i = 0; i < 12; i++) {
    const k1 = `${snap(63)},${snap(158 - i * 2)}`;
    if (!cells.has(k1)) cells.set(k1, { x: snap(63), y: snap(158 - i * 2), t: 'dot', organ: ORGAN.SPROUT, o: 0.7 });
    const k2 = `${snap(65)},${snap(157 - i * 2)}`;
    if (!cells.has(k2)) cells.set(k2, { x: snap(65), y: snap(157 - i * 2), t: i % 2 ? 'dot' : 'cross', organ: ORGAN.SPROUT, o: 0.55 });
  }

  drawArc(cells, ORGAN.FIL_L, 50, 56, 38, 26, 6, seed + 51);
  drawArc(cells, ORGAN.FIL_R, 50, 56, 62, 26, -6, seed + 52);

  drawSpiral(cells, ORGAN.BUD_L, 40, 62, 5, seed + 61);
  drawSpiral(cells, ORGAN.BUD_R, 60, 62, 5, seed + 62);

  for (const p of PETALS) sweepPetal(p, seed + p.organ * 97, cells);

  const ex = snap(50);
  const ey = snap(53);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const key = `${ex + dx},${ey + dy}`;
      const isEdge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
      cells.set(key, { x: ex + dx, y: ey + dy, t: isEdge ? 'outline' : 'eye', organ: ORGAN.STD_C, o: 1 });
    }
  }

  return Array.from(cells.values());
}

export interface LoosePixel {
  x: number; y: number; s: number; o: number;
  driftX: number; dur: number; delay: number;
}

export function generateLoose(seed: number, count: number): LoosePixel[] {
  return Array.from({ length: count }, (_, i) => {
    const s = seed + i * 41;
    return {
      x: 12 + hash1(s) * 76,
      y: 6 + hash1(s * 3) * 60,
      s: hash1(s * 5) > 0.5 ? 2 : 1,
      o: 0.25 + hash1(s * 7) * 0.3,
      driftX: (hash1(s * 11) - 0.5) * 14,
      dur: 14 + hash1(s * 13) * 12,
      delay: hash1(s * 17) * 18,
    };
  });
}
