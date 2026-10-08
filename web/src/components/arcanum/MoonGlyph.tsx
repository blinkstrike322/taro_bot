'use client';

// ─────────────────────────────────────────────────────────────
// MoonGlyph — векторная луна честной фазы: диск + терминатор-
// эллипс (rx зависит от освещённости, выпуклость — от роста/
// убывания). Замена юникодным ☽☾ в кнопках: рисуется чётко
// на любом dpi, в цвет текущего проводника.
// ─────────────────────────────────────────────────────────────

interface MoonGlyphProps {
  /** освещённость 0..1 */
  illum: number;
  /** true — убывает (свет слева) */
  waning: boolean;
  size?: number;
  className?: string;
}

/** путь освещённой части: полуокружность светлой стороны + терминатор */
function moonLitPath(illum: number, waning: boolean): string {
  const r = 10;
  const k = Math.min(0.998, Math.max(0.002, illum));
  const gibbous = k > 0.5;
  const rx = +(r * (gibbous ? 2 * k - 1 : 1 - 2 * k)).toFixed(2);
  // полуокружность светлой стороны: растёт — правая, убывает — левая
  const sideSweep = waning ? 0 : 1;
  // терминатор (возврат снизу вверх): до четверти выпукл в светлую
  // сторону (тонкий серп), после — в тёмную (горб)
  const termSweep = waning ? (gibbous ? 0 : 1) : (gibbous ? 1 : 0);
  return `M12 2A${r} ${r} 0 0 ${sideSweep} 12 22A${rx} ${r} 0 0 ${termSweep} 12 2z`;
}

export default function MoonGlyph({ illum, waning, size = 16, className }: MoonGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* тёмная сторона */}
      <circle cx="12" cy="12" r="10" fill="rgba(255, 255, 255, 0.13)" />
      {/* свет */}
      <path d={moonLitPath(illum, waning)} fill="currentColor" />
      {/* контур диска */}
      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1" />
      {/* кратерная тень на светлой стороне — едва заметная */}
      <circle cx="9.5" cy="9" r="1.6" fill="rgba(0, 0, 0, 0.18)" />
      <circle cx="14.5" cy="14.5" r="1.1" fill="rgba(0, 0, 0, 0.14)" />
    </svg>
  );
}
