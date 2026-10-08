'use client';

// ─────────────────────────────────────────────────────────────
// AmbientSigil — оригинальная анимированная пентаграмма с фона
// taro_bot (порт 1:1: слои, палитра, геометрия пиксельных шагов,
// позиционирование top -6% / right -10%, маска 82%/18%).
//
// ОПТИМИЗАЦИЯ (оригинал жрал ~6.8k SVG-узлов):
//   · каждый слой — отдельный <svg>; вращения — CSS-transform
//     на корне svg → композитный слой, растеризация один раз;
//   · пиксельные линии/круги слиты в один <path> на цвет
//     (геометрия Брезенхэма идентична исходным rect-последовательностям);
//   · мерцающие точки — HTML-спаны поверх (opacity-анимации
//     на своих слоях, SVG не перерисовывается);
//   · пауза при data-typing / data-scrolling (как у всех ambient-слоёв);
//   · prefers-reduced-motion → статичный кадр;
//   · на слабых устройствах компонент просто не монтируется.
// ─────────────────────────────────────────────────────────────
import { memo, useMemo } from 'react';

interface AmbientSigilProps {
  /** акцент-цвет текущего проводника — задаёт тон сигилу */
  accent: string;
  accentDim: string;
  /** в транскрипте есть чтение — сигил уходит в фон (opacity 0.45) */
  dim?: boolean;
}

// ── палитра оригинала (многослойные «чернила» гримуара) ──
const MOONLIGHT = 'rgba(255, 255, 255, 0.78)';
const SILVER = 'rgba(228, 224, 240, 0.45)';
const GHOST = 'rgba(210, 206, 232, 0.22)';
const EMBER = 'rgba(255, 235, 200, 0.7)';

// ── пиксельная геометрия (шаги как в оригинале) ──

function circlePts(cx: number, cy: number, r: number): number[][] {
  const steps = Math.max(24, Math.floor(r * 5));
  const pts: number[][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
  }
  return pts;
}

function linePts(x0: number, y0: number, x1: number, y1: number): number[][] {
  const pts: number[][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let guard = 0;
  while (guard++ < 2000) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return pts;
}

/** точки → path из квадратиков толщиной t (как rect в оригинале) */
function ptsToPath(pts: number[][], t: number): string {
  const half = Math.floor(t / 2);
  let d = '';
  for (const [x, y] of pts) {
    d += `M${x - half} ${y - half}h${t}v${t}h-${t}z`;
  }
  return d;
}

function polyPath(pts: number[][], t: number): string {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d += ptsToPath(linePts(a[0], a[1], b[0], b[1]), t);
  }
  return d;
}

function pentVertex(i: number, r = 110): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return [Math.round(200 + Math.cos(a) * r), Math.round(200 + Math.sin(a) * r)];
}

/** один path — весь слой; вычисляется детерминированно */
function buildGeometry() {
  // LAYER 1 · внешние кольца (вращение 90s cw)
  const ringPath =
    ptsToPath(circlePts(200, 200, 180), 3) +
    ptsToPath(circlePts(200, 200, 168), 2);
  // засечки: 36 штук, major — r 175→162, minor — 175→170
  let ticksAccent = '';
  let ticksSilver = '';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const major = i % 9 === 0;
    const rInner = major ? 162 : 170;
    const x = Math.round(200 + Math.cos(a) * 175);
    const y = Math.round(200 + Math.sin(a) * 175);
    const x2 = Math.round(200 + Math.cos(a) * rInner);
    const y2 = Math.round(200 + Math.sin(a) * rInner);
    const w = Math.abs(x - x2) + 1;
    const h = Math.abs(y - y2) + 1;
    const sub = `M${Math.min(x, x2)} ${Math.min(y, y2)}h${w}v${h}h-${w}z`;
    if (major) ticksAccent += sub;
    else ticksSilver += sub;
  }

  // LAYER 2 · средние кольца (статика)
  const midPath = ptsToPath(circlePts(200, 200, 145), 2) + ptsToPath(circlePts(200, 200, 140), 1);

  // LAYER 3 · пентаграмма (пульс 4s): контур + линии
  const pent: [number, number][] = [0, 1, 2, 3, 4].map((i) => pentVertex(i));
  const pentagonPath = polyPath(pent, 2);
  const order = [0, 2, 4, 1, 3];
  let pentagramPath = '';
  for (let i = 0; i < order.length; i++) {
    const a = pent[order[i]];
    const b = pent[order[(i + 1) % order.length]];
    pentagramPath += ptsToPath(linePts(a[0], a[1], b[0], b[1]), 3);
  }

  // LAYER 4 · гексаграмма (вращение 70s ccw): два треугольника r=70
  let hexPath = '';
  const tri: [number, number][][] = [[], []];
  for (let i = 0; i < 3; i++) {
    const aUp = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    tri[0].push([Math.round(200 + Math.cos(aUp) * 70), Math.round(200 + Math.sin(aUp) * 70)]);
    const aDn = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    tri[1].push([Math.round(200 + Math.cos(aDn) * 70), Math.round(200 + Math.sin(aDn) * 70)]);
  }
  hexPath = polyPath(tri[0], 2) + polyPath(tri[1], 2);

  // LAYER 5 · ядро (статика): кольца + угли-крест + внешнее кольцо-свечение
  const coreAccent = ptsToPath(circlePts(200, 200, 35), 2);
  const coreGhost = ptsToPath(circlePts(200, 200, 30), 1);
  const coreFaint = ptsToPath(circlePts(200, 200, 195), 2);

  // мерцающие точки: 12 зодиак-точек r=145 + 5 искр вершин + центр
  const zodiac: { x: number; y: number; color: string; op: number; delay: number }[] = [];
  const palette = [null, MOONLIGHT, SILVER]; // 0 → акцент (подставим в рендере)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    zodiac.push({
      x: Math.round(200 + Math.cos(a) * 145) - 1,
      y: Math.round(200 + Math.sin(a) * 145) - 1,
      color: palette[i % 3] ?? 'ACCENT',
      op: i % 3 === 0 ? 0.85 : 0.55,
      delay: i * 0.35,
    });
  }
  const sparks = pent.map((v, i) => ({
    x: v[0] - 3, y: v[1] - 3, size: 6,
    delay: i * 0.45, dur: 2.6 + i * 0.3,
  }));

  return { ringPath, ticksAccent, ticksSilver, midPath, pentagonPath, pentagramPath, hexPath, coreAccent, coreGhost, coreFaint, zodiac, sparks };
}

