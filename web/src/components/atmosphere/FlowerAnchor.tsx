'use client';

import PixelFlower from '@/components/PixelFlower';
import { useAtmosphere } from './AtmosphereContext';
import { getGuide } from '@/lib/guides';

/**
 * Ирис х2 — стабильный якорь: одна позиция на всех экранах и фазах,
 * меняется только прозрачность. Никаких переездов между экранами и
 * фазных размеров (vmin один) — иначе на сменах экрана цветок «гуляет»,
 * а на разных разрешениях оказывается в разных местах.
 * Поверх — постоянный flower-float (медленное дыхание), внутри —
 * собственный sway секторов PixelFlower, поэтому цветок живой всегда.
 */
export default function FlowerAnchor() {
  const { phase, guideId } = useAtmosphere();
  const guide = getGuide(guideId);

  const op = phase === 'welcome' ? 0.45 : 0.32;

  return (
    <div
      className="flower-anchor"
      data-phase={phase}
      style={{
        left: '-7%',
        bottom: '-13%',
        width: '72vmin',
        opacity: op,
        transition: 'opacity 1.1s ease',
      }}
      aria-hidden="true"
    >
      <div className="flower-bloom">
        <div className="flower-float">
          <PixelFlower
            seed={guide.flower.seed}
            size={520}
            color={guide.accent}
            bgColor="var(--paper)"
            tilt={guide.flower.tilt}
          />
        </div>
      </div>
    </div>
  );
}
