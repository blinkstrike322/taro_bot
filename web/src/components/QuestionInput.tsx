'use client';

import { useState, useMemo } from 'react';
import Button from './Button';
import GuideSigil from './GuideSigil';
import GuideLoading from './GuideLoading';
import { getGuide } from '@/lib/guides';

interface QuestionInputProps {
  spreadType: 1 | 3;
  onSubmit: (question: string | null) => void;
  loading?: boolean;
  characterId?: string;
}

export default function QuestionInput({ spreadType, onSubmit, loading = false, characterId }: QuestionInputProps) {
  const [question, setQuestion] = useState('');
  const guide = useMemo(() => getGuide(characterId), [characterId]);

  const handleSubmit = () => {
    onSubmit(question.trim() || null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hint = spreadType === 1
    ? 'OДНА КАРТА — ПРЯМOЙ OТВЕТ'
    : 'ПРOШЛOЕ · НАСТOЯЩЕЕ · БУДУЩЕЕ';

  return (
    <div className="px-3 py-3 w-full h-full flex flex-col items-center">
      <div className="font-pixel text-[11px] text-white/60 mb-2 tracking-wide self-start w-full flex-shrink-0">
        &gt;&gt; ENTER_QUERY
      </div>

      <textarea
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Задай вопрос картам..."
        disabled={loading}
        rows={3}
        className="w-full border-2 border-white bg-black text-white font-mono-crt text-[18px] leading-snug p-2 resize-none placeholder:text-white/30 focus:outline-none focus:border-white disabled:opacity-50 flex-shrink-0"
      />

      <div className="font-pixel text-[11px] text-white/40 mt-1 tracking-wide text-center flex-shrink-0">
        {hint}
      </div>

      {loading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center w-full">
          <GuideLoading guide={guide} />
        </div>
      ) : (
        <>
          {/* ── per-guide pixel sigil — takes remaining space, shrinks to fit ── */}
          <div className="flex-1 min-h-0 flex items-center justify-center w-full">
            <GuideSigil guideId={characterId} />
          </div>

          <div className="flex justify-center flex-shrink-0">
            <Button onClick={handleSubmit} variant="primary">
              ПOЛУЧИТЬ OТВЕТ
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
