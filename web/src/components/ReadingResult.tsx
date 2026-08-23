'use client';

import { getGuide } from '@/lib/guides';
import FollowupChat from './FollowupChat';

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[] | string;
  advice: string;
}

interface ReadingResultProps {
  interpretation: Interpretation;
  characterId?: string;
  readingId?: number | null;
  moodName?: string;
  className?: string;
}

export default function ReadingResult({ interpretation, characterId, readingId = null, moodName, className = '' }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);
  const meanings = Array.isArray(card_meaning) ? card_meaning : card_meaning ? [card_meaning] : [];

  const adviceLabel =
    guide.id === 'ruin_keeper' ? 'слово весты'
    : guide.id === 'spark_of_chaos' ? 'от лилит'
    : 'шёпот селены';

  return (
    <div className={`px-5 pb-5 relative ${className}`}>
      <div className="section-label mb-3 relative z-10">
        <span>толкование{moodName ? ` · ${moodName}` : ''}</span>
      </div>

      <div
        className="relative reading-card noise-bg px-4 py-5"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {/* шапка: сигилы + имя + тег */}
        <div
          className="reading-headline relative z-10 reveal-line"
          style={{ '--rd': '0.05s' } as React.CSSProperties}
        >
          <span className="reading-sigils" aria-hidden="true">
            {guide.cornerSymbols.tl} {guide.cornerSymbols.tr}
          </span>
          <span className="tech-label">{guide.name} · {guide.subtitle}</span>
          <span className="ml-auto tech-label" style={{ color: 'var(--ink-faint)' }}>
            {guide.tag}
          </span>
        </div>

        {/* интро — голос проводницы */}
        {intro && (
          <div
            className="relative z-10 mb-4 flex gap-3 reveal-line"
            style={{ '--rd': '0.25s' } as React.CSSProperties}
          >
            <span className="quote-mark" style={{ color: guide.accentDeep }} aria-hidden="true">«</span>
            <p className="reading-intro pt-1">{intro}</p>
          </div>
        )}

        {/* главное толкование — с буквицей */}
        {short_answer && (
          <div
            className="relative z-10 mb-4 reveal-line"
            style={{ '--rd': '0.5s' } as React.CSSProperties}
          >
            <p className="reading-body">{short_answer}</p>
          </div>
        )}

        {/* разбор по картам — ординалы + линейки */}
        {meanings.length > 0 && (
          <div
            className="relative z-10 mb-4 reveal-line"
            style={{ '--rd': '0.8s' } as React.CSSProperties}
          >
            <div className="reading-section-label mb-2" style={{ color: guide.accentDeep }}>
              карты говорят
            </div>
            <div className="space-y-3">
              {meanings.map((meaning, i) => (
                <div key={i} className="flex gap-2 items-baseline">
                  <span className="reading-ordinal">{String(i + 1).padStart(2, '0')}</span>
                  <p className="flex-1 font-sans text-[14px] leading-[1.7] text-[color:var(--ink)] opacity-92 border-b border-[color:var(--line)] pb-2">
                    {meaning}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* совет — маргиналия */}
        {advice && (
          <div
            className="marginalia mt-5 pt-1 relative z-10 reveal-line"
            style={{ '--rd': '1.05s' } as React.CSSProperties}
          >
            <div className="tech-label mb-1.5" style={{ color: guide.accentDeep }}>
              {adviceLabel}
            </div>
            <p className="font-serif text-[20px] font-semibold leading-[1.4]" style={{ color: 'var(--ink)' }}>
              {advice}
            </p>
          </div>
        )}
      </div>

      {readingId !== null && (
        <FollowupChat readingId={readingId} characterId={characterId} />
      )}
    </div>
  );
}
