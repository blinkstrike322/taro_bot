'use client';

import { useEffect, useCallback } from 'react';
import Button from './Button';

interface CatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: 'daily' | '1' | '3') => void;
}

const SPREADS = [
  {
    type: 'daily' as const,
    glyph: '◈',
    title: 'КАРТА ДНЯ',
    subtitle: 'Одна карта на весь день',
    description: 'Что принесёт сегодняшний рассвет. Без вопроса — просто послание.',
    hint: '· 1 КАРТА · БЕЗ ВОПРОСА',
  },
  {
    type: '1' as const,
    glyph: '◊',
    title: 'ОДНА КАРТА',
    subtitle: 'Прямой ответ на прямой вопрос',
    description: 'Когда нужна конкретика. Один символ — одно послание судьбы.',
    hint: '· 1 КАРТА · С ВОПРОСОМ',
  },
  {
    type: '3' as const,
    glyph: '✦',
    title: 'ТРИ КАРТЫ',
    subtitle: 'Прошлое · Настоящее · Будущее',
    description: 'Связный рассказ о том, как ты пришёл сюда и куда держишь путь.',
    hint: '· 3 КАРТЫ · С ВОПРОСОМ',
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] m-2 border-4 border-white bg-black relative modal-frame"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header bar */}
        <div className="relative flex items-center justify-between bg-black text-white font-pixel text-[11px] leading-none px-3 py-2 border-b-2 border-white tracking-tight">
          <span className="flex items-center gap-2">
            <span className="text-white/50" aria-hidden="true">{'>'}</span>
            <span>{'CATALOGUE.LOG'}</span>
          </span>
          <span className="blink text-white/60">█</span>
        </div>

        <div className="dither-bar" />

        {/* intro caption */}
        <div className="px-4 pt-3 pb-2">
          <div className="font-pixel text-[10px] text-white/45 tracking-[0.18em] uppercase">
            выбери расклад
          </div>
          <div className="font-mono-crt text-[14px] text-white/55 italic leading-snug mt-1">
            каждый расклад — отдельный ритуал. выбери тот, что зовёт.
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 pb-2">
          {SPREADS.map((spread) => (
            <button
              key={spread.type}
              type="button"
              className="btn-vibe-catalog btn flex flex-col items-start text-white px-4 py-3 w-full text-left transition-colors relative"
              style={{
                border: '2px solid rgba(255,255,255,0.3)',
                background: 'transparent',
              }}
              onClick={() => {
                onSelect(spread.type);
                onClose();
              }}
            >
              {/* glyph + title row */}
              <span className="flex items-center gap-2 w-full">
                <span className="font-pixel text-[14px] text-white/80 w-5 text-center">
                  {spread.glyph}
                </span>
                <span className="font-pixel text-[12px] tracking-wide flex-1">
                  {spread.title}
                </span>
                <span className="font-pixel text-[9px] text-white/30 tracking-[0.15em] uppercase">
                  {spread.hint}
                </span>
              </span>

              {/* description */}
              <span className="font-mono-crt text-[14px] text-white/65 mt-2 leading-snug pl-7">
                {spread.description}
              </span>

              {/* hover/active accent — bottom hairline */}
              <span
                className="absolute left-3 right-3 bottom-1 h-px bg-white/15"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        <div className="dither-bar" />

        <div className="flex justify-center p-3">
          <Button variant="secondary" onClick={onClose}>
            ЗАКРЫТЬ
          </Button>
        </div>
      </div>
    </div>
  );
}
