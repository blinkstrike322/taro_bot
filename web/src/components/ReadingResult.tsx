'use client';

import { getGuide } from '@/lib/guides';
import FollowupChat from './FollowupChat';

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[] | string;
  advice: string;
}

/**
 * Сплошной простыня-текст ЛЛМ тяжело читать: делим на абзацы.
 * Явные \n\n уважаем; иначе режем на предложения (без lookbehind —
 * старые WebView) и собираем абзацы по ~2 предложения / ~220 знаков.
 */
export function splitParagraphs(text: string, maxLen = 220): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (/\n\n+/.test(clean)) {
    return clean.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  }
  const sentences = clean.match(/[^.!?…]+[.!?…]+["»)\]]*\s*/g) ?? [clean];
  const paras: string[] = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (cur && cur.length + s.length > maxLen) {
      paras.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) paras.push(cur);
  return paras;
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
  const introParas = splitParagraphs(intro, 180);
  const bodyParas = splitParagraphs(short_answer);
  const adviceParas = splitParagraphs(advice, 180);

  const adviceLabel =
    guide.id === 'ruin_keeper' ? 'слово весты'
    : guide.id === 'spark_of_chaos' ? 'от лилит'
    : 'шёпот селены';

  return (
    <div className={`px-3 pb-5 relative ${className}`}>
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
        {introParas.length > 0 && (
          <div
            className="relative z-10 mb-4 flex gap-3 reveal-line"
            style={{ '--rd': '0.25s' } as React.CSSProperties}
          >
            <span className="quote-mark" style={{ color: guide.accentDeep }} aria-hidden="true">«</span>
            <div className="pt-1">
              {introParas.map((p, i) => (
                <p key={i} className={`reading-intro${i > 0 ? ' reading-body--next' : ''}`}>{p}</p>
              ))}
            </div>
          </div>
        )}

        {/* главное толкование — абзацы, у первого буквица */}
        {bodyParas.length > 0 && (
          <div
            className="relative z-10 mb-4 reveal-line"
            style={{ '--rd': '0.5s' } as React.CSSProperties}
          >
            {bodyParas.map((p, i) => (
              <p
                key={i}
                className={`reading-body${i === 0 ? ' reading-body--lead' : ' reading-body--next'}`}
              >
                {p}
              </p>
            ))}
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
                  <div className="flex-1 border-b border-[color:var(--line)] pb-2">
                    {splitParagraphs(meaning, 200).map((p, j) => (
                      <p
                        key={j}
                        className={`font-sans text-[14px] leading-[1.7] text-[color:var(--ink)] opacity-92${j > 0 ? ' reading-body--next' : ''}`}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* совет — маргиналия */}
        {adviceParas.length > 0 && (
          <div
            className="marginalia mt-5 pt-1 relative z-10 reveal-line"
            style={{ '--rd': '1.05s' } as React.CSSProperties}
          >
            <div className="tech-label mb-1.5" style={{ color: guide.accentDeep }}>
              {adviceLabel}
            </div>
            {adviceParas.map((p, i) => (
              <p
                key={i}
                className={`font-serif text-[20px] font-semibold leading-[1.4]${i > 0 ? ' reading-body--next' : ''}`}
                style={{ color: 'var(--ink)' }}
              >
                {p}
              </p>
            ))}
          </div>
        )}
      </div>

      {readingId !== null && (
        <FollowupChat readingId={readingId} characterId={characterId} />
      )}
    </div>
  );
}
