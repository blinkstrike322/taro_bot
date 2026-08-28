'use client';

// ─────────────────────────────────────────────────────────────
// CrtNoise — живое зерно катодной трубки.
// Canvas на пониженном разрешении, перерисовка ~14 к/с,
// merge через overlay — едва заметное дыхание помех.
// Раз в ~10 секунд — короткая «полоса трекинга», как на старом
// видеомагнитофоне. prefers-reduced-motion замирает кадром.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

export default function CrtNoise() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const c2 = canvas.getContext('2d', { alpha: true });
    if (!c2) return;

    const W = 160;
    const H = Math.max(120, Math.round((160 * window.innerHeight) / Math.max(1, window.innerWidth)));
    canvas.width = W;
    canvas.height = H;
    const img = c2.createImageData(W, H);

    let raf = 0;
    let last = 0;
    let nextGlitchAt = performance.now() + 5000 + Math.random() * 7000;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (t: number) => {
      if (reduced) return; // один статичный кадр
      raf = requestAnimationFrame(draw);
      if (t - last < 68) return; // ~14 fps — глазу достаточно
      last = t;

      const d = img.data;
      const n = d.length;
      for (let i = 0; i < n; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 12 + ((Math.random() * 26) | 0);
      }

      // редкая полоса трекинга — ярче и с горизонтальным сдвигом
      if (t > nextGlitchAt) {
        nextGlitchAt = t + 9000 + Math.random() * 9000;
        const bandY = (Math.random() * (H - 8)) | 0;
        const bandH = 3 + ((Math.random() * 4) | 0);
        for (let y = bandY; y < bandY + bandH && y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4 + 3;
            d[i] = Math.min(255, d[i] + 66);
          }
        }
      }

      c2.putImageData(img, 0, 0);
    };

    // первый статичный кадр (для reduced-motion и мгновенного появления)
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
      d[i + 3] = 16 + ((Math.random() * 20) | 0);
    }
    c2.putImageData(img, 0, 0);

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="crt-noise" aria-hidden="true" />;
}
