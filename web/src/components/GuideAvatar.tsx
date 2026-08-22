'use client';

import { GuideMeta } from '@/lib/guides';

/**
 * Аватар проводницы: картинка или сигнатурный цвет (плоская плашка),
 * если portraitColor задан в guides.ts.
 */
export default function GuideAvatar({
  guide,
  size,
  className = '',
}: {
  guide: GuideMeta;
  size?: number;
  className?: string;
}) {
  if (guide.portraitColor) {
    return (
      <span
        className={`block ${className}`}
        style={{
          width: size,
          height: size,
          background: guide.portraitColor,
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={guide.portrait}
      alt={guide.name}
      className={`object-cover ${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
