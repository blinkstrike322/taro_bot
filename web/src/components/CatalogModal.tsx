'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import Button from './Button';

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
    accent: '#83705C',
  },
  {
    type: '1' as const,
    glyph: '✦',
    title: 'Одна карта',
    subtitle: 'вопрос — и прямой ответ',
    description: 'Когда нужна конкретика. Задай вопрос — карта ответит по существу.',
    hint: 'с вопросом',
    accent: '#66629B',
  },
  {
    type: '3' as const,
    glyph: '☾',
    title: 'Три карты',
    subtitle: 'прошлое · настоящее · будущее',
    description: 'Связная история твоей ситуации: как ты пришла сюда и куда держишь путь.',
    hint: 'с вопросом',
    accent: '#97657A',
  },
];

export default function CatalogModal({ isOpen, onClose, onSelect }: CatalogModalProps) {
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
          background: 'var(--paper-bright)',
          borderRadius: 5,
          border: '1px solid var(--line-strong)',
          maxHeight: '86dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* шапка */}
        <div className="sticky top-0 z-10 px-5 pt-4 pb-3" style={{ background: 'var(--paper-bright)', borderBottom: '1px solid var(--line-strong)' }}>
          <div className="flex items-start justify-between">
            <div className="display-xl !text-[30px]">расклады</div>
            <button
              type="button"
              className="btn p-1.5 mt-1"
              onClick={onClose}
              aria-label="Закрыть"
              style={{ color: 'var(--ink-soft)' }}
            >
              <X size={17} strokeWidth={1.75} />
            </button>
          </div>
          <div className="font-serif italic text-[15px] mt-1 text-[color:var(--ink-soft)]">
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
                borderRadius: 3,
                border: '1px solid var(--line)',
                background: 'transparent',
                transition: 'background 0.2s ease, border-color 0.2s ease',
              }}
              onClick={() => {
                onSelect(spread.type);
                onClose();
              }}
            >
              {/* глиф + заголовок */}
              <span className="flex items-center gap-3 w-full">
                <span
                  className="flex items-center justify-center w-9 h-9 flex-shrink-0 font-serif text-[18px]"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${spread.accent}`,
                    color: spread.accent,
                    borderRadius: 2,
                  }}
                >
                  {spread.glyph}
                </span>
                <span className="flex flex-col flex-1 min-w-0">
                  <span className="font-serif text-[21px] font-semibold text-[color:var(--ink)] leading-tight">
                    {spread.title}
                  </span>
                  <span className="tech-label mt-0.5" style={{ color: spread.accent }}>
                    {spread.subtitle}
                  </span>
                </span>
                <span className="tech-label flex-shrink-0" style={{ opacity: 0.7 }}>
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
