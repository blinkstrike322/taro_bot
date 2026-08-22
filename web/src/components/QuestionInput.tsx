'use client';

import { useState, useMemo } from 'react';
import Button from './Button';
import GuideLoading from './GuideLoading';
import PixelFlower from './PixelFlower';
import PixelEdge from './PixelEdge';
import Glyph from './Glyph';
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
      className="px-6 py-5 w-full min-h-full flex flex-col items-start"
      style={{
        '--guide-accent': guide.accent,
        '--guide-accent-deep': guide.accentDeep,
        '--guide-accent-dim': guide.accentDim,
      } as React.CSSProperties}
    >
      {/* editorial-заголовок */}
      <div className="w-full flex-shrink-0">
        <div className="tech-label" style={{ color: guide.accentDeep }}>
          ✦ {hint}
        </div>
        <h2 className="display-xl mt-1.5">что хочешь<br />узнать?</h2>
      </div>

      {/* поле вопроса — строка с пиксель-скобками */}
      <div className="w-full flex-shrink-0 mt-5 pixel-brackets" style={{ padding: 2 }}>
        <textarea
          value={question}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`${guide.name} слушает — задай вопрос картам...`}
          disabled={loading}
          rows={3}
          maxLength={300}
          className="w-full resize-none font-serif text-[19px] leading-relaxed p-3.5 placeholder:italic placeholder:text-[color:var(--ink-faint)] focus:outline-none disabled:opacity-50"
          style={{ background: 'rgba(248,246,249,0.85)', border: '1px solid var(--line)' }}
        />
      </div>

      {/* подсказки — курсивные фразы с пунктиром */}
      {!loading && (
        <div className="flex flex-wrap gap-x-5 gap-y-0 mt-3 w-full flex-shrink-0">
          {EXAMPLE_QUESTIONS.slice(0, 4).map((q, i) => (
            <button
              key={i}
              type="button"
              className="chat-chip"
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
        <div className="tech-label mt-3 animate-pulse" style={{ color: guide.accentDeep }}>
          » {error} «
        </div>
      )}

      {/* ── ирис-схема на сигнатурной плашке — эмоциональный центр сцены ──
          белый цветок на цветной миллиметровке, край растворяется в пиксели */}
      <div className="relative flex-1 min-h-0 flex items-end justify-center w-full">
        <div
          className="relative band-grid"
          style={{
            background: guide.accent,
            width: 'min(66vw, 280px)',
            transform: 'rotate(-1.2deg)',
            marginTop: 12,
          }}
          aria-hidden="true"
        >
          <div className="flex justify-center pt-4 px-4" style={{ paddingBottom: 10 }}>
            <PixelFlower
              seed={31}
              size={210}
              variant="iris"
              color="#F8F6F9"
              bgColor={guide.accent}
              opacity={1}
            />
          </div>
          {/* подпись-схема внутри плашки */}
          <div className="flex items-center gap-2.5 px-4 pb-2 select-none">
            <Glyph name="star4" size={8} style={{ color: 'rgba(248,246,249,0.6)' }} />
            <span className="tech-label band-text-dim">iris · chart · {guide.subtitle}</span>
            <Glyph name="crescent" size={9} style={{ color: 'rgba(248,246,249,0.5)' }} />
          </div>
          <PixelEdge color={guide.accent} height={14} seed={8} />
        </div>
      </div>

      {/* ── кнопка / загрузка ── */}
      <div className="flex justify-center flex-shrink-0 w-full pb-2">
        {loading ? (
          <GuideLoading guide={guide} />
        ) : (
          <Button onClick={handleSubmit} variant="primary" className="!px-9 !py-3">
            получить ответ
          </Button>
        )}
      </div>
    </div>
  );
}
