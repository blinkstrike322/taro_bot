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
}

export default function ReadingResult({ interpretation, characterId, readingId = null }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);

  return (
    <div className="px-5 pb-5 relative">
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
        className="relative reading-card noise-bg px-1 py-4"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {/* интро — голос проводницы крупным курсивом с засечкой-кавычкой */}
        {intro && (
          <div className="relative z-10 mb-3 flex gap-2">
            <span className="quote-mark" style={{ color: guide.accentDeep }} aria-hidden="true">«</span>
            <p className="font-serif italic text-[21px] leading-snug pt-2" style={{ color: guide.accentDeep }}>
              {intro}
            </p>
          </div>
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

        {/* совет — маргиналия на линии */}
        {advice && (
          <div className="marginalia mt-4 pt-0.5 relative z-10">
            <div className="tech-label mb-1" style={{ color: guide.accentDeep }}>
              {guide.id === 'ruin_keeper' ? 'слово весты' : guide.id === 'spark_of_chaos' ? 'от лилит' : 'шёпот селены'}
            </div>
            <p className="font-serif text-[18px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
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
