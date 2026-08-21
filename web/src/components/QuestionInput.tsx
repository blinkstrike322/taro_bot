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

const EXAMPLE_QUESTIONS = [
  'Вернётся ли он ко мне?',
  'Менять ли работу?',
  'Что меня ждёт в этом месяце?',
  'Как вернуть силы?',
  'Стоит ли ему доверять?',
  'Где моя сила сейчас?',
];

export default function QuestionInput({ spreadType, onSubmit, loading = false, characterId }: QuestionInputProps) {
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const guide = useMemo(() => getGuide(characterId), [characterId]);

  const handleSubmit = () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setError('напиши вопрос');
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestion(e.target.value);
    if (error) setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hint = spreadType === 1
    ? 'одна карта · прямой ответ'
    : 'прошлое · настоящее · будущее';

  return (
    <div
      className="px-3 py-4 w-full min-h-full flex flex-col items-center"
      style={{
        '--guide-accent': guide.accent,
        '--guide-accent-deep': guide.accentDeep,
        '--guide-accent-dim': guide.accentDim,
      } as React.CSSProperties}
    >
      {/* заголовок */}
      <div className="w-full flex-shrink-0 mb-3">
        <div className="font-serif text-[24px] font-semibold leading-tight text-[color:var(--ink)]">
          Что хочешь узнать?
        </div>
        <div className="font-pixel text-[10px] tracking-[0.18em] uppercase mt-1" style={{ color: guide.accent }}>
          ✦ {hint}
        </div>
      </div>

      {/* поле вопроса */}
      <textarea
        value={question}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={`${guide.name} слушает — задай вопрос картам...`}
        disabled={loading}
        rows={3}
        maxLength={300}
        className="w-full soft-card text-[15px] leading-relaxed p-3.5 resize-none placeholder:text-[color:var(--ink-faint)] focus:outline-none disabled:opacity-50 flex-shrink-0 font-sans"
        style={{ borderRadius: 18 }}
      />

      {/* подсказки-вопросы */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mt-3 w-full flex-shrink-0">
          {EXAMPLE_QUESTIONS.slice(0, 4).map((q, i) => (
            <button
              key={i}
              type="button"
              className="chat-chip !text-[12px]"
              onClick={() => {
                setQuestion(q);
                setError('');
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="font-pixel text-[11px] mt-2 tracking-wide text-center flex-shrink-0 animate-pulse" style={{ color: guide.accentDeep }}>
          » {error} «
        </div>
      )}

      {/* ── сигил проводницы — дышит, пока пишешь вопрос ── */}
      <div className="flex-1 min-h-0 flex items-center justify-center w-full py-2">
        <GuideSigil guideId={characterId} />
      </div>

      {/* ── кнопка / загрузка ── */}
      <div className="flex justify-center flex-shrink-0 w-full">
        {loading ? (
          <GuideLoading guide={guide} />
        ) : (
          <Button onClick={handleSubmit} variant="primary" className="!px-8 !py-3 !text-[14px]">
            Получить ответ ✦
          </Button>
        )}
      </div>
    </div>
  );
}
