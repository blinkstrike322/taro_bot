'use client';

// ─────────────────────────────────────────────────────────────
// AmbientSigil — анимированная пентаграмма на заднем слое фона.
// Вайб: "оккультный терминал для женской аудитории" — мягкая
// маска по краям, медленный дрейф, лёгкое дыхание акцентом.
// Не перебивает CRT-шум и не мешает чтению транскрипта.
//
// impeccable-disable shape-assembled-illustration -- намеренный
// геометрический оккультный сигил (дизайн-док Dithered Divinations),
// НЕ placeholder-клипарт. Также дублируется в .impeccable/config.json.
// ─────────────────────────────────────────────────────────────
import { memo, useMemo } from 'react';

interface AmbientSigilProps {
  /** акцент-цвет текущего проводника — задаёт тон сигилу */
  accent: string;
  accentDim: string;
}

function seededRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

// ── Pixel line helpers (упрощённые — без избыточных props) ──
function pixelCircle(
  cx: number, cy: number, r: number, thickness: number,
  fill: string, opacity: number
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  const steps = Math.max(24, Math.floor(r * 5));
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(angle) * r);
    const y = Math.round(cy + Math.sin(angle) * r);
    out.push(
      <rect
        key={`pc-${cx}-${cy}-${r}-${i}`}
        x={x - Math.floor(thickness / 2)}
        y={y - Math.floor(thickness / 2)}
        width={thickness}
        height={thickness}
        fill={fill}
        opacity={opacity}
      />
    );
  }
  return out;
}

