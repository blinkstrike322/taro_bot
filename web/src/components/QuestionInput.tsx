'use client';

import { useState } from 'react';
import Button from './Button';

interface QuestionInputProps {
  spreadType: 1 | 3;
  onSubmit: (question: string | null) => void;
  loading?: boolean;
}

export default function QuestionInput({ spreadType, onSubmit, loading = false }: QuestionInputProps) {
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
    ? 'ОДНА КАРТА — ПРЯМОЙ ОТВЕТ'
    : 'ПРОШЛОЕ · НАСТОЯЩЕЕ · БУДУЩЕЕ';

  return (
    <div className="px-3 py-3 w-full">
      <div className="font-pixel text-[11px] text-white/60 mb-2 tracking-wide">
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

      <div className="font-pixel text-[11px] text-white/40 mt-1 tracking-wide text-center">
        {hint}
      </div>

      <div className="mt-3 flex justify-center">
        <Button onClick={handleSubmit} variant="primary">
          {loading ? 'ГАДАНИЕ...' : 'ПОЛУЧИТЬ ОТВЕТ'}
        </Button>
      </div>
    </div>
  );
}
