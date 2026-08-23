'use client';

import { getGuide } from '@/lib/guides';
import FollowupChat from './FollowupChat';
import PixelFlower from './PixelFlower';

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
  className?: string;
}

export default function ReadingResult({ interpretation, characterId, readingId = null, className = '' }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);

  return (
    <div className={`px-5 pb-5 relative ${className}`}>
      {/* едва заметный цветок на полях толкования */}
      <div
        className="absolute pointer-events-none"
        style={{ top: '6%', right: '-26%', width: '200px', height: '200px' }}
        aria-hidden="true"
      >
        <PixelFlower seed={17} size={260} color={guide.accent} opacity={0.13} />
      </div>

      <div className="section-label mb-3 relative z-10">
        <span>толкование</span>
      </div>

      <div
        className="relative reading-card noise-bg px-4 py-5 flex flex-col justify-between"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {/* интро — голос проводницы крупным курсивом */}
        {intro && (
          <div className="relative z-10 mb-4 flex gap-3">
            <span className="quote-mark" style={{ color: guide.accentDeep }} aria-hidden="true">«</span>
            <p className="font-serif italic text-[23px] leading-[1.3] pt-2" style={{ color: guide.accentDeep }}>
              {intro}
            </p>
          </div>
        )}

        {/* главное толкование */}
        {short_answer && (
          <div className="relative z-10 mb-4">
            <p className="font-sans text-[15.5px] leading-[1.75] text-[color:var(--ink)]">
              {short_answer}
            </p>
          </div>
        )}

        {/* разбор по картам */}
        {card_meaning && (Array.isArray(card_meaning) ? card_meaning.length > 0 : card_meaning) && (
          <div className="relative z-10 mb-4">
            <div className="reading-section-label mb-2" style={{ color: guide.accentDeep }}>
              карты говорят
            </div>
            <div className="space-y-3">
              {(Array.isArray(card_meaning) ? card_meaning : [card_meaning]).map((meaning, i) => (
                <p
                  key={i}
                  className="relative pl-3.5 font-sans text-[14px] leading-[1.7] text-[color:var(--ink)] opacity-92"
                >
                  <span
                    className="absolute left-0 top-[0.55em] w-1 h-1 rounded-full"
                    style={{ backgroundColor: guide.accent }}
                    aria-hidden="true"
                  />
                  {meaning}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* совет — маргиналия на линии */}
        {advice && (
          <div className="marginalia mt-5 pt-1 relative z-10">
            <div className="tech-label mb-1.5" style={{ color: guide.accentDeep }}>
              {guide.id === 'ruin_keeper' ? 'слово весты' : guide.id === 'spark_of_chaos' ? 'от лилит' : 'шёпот селены'}
            </div>
            <p className="font-serif text-[19px] font-semibold leading-[1.4]" style={{ color: 'var(--ink)' }}>
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
