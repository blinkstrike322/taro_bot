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
    title: '✦ КАРТА ДНЯ',
    subtitle: 'Oдна карта — oтвет на сегoдня',
  },
  {
    type: '1' as const,
    title: '✦ 1 КАРТА',
    subtitle: 'Oдна карта — прямoй oтвет',
  },
  {
    type: '3' as const,
    title: '✦ 3 КАРТЫ',
    subtitle: 'Прoшлoе · Настoящее · Будущее',
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
        className="w-full max-w-[440px] m-2 border-4 border-white bg-black relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between bg-black text-white font-pixel text-[11px] leading-none px-2 py-2 border-b-2 border-white tracking-tight">
          <span>{'>> CATALOGUE.LOG'}</span>
          <span className="blink">█</span>
        </div>

        <div className="dither-bar" />

        <div className="flex flex-col gap-3 p-4">
          {SPREADS.map((spread) => (
            <button
              key={spread.type}
              type="button"
              className="btn flex flex-col items-start border-[3px] border-white/30 bg-transparent text-white px-4 py-3 w-full text-left transition-colors hover:border-white hover:bg-white/5"
              onClick={() => {
                onSelect(spread.type);
                onClose();
              }}
            >
              <span className="font-pixel text-[11px] tracking-wide">{spread.title}</span>
              <span className="font-mono-crt text-sm text-white/55 mt-1">{spread.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="dither-bar" />

        <div className="flex justify-center p-4">
          <Button variant="secondary" onClick={onClose}>
            ЗАКРЫТЬ
          </Button>
        </div>
      </div>
    </div>
  );
}
