'use client';

interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[];
  advice: string;
}

interface ReadingResultProps {
  interpretation: Interpretation;
}

export default function ReadingResult({ interpretation }: ReadingResultProps) {
  const { intro, short_answer, card_meaning, advice } = interpretation;

  return (
    <div className="px-3 py-2">
      <div className="font-pixel text-[11px] text-white/60 tracking-wide mb-2">
        &gt;&gt; READOUT.LOG
      </div>

      <div className="relative scan-soft border-2 border-white p-3">
        {intro && (
          <p className="font-mono-crt text-[16px] text-white/70 italic leading-snug mb-2">
            {intro}
          </p>
        )}

        <p className="font-mono-crt text-[18px] text-white/90 leading-snug">
          {short_answer}
        </p>

        {card_meaning.length > 0 && (
          <div className="mt-2 space-y-1">
            {card_meaning.map((meaning, i) => (
              <p key={i} className="font-mono-crt text-[16px] text-white/80 leading-snug">
                {meaning}
              </p>
            ))}
          </div>
        )}

        {advice && (
          <div className="mt-3 pt-2 border-t border-white/20">
            <span className="font-pixel text-[11px] text-white/50">&gt; </span>
            <span className="font-mono-crt text-[16px] text-white/50 leading-snug">
              {advice}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
