'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from './Button';

interface Guide {
  id: string;
  name: string;
  description: string;
  greeting: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCharacter: string;
  onCharacterChange: (characterId: string) => void;
}

const GUIDES: Guide[] = [
  {
    id: 'shadow_walker',
    name: 'Странница Теней',
    description: 'Мистическая гадалка из темного леса. Говорит стихами и тенями.',
    greeting: 'Сядь у огня. Я вижу твой путь даже в темноте.',
  },
  {
    id: 'ruin_keeper',
    name: 'Хранитель Руин',
    description: 'Древний страж руин. Мудрый, спокойный, серьезный.',
    greeting: 'Ты пришел за ответами. Что ж, смотри.',
  },
  {
    id: 'spark_of_chaos',
    name: 'Искра Хаоса',
    description: 'Хаотичная искра, живая и дерзкая. Читает карты с юмором и проницательностью.',
    greeting: 'О, интересный расклад! Давай посмотрим, что судьба намешала.',
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  currentCharacter,
  onCharacterChange,
}: SettingsModalProps) {
  const [selected, setSelected] = useState(currentCharacter);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('taro_character');
      if (stored) setSelected(stored);
      else setSelected(currentCharacter);
    }
  }, [isOpen, currentCharacter]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelected(id);
      localStorage.setItem('taro_character', id);
      onCharacterChange(id);
    },
    [onCharacterChange],
  );

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
        <div className="flex justify-between bg-black text-white font-pixel text-[9px] leading-none px-2 py-2 border-b-2 border-white tracking-tight">
          <span>{'>> SETTINGS.LOG'}</span>
          <span className="blink">█</span>
        </div>

        <div className="dither-bar" />

        <div className="p-4">
          <div className="font-pixel text-[9px] text-white/55 tracking-wide mb-4">
            ПРОВОДНИК
          </div>

          <div className="flex flex-col gap-3">
            {GUIDES.map((guide) => {
              const isActive = selected === guide.id;
              return (
                <button
                  key={guide.id}
                  type="button"
                  className={`btn flex flex-col items-start border-[3px] px-4 py-3 w-full text-left transition-colors ${
                    isActive
                      ? 'border-white bg-white/10'
                      : 'border-white/30 bg-transparent hover:border-white/60 hover:bg-white/5'
                  }`}
                  onClick={() => handleSelect(guide.id)}
                >
                  <span className="font-pixel text-[9px] text-white tracking-wide">
                    {guide.name}
                  </span>
                  <span className="font-mono-crt text-sm text-white/55 mt-1">
                    {guide.description}
                  </span>
                  <span className="font-mono-crt text-sm text-white/40 italic mt-1">
                    «{guide.greeting}»
                  </span>
                </button>
              );
            })}
          </div>
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
