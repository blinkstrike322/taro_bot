'use client';

import { useState } from 'react';
import Button from './Button';
import GuideSigil from './GuideSigil';

interface QuestionInputProps {
  spreadType: 1 | 3;
  onSubmit: (question: string | null) => void;
  loading?: boolean;
  characterId?: string;
}

export default function QuestionInput({ spreadType, onSubmit, loading = false, characterId }: QuestionInputProps) {
  const [question, setQuestion] = useState('');

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
    <div className="px-3 py-3 w-full flex flex-col items-center min-h-full justify-center">
      <div className="font-pixel text-[11px] text-white/60 mb-2 tracking-wide self-start w-full">
        &gt;&gt; ENTER_QUERY
      </div>

      <textarea
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Задай вопрос картам..."
        disabled={loading}
        rows={3}
        className="w-full border-2 border-white bg-black text-white font-mono-crt text-[18px] leading-snug p-2 resize-none placeholder:text-white/30 focus:outline-none focus:border-white disabled:opacity-50"
      />

      <div className="font-pixel text-[11px] text-white/40 mt-1 mb-1 tracking-wide text-center">
        {hint}
      </div>

      {/* ── per-guide pixel sigil ── */}
      <GuideSigil guideId={characterId} />

      <div className="flex justify-center mt-2">
        <Button onClick={handleSubmit} variant="primary">
          {loading ? 'ГАДАНИЕ...' : 'ПOЛУЧИТЬ OТВЕТ'}
        </Button>
      </div>
    </div>
  );
}
