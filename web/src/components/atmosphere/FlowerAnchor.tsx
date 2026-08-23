'use client';

import PixelFlower from '@/components/PixelFlower';
import { useAtmosphere } from './AtmosphereContext';
import { getGuide } from '@/lib/guides';

/**
 * Ирис х2 с фазовыми позициями:
 * welcome — прорастает снизу (мал, по центру-низу);
 * draw    — крупный слева-снизу (≈70vmin);
 * reveal  — как draw + усиленное покачивание (CSS data-phase);
 * reading — уменьшенный на полях справа.
 */
export default function FlowerAnchor() {
  const { phase, guideId } = useAtmosphere();
  const guide = getGuide(guideId);

  const pos =
    phase === 'welcome'
      ? { left: '50%', right: 'auto', bottom: '2%', width: '34vmin', transform: 'translateX(-50%)', op: 0.35 }
      : phase === 'reading'
        ? { left: 'auto', right: '-14%', bottom: '8%', width: '40vmin', transform: 'none', op: 0.2 }
        : { left: '-14%', right: 'auto', bottom: '-20%', width: '70vmin', transform: 'none', op: 0.26 };

  return (
    <div
      className="flower-anchor"
      data-phase={phase}
      style={{
        left: pos.left,
        right: pos.right,
        bottom: pos.bottom,
        width: pos.width,
        opacity: pos.op,
        transform: pos.transform,
        transition: 'all 1.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.1s ease',
      }}
      aria-hidden="true"
    >
      <PixelFlower
        seed={guide.flower.seed}
        size={520}
        color={guide.accent}
        bgColor="var(--paper)"
        tilt={guide.flower.tilt}
      />
    </div>
  );
}
