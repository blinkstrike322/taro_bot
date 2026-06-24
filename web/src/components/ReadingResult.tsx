'use client';

import { getGuide } from '@/lib/guides';

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[] | string;
  advice: string;
}

interface ReadingResultProps {
  interpretation: Interpretation;
  characterId?: string;
}

// Convert hex color (#RRGGBB) to rgba string at given opacity
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ReadingResult({ interpretation, characterId }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;
  const guide = getGuide(characterId);
  // ~75% opacity (was 0.65, +10% brighter) + ~15% glow via textShadow
  const adviceColor = hexToRgba(guide.accent, 0.75);
  const adviceGlow = `0 0 4px ${hexToRgba(guide.accent, 0.30)}, 0 0 8px ${hexToRgba(guide.accent, 0.15)}`;

  return (
    <div className="px-3 py-2">
      <div className="stream-label mb-2">
        DIVINATION.STREAM
        <span className="text-white/20 mx-1">//</span>
        READOUT
      </div>

      <div className="relative frame-ritual noise-bg p-3 min-h-[120px]">
        {/* asymmetrical corner ornaments */}
        <span className="corner-tl">╔</span>
        <span className="corner-tr">┐</span>
        <span className="corner-bl">└</span>
        <span className="corner-br">╝</span>

        {/* circuit traces */}
        <div
          className="circuit-trace circuit-trace--v"
          style={{ left: '12%', top: 0, bottom: 0 }}
        />
        <div
          className="circuit-trace circuit-trace--h"
          style={{ bottom: '20%', left: 0, right: 0 }}
        />

        {/* square and dot ornaments along edges */}
        <span className="glyph-fragment" style={{ top: '8px', right: '20%' }}>■</span>
        <span className="glyph-fragment" style={{ top: '8px', right: '12%' }}>·</span>
        <span className="glyph-fragment" style={{ bottom: '8px', right: '20%' }}>·</span>
        <span className="glyph-fragment" style={{ bottom: '8px', right: '12%' }}>■</span>
        <span className="glyph-fragment" style={{ top: '8px', left: '20%' }}>·</span>
        <span className="glyph-fragment" style={{ top: '8px', left: '12%' }}>■</span>
        <span className="glyph-fragment" style={{ bottom: '8px', left: '20%' }}>■</span>
        <span className="glyph-fragment" style={{ bottom: '8px', left: '12%' }}>·</span>

        {intro && (
          <p className="font-mono-crt text-[16px] text-white/70 italic leading-snug mb-2 relative z-10">
            {intro}
          </p>
        )}

        <p className="font-mono-crt text-[18px] text-white/90 leading-snug relative z-10">
          {short_answer}
        </p>

        {card_meaning && (Array.isArray(card_meaning) ? card_meaning.length > 0 : card_meaning) && (
          <div className="mt-2 space-y-1 relative z-10">
            {(Array.isArray(card_meaning) ? card_meaning : [card_meaning]).map((meaning, i) => (
              <p key={i} className="font-mono-crt text-[16px] text-white/80 leading-snug">
                {meaning}
              </p>
            ))}
          </div>
        )}

        {advice && (
          <div className="mt-3 pt-2 border-t border-white/20 relative z-10" style={{ borderColor: hexToRgba(guide.accent, 0.25) }}>
            <span className="font-pixel text-[11px]" style={{ color: adviceColor, textShadow: adviceGlow }}>&gt; </span>
            <span className="font-mono-crt text-[16px] leading-snug" style={{ color: adviceColor, textShadow: adviceGlow }}>
              {advice}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
