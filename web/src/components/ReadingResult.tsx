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
}

export default function ReadingResult({ interpretation, characterId, readingId = null }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);

  return (
    <div className="px-3 pb-4">
      <div className="section-label mb-2">
        <span>Толкование</span>
      </div>

      <div
        className="relative reading-card noise-bg p-4"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {/* мягкий пастельный отсвет сверху */}
        <div
          className="absolute inset-x-0 top-0 h-20 pointer-events-none"
          style={{
            background: `linear-gradient(180deg, ${guide.accentSoft} 0%, transparent 100%)`,
            opacity: 0.7,
          }}
          aria-hidden="true"
        />

        {/* вступление — голос проводницы */}
        {intro && (
          <p className="font-serif italic text-[19px] leading-snug relative z-10 mb-3" style={{ color: guide.accentDeep }}>
            {intro}
          </p>
        )}

        {/* главное толкование */}
        {short_answer && (
          <p className="font-sans text-[14.5px] leading-relaxed text-[color:var(--ink)] relative z-10">
            {short_answer}
          </p>
        )}

        {/* разбор по картам */}
        {card_meaning && (Array.isArray(card_meaning) ? card_meaning.length > 0 : card_meaning) && (
          <div className="mt-3 space-y-2.5 relative z-10">
            {(Array.isArray(card_meaning) ? card_meaning : [card_meaning]).map((meaning, i) => (
              <p key={i} className="font-sans text-[13.5px] leading-relaxed text-[color:var(--ink)] opacity-90">
                {meaning}
              </p>
            ))}
          </div>
        )}

        {/* совет — отдельная пастельная карточка */}
        {advice && (
          <div
            className="mt-4 relative z-10 p-3.5"
            style={{
              background: guide.accentSoft,
              borderRadius: 16,
              border: `1px dashed ${guide.accentDim}`,
            }}
          >
            <div className="font-pixel text-[9px] tracking-[0.2em] uppercase mb-1.5" style={{ color: guide.accentDeep }}>
              ✦ {guide.id === 'ruin_keeper' ? 'Слово Весты' : guide.id === 'spark_of_chaos' ? 'От Лилит' : 'Шёпот Селены'}
            </div>
            <p className="font-serif text-[17px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
              {advice}
            </p>
          </div>
        )}
      </div>

      {/* доп-вопросы по раскладу */}
      {readingId !== null && (
        <FollowupChat readingId={readingId} characterId={characterId} />
      )}
    </div>
  );
}