function pixelLine(
  x0: number, y0: number, x1: number, y1: number,
  thickness: number, fill: string, opacity: number
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  let guard = 0;
  const half = Math.floor(thickness / 2);
  while (guard++ < 2000) {
    out.push(
      <rect
        key={`pl-${x0}-${y0}-${x1}-${y1}-${guard}`}
        x={x - half}
        y={y - half}
        width={thickness}
        height={thickness}
        fill={fill}
        opacity={opacity}
      />
    );
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

function pentagonVertex(cx: number, cy: number, r: number, i: number) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

export default memo(function AmbientSigil({ accent, accentDim }: AmbientSigilProps) {
  // ── Многослойная палитра — НЕ однотонная ──
  // Идея: как настоящий пергаментный гримуар — разные линии написаны
  // разными чернилами разной свежести. accent — главный пигмент,
  // но есть ещё moonlight (холодный белый), silver (приглушённый),
  // ember (тёплый блик акцента), ink (тёмный контур).
  const accentBright = accent;                       // primary — pentagram, vertex sparks, cardinal markers
  const moonlight = 'rgba(255, 255, 255, 0.78)';      // bright white — outer ring, hexagram (лунный свет)
  const silver = 'rgba(228, 224, 240, 0.45)';         // dim white — middle ring, pentagon outline (старое серебро)
  const ghost = 'rgba(210, 206, 232, 0.22)';          // very faint — inner faint rings (выцветшие линии)
  const ember = 'rgba(255, 235, 200, 0.7)';           // warm glint — center cross, inner core (тёплый блик)
  const ink = '#080714';                              // dark contrast — center dot (точка фокуса)

  // ── memoised geometry ──
  const pentVertices = useMemo(
    () => [0, 1, 2, 3, 4].map(i => pentagonVertex(200, 200, 110, i)),
    []
  );
  const pentLines = useMemo(() => {
    const order = [0, 2, 4, 1, 3];
    const lines: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let i = 0; i < order.length; i++) {
      const a = pentVertices[order[i]];
      const b = pentVertices[order[(i + 1) % order.length]];
      lines.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    }
    return lines;
  }, [pentVertices]);

  const hexVertices = useMemo(() => {
    const up: { x: number; y: number }[] = [];
    const down: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const angleUp = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      up.push({ x: 200 + Math.cos(angleUp) * 70, y: 200 + Math.sin(angleUp) * 70 });
      const angleDown = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      down.push({ x: 200 + Math.cos(angleDown) * 70, y: 200 + Math.sin(angleDown) * 70 });
    }
    return { up, down };
  }, []);

  const outerTicks = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; major: boolean }[] = [];
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      const major = i % 9 === 0;
      const rOuter = 175;
      const rInner = major ? 162 : 170;
      const x = Math.round(200 + Math.cos(angle) * rOuter);
      const y = Math.round(200 + Math.sin(angle) * rOuter);
      const x2 = Math.round(200 + Math.cos(angle) * rInner);
      const y2 = Math.round(200 + Math.sin(angle) * rInner);
      out.push({
        x: Math.min(x, x2),
        y: Math.min(y, y2),
        w: Math.abs(x - x2) + 1,
        h: Math.abs(y - y2) + 1,
        major,
      });
    }
    return out;
  }, []);

  // мерцающие вершины пентаграммы
  const vertexSparks = useMemo(
    () => pentVertices.map((v, i) => ({
      x: Math.round(v.x), y: Math.round(v.y),
      delay: i * 0.45, dur: 2.6 + i * 0.3,
    })),
    [pentVertices]
  );

  // 12 зодиак-точек на среднем круге — чередование accent / silver / moonlight
  const zodiacDots = useMemo(() => {
    const dots: React.ReactElement[] = [];
    const palette = [accentBright, moonlight, silver];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(200 + Math.cos(angle) * 145);
      const y = Math.round(200 + Math.sin(angle) * 145);
      const fill = palette[i % 3];
      dots.push(
        <rect
          key={`zod-${i}`}
          x={x - 1} y={y - 1} width={2} height={2}
          fill={fill}
          opacity={i % 3 === 0 ? 0.85 : 0.55}
          className="sigil-dot"
          style={{
            '--dot-op': i % 3 === 0 ? 0.85 : 0.55,
            '--dot-delay': `${i * 0.35}s`,
            '--dot-dur': '3.2s',
          } as React.CSSProperties}
        />
      );
    }
    return dots;
  }, [accentBright, moonlight, silver]);

  return (
    <div className="ambient-sigil" aria-hidden="true">
      {/* glow halo behind the sigil */}
      <div
        className="ambient-sigil__halo"
        style={{ background: `radial-gradient(circle at 50% 50%, ${accentDim} 0%, transparent 60%)` }}
      />

      <svg
        viewBox="0 0 400 400"
        className="ambient-sigil__svg"
        style={{ imageRendering: 'pixelated' }}
        shapeRendering="crispEdges"
      >
        {/* LAYER 1: OUTER RING (slow rotation) */}
        <g className="sigil-rotate-slow">
          {pixelCircle(200, 200, 180, 3, moonlight, 1)}
          {pixelCircle(200, 200, 168, 2, silver, 1)}
          {outerTicks.map((t, i) => (
            <rect
              key={`tick-${i}`}
              x={t.x} y={t.y} width={t.w} height={t.h}
              fill={t.major ? accentBright : silver}
              opacity={t.major ? 0.85 : 0.45}
            />
          ))}
        </g>

        {/* LAYER 2: MIDDLE RING (static) */}
        {pixelCircle(200, 200, 145, 2, moonlight, 1)}
        {pixelCircle(200, 200, 140, 1, ghost, 1)}
        {zodiacDots}

        {/* LAYER 3: PENTAGRAM (pulsing) */}
        <g className="sigil-pulse">
          {/* faint pentagon outline */}
          {(() => {
            const els: React.ReactElement[] = [];
            for (let i = 0; i < 5; i++) {
              const a = pentVertices[i];
              const b = pentVertices[(i + 1) % 5];
              els.push(...pixelLine(
                Math.round(a.x), Math.round(a.y),
                Math.round(b.x), Math.round(b.y),
                2, silver, 1
              ));
            }
            return els;
          })()}
          {/* pentagram lines — главный акцент, толстые и насыщенные */}
          {pentLines.map((l, i) => (
            <g key={`pent-${i}`}>
              {pixelLine(
                Math.round(l.x0), Math.round(l.y0),
                Math.round(l.x1), Math.round(l.y1),
                3, accentBright, 1
              )}
            </g>
          ))}
        </g>

        {/* LAYER 4: HEXAGRAM (counter-rotating) */}
        <g className="sigil-rotate-slow-rev">
          {(() => {
            const els: React.ReactElement[] = [];
            for (let i = 0; i < 3; i++) {
              const a = hexVertices.up[i];
              const b = hexVertices.up[(i + 1) % 3];
              els.push(...pixelLine(
                Math.round(a.x), Math.round(a.y),
                Math.round(b.x), Math.round(b.y),
                2, moonlight, 1
              ));
            }
            for (let i = 0; i < 3; i++) {
              const a = hexVertices.down[i];
              const b = hexVertices.down[(i + 1) % 3];
              els.push(...pixelLine(
                Math.round(a.x), Math.round(a.y),
                Math.round(b.x), Math.round(b.y),
                2, moonlight, 1
              ));
            }
            return els;
          })()}
        </g>

        {/* LAYER 5: INNER CORE — тёплый ember */}
        {pixelCircle(200, 200, 35, 2, accentBright, 0.85)}
        {pixelCircle(200, 200, 30, 1, ghost, 1)}
        <rect x={197} y={184} width={6} height={32} fill={ember} opacity={1} />
        <rect x={184} y={197} width={32} height={6} fill={ember} opacity={1} />
        <rect
          x={196} y={196} width={8} height={8}
          fill={moonlight}
          className="sigil-dot"
          style={{ '--dot-op': 1, '--dot-delay': '0s', '--dot-dur': '2.4s' } as React.CSSProperties}
        />

        {/* LAYER 6: VERTEX SPARKS — яркие акценты */}
        {vertexSparks.map((s, i) => (
          <rect
            key={`spark-${i}`}
            x={s.x - 3} y={s.y - 3} width={6} height={6}
            fill={accentBright}
            className="sigil-dot"
            style={{
              '--dot-op': 1,
              '--dot-delay': `${s.delay}s`,
              '--dot-dur': `${s.dur}s`,
            } as React.CSSProperties}
          />
        ))}

        {/* outer faint glow ring */}
        {pixelCircle(200, 200, 195, 2, accentBright, 0.42)}
      </svg>
    </div>
  );
});
