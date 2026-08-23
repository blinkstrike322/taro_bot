'use client';

import { useMemo } from 'react';
import { useAtmosphere } from './AtmosphereContext';
import { getGuide } from '@/lib/guides';

const BANK_SRC: Record<string, string> = {
  moon: '/clouds/moon.png',
  ember: '/clouds/ember.png',
  storm: '/clouds/storm.png',
};

/**
 * Гибридные облака: цветная форма проводницы (PNG-банк используется как маска)
 * + пиксель-дизер кромка (dot-паттерн, замаскированный тем же PNG).
 * Только transform/opacity-анимации. Фаза welcome — облака стянуты к центру.
 */
export default function CloudField() {
  const { phase, guideId } = useAtmosphere();
  const guide = getGuide(guideId);
  const src = BANK_SRC[guide.clouds.bank] || BANK_SRC.moon;

  const layers = useMemo(
    () =>
      Array.from({ length: guide.clouds.density }, (_, i) => ({
        top: 4 + i * 34,
        scale: 1.15 - i * 0.18,
        dur: 90 / guide.clouds.drift + i * 30,
        delay: -i * 17,
        op: 0.5 - i * 0.12,
      })),
    [guide.clouds.density, guide.clouds.drift],
  );

  const converged = phase === 'welcome';

  return (
    <div key={guideId} className="cloud-fade-in" style={{ position: 'absolute', inset: 0 }}>
      {layers.map((l, i) => (
        <div
          key={i}
          className={`cloud-layer ${converged ? 'cloud-layer--converged' : ''}`}
          style={
            {
              top: `${l.top}%`,
              animationDuration: `${l.dur}s`,
              animationDelay: `${l.delay}s`,
              opacity: l.op,
              mixBlendMode: guide.clouds.blend,
              filter: guide.clouds.tint,
              transition: 'opacity 1.2s ease, transform 1.6s cubic-bezier(0.4, 0, 0.2, 1)',
              '--conv-x': i % 2 === 0 ? '-12%' : '14%',
              '--conv-o': '0.3',
              transform: `scale(${l.scale})`,
            } as React.CSSProperties
          }
        >
          <div
            className="cloud-img"
            style={{
              backgroundColor: guide.clouds.color,
              WebkitMaskImage: `url(${src})`,
              maskImage: `url(${src})`,
            }}
          />
          <div
            className="cloud-dither"
            style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }}
          />
        </div>
      ))}
    </div>
  );
}