const GEO = buildGeometry();

export default memo(function AmbientSigil({ accent, accentDim, dim }: AmbientSigilProps) {
  // акцент-цвет подставляется в точки палитры (единственная
  // динамическая часть — потому геометрия считается один раз)
  const zodiacDots = useMemo(
    () => GEO.zodiac.map((z) => ({ ...z, color: z.color === 'ACCENT' ? accent : z.color })),
    [accent],
  );

  return (
    <div
      className={`ambient-sigil${dim ? ' ambient-sigil--dim' : ''}`}
      aria-hidden="true"
      style={{ '--guide-accent': accent, '--smoke': accentDim } as React.CSSProperties}
    >
      {/* ореол за сигилом: двойное свечение, задано в CSS */}
      <div className="ambient-sigil__halo" />

      {/* LAYER 1: внешние кольца — медленное вращение */}
      <svg className="amb-svg amb-svg--ring" viewBox="0 0 400 400" shapeRendering="crispEdges">
        <path d={GEO.ringPath} fill={MOONLIGHT} />
        <path d={GEO.ticksAccent} fill={accent} fillOpacity={0.85} />
        <path d={GEO.ticksSilver} fill={SILVER} fillOpacity={0.45} />
      </svg>

      {/* LAYER 2: средние кольца — статика */}
      <svg className="amb-svg amb-svg--static" viewBox="0 0 400 400" shapeRendering="crispEdges">
        <path d={GEO.midPath} fill={MOONLIGHT} />
      </svg>

      {/* LAYER 3: пентаграмма — дыхание */}
      <svg className="amb-svg amb-svg--pent" viewBox="0 0 400 400" shapeRendering="crispEdges">
        <path d={GEO.pentagonPath} fill={SILVER} />
        <path d={GEO.pentagramPath} fill={accent} />
      </svg>

      {/* LAYER 4: гексаграмма — встречное вращение */}
      <svg className="amb-svg amb-svg--hex" viewBox="0 0 400 400" shapeRendering="crispEdges">
        <path d={GEO.hexPath} fill={MOONLIGHT} />
      </svg>

      {/* LAYER 5: ядро — тёплые угли (статика) */}
      <svg className="amb-svg amb-svg--static" viewBox="0 0 400 400" shapeRendering="crispEdges">
        <path d={GEO.coreAccent} fill={accent} fillOpacity={0.85} />
        <path d={GEO.coreGhost} fill={GHOST} />
        <rect x={197} y={184} width={6} height={32} fill={EMBER} />
        <rect x={184} y={197} width={32} height={6} fill={EMBER} />
        <path d={GEO.coreFaint} fill={accent} fillOpacity={0.42} />
      </svg>

      {/* мерцающие точки: HTML-спаны, SVG не трогают */}
      {zodiacDots.map((z, i) => (
        <span
          key={`zod-${i}`}
          className="sigil-dot"
          style={
            {
              left: `${z.x / 4}%`,
              top: `${z.y / 4}%`,
              width: '0.5%',
              height: '0.5%',
              background: z.color,
              '--dot-op': z.op,
              '--dot-delay': `${z.delay}s`,
              '--dot-dur': '3.2s',
            } as React.CSSProperties
          }
        />
      ))}
      {GEO.sparks.map((s, i) => (
        <span
          key={`spark-${i}`}
          className="sigil-dot"
          style={
            {
              left: `${s.x / 4}%`,
              top: `${s.y / 4}%`,
              width: '1.5%',
              height: '1.5%',
              background: accent,
              '--dot-op': 1,
              '--dot-delay': `${s.delay}s`,
              '--dot-dur': `${s.dur}s`,
            } as React.CSSProperties
          }
        />
      ))}
      <span
        className="sigil-dot"
        style={
          {
            left: '49%',
            top: '49%',
            width: '2%',
            height: '2%',
            background: MOONLIGHT,
            '--dot-op': 1,
            '--dot-delay': '0s',
            '--dot-dur': '2.4s',
          } as React.CSSProperties
        }
      />
    </div>
  );
});
