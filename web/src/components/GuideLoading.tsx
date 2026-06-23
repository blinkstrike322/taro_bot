'use client';

import type { GuideMeta } from '@/lib/guides';

interface GuideLoadingProps {
  guide: GuideMeta;
}

export default function GuideLoading({ guide }: GuideLoadingProps) {
  return (
    <div
      className="guide-loading"
      style={{ '--guide-accent': guide.accent } as React.CSSProperties}
    >
      <span
        className="guide-loading-dot"
        style={{ '--dot-delay': '0s' } as React.CSSProperties}
      />
      <span
        className="guide-loading-dot"
        style={{ '--dot-delay': '0.2s' } as React.CSSProperties}
      />
      <span
        className="guide-loading-dot"
        style={{ '--dot-delay': '0.4s' } as React.CSSProperties}
      />
      <span>{guide.loadingPhrase}</span>
    </div>
  );
}
