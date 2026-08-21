'use client';

import { useEffect, useCallback } from 'react';
import Button from './Button';
import { getGuide } from '@/lib/guides';

interface CatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: 'daily' | '1' | '3') => void;
  characterId?: string;
}

const SPREADS = [
  {
    type: 'daily' as const,
    glyph: '☀',
    title: 'Расклад дня',
    subtitle: '3 карты · каждый день новый',
    description: 'Энергия дня, его вызов и совет — утром узнай, как прожить день красиво.',
    hint: 'без вопроса',
    gradient: 'linear-gradient(135deg, #F8EEE0 0%, #FBE7ED 100%)',
    accent: '#B57E3E',
  },
  {
    type: '1' as const,
    glyph: '✦',
    title: 'Одна карта',
    subtitle: 'вопрос — и прямой ответ',
    description: 'Когда нужна конкретика. Задай вопрос — карта ответит по существу.',
    hint: 'с вопросом',
    gradient: 'linear-gradient(135deg, #F0EAFB 0%, #E3EDF9 100%)',
    accent: '#8E6CC8',
  },
  {
    type: '3' as const,
    glyph: '☾',
    title: 'Три карты',
    subtitle: 'прошлое · настоящее · будущее',
    description: 'Связная история твоей ситуации: как ты пришла сюда и куда держишь путь.',
    hint: 'с вопросом',
    gradient: 'linear-gradient(135deg, #FBE7ED 0%, #F0EAFB 100%)',
    accent: '#D14D76',
  },
];

export default function CatalogModal({ isOpen, onClose, onSelect, characterId }: CatalogModalProps) {
  const guide = getGuide(characterId);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay transition-opacity duration-200" onClick={onClose}>
      <div
        className="w-full max-w-[440px] m-3 relative modal-frame overflow-hidden"
        style={{
          background: 'var(--paper)',
          borderRadius: 26,
          border: '1.5px solid var(--line-strong)',
          maxHeight: '86dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* шапка */}
        <div className="sticky top-0 z-10 px-5 pt-4 pb-3" style={{ background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
          <div className="font-serif text-[26px] font-semibold text-[color:var(--ink)] leading-none">
            Расклады
          </div>
          <div className="font-serif italic text-[15px] mt-1.5" style={{ color: guide.accentDeep }}>
            каждый расклад — отдельный ритуал. выбери тот, что зовёт.
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          {SPREADS.map((spread) => (
            <button
              key={spread.type}
              type="button"
              className="btn flex flex-col items-start w-full text-left p-4 relative"
              style={{
                borderRadius: 20,
                border: '1.5px solid var(--line)',
                background: spread.gradient,
                transition: 'transform 0.15s ease, box-shadow 0.2s ease',
              }}
              onClick={() => {
                onSelect(spread.type);
                onClose();
              }}
            >
              {/* глиф + заголовок */}
              <span className="flex items-center gap-3 w-full">
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 font-serif text-[19px]"
                  style={{ background: 'rgba(255,253,249,0.9)', color: spread.accent, boxShadow: '0 3px 10px rgba(139,122,148,0.18)' }}
                >
                  {spread.glyph}
                </span>
                <span className="flex flex-col flex-1 min-w-0">
                  <span className="font-serif text-[20px] font-semibold text-[color:var(--ink)] leading-tight">
                    {spread.title}
                  </span>
                  <span className="font-pixel text-[9px] tracking-[0.12em] uppercase mt-0.5" style={{ color: spread.accent }}>
                    {spread.subtitle}
                  </span>
                </span>
                <span className="font-pixel text-[8px] text-[color:var(--ink-faint)] tracking-[0.14em] uppercase flex-shrink-0">
                  {spread.hint}
                </span>
              </span>

              {/* описание */}
              <span className="font-sans text-[13px] leading-relaxed text-[color:var(--ink)] opacity-80 mt-2.5">
                {spread.description}
              </span>
            </button>
          ))}
        </div>

        <div className="flex justify-center p-4 pt-0">
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
