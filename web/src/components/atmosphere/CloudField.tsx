'use client';

import { useMemo } from 'react';
import { useAtmosphere } from './AtmosphereContext';
import { getGuide } from '@/lib/guides';

const BANK_SRC: Record<string, string> = {
  moon: '/clouds/moon.png',
  ember: '/clouds/ember.png',
  storm: '/clouds/storm.png',
};

interface RowSpec {
  top: number;
  height: number;
  dur: number;
  delay: number;
  op: number;
  mirror: boolean;
}

/**
 * Облачные полосы v3: цвет и дизер-кромка запечены в PNG, слой —
 * бесшовное marquee. Ряды заведомо шире экрана (left:-25%, width:150%),
 * иначе converge-сдвиг на welcome обнажает край.
 * Чтобы гряда не читалась «двумя горизонтальными линиями», ряды разные:
 * дальний — мелкий, бледный, зеркальный и встречный; основной — крупный.
 * Фаза welcome — облака приглушены и подтянуты к центру.
 */
export default function CloudField() {
  const { phase, guideId } = useAtmosphere();
  const guide = getGuide(guideId);
  const src = BANK_SRC[guide.clouds.bank] || BANK_SRC.moon;

  const layers = useMemo<RowSpec[]>(() => {
    const n = guide.clouds.density;
    return Array.from({ length: n }, (_, i) => {
      if (i === 0) {
        return {
          top: 4,
          height: Math.max(18, 26 - (n - 2) * 4),
          dur: 150 / guide.clouds.drift,
          delay: -11,
          op: 0.42,
          mirror: true,
        };
      }
      return {
        top: 26 + (i - 1) * 6,
        height: 44 - (i - 1) * 9,
        dur: 110 / guide.clouds.drift + (i - 1) * 55,
        delay: -i * 31,
        op: Math.max(0.5, 0.95 - (i - 1) * 0.25),
        mirror: false,
      };
    });
  }, [guide.clouds.density, guide.clouds.drift]);

  const converged = phase === 'welcome';

  return (
    <div key={guideId} className="cloud-fade-in cloud-field-v2">
      {layers.map((l, i) => (
        <div
          key={i}
          className={`cloud-row ${l.mirror ? 'cloud-row--mirror' : ''} ${converged ? 'cloud-row--converged' : ''}`}
          style={
            {
              top: `${l.top}%`,
              height: `${l.height}%`,
              opacity: l.op,
              transition: 'opacity 1.2s ease, transform 1.6s cubic-bezier(0.4, 0, 0.2, 1)',
              '--conv-x': i % 2 === 0 ? '-9%' : '11%',
              '--conv-o': '0.25',
            } as React.CSSProperties
          }
        >
          <div
            className={`cloud-track ${l.mirror ? 'cloud-track--reverse' : ''}`}
            style={{ animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s` }}
          >
            <span className="cloud-seg" style={{ backgroundImage: `url(${src})` }} />
            <span className="cloud-seg" style={{ backgroundImage: `url(${src})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
