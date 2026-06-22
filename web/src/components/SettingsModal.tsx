'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from './Button';
import { getGuide, GUIDE_IDS, GuideMeta } from '@/lib/guides';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCharacter: string;
  onCharacterChange: (characterId: string) => void;
}

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
        className="w-full max-w-[440px] m-2 border-4 border-white bg-black relative modal-frame"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header bar */}
        <div className="relative flex items-center justify-between bg-black text-white font-pixel text-[11px] leading-none px-3 py-2 border-b-2 border-white tracking-tight">
          <span className="flex items-center gap-2">
            <span className="text-white/50" aria-hidden="true">{'>'}</span>
            <span>{'GUIDE.SELECT'}</span>
          </span>
          <span className="blink text-white/60">█</span>
        </div>

        <div className="dither-bar" />

        {/* intro caption */}
        <div className="px-4 pt-3 pb-2">
          <div className="font-pixel text-[10px] text-white/45 tracking-[0.18em] uppercase">
            выбери проводника
          </div>
          <div className="font-mono-crt text-[14px] text-white/55 italic leading-snug mt-1">
            каждый по-своему читает карты. кто скажет тебе правду?
          </div>
        </div>

        <div className="flex flex-col gap-3 px-3 pb-2">
          {GUIDE_IDS.map((id) => {
            const guide = getGuide(id);
            const isActive = selected === guide.id;
            return (
              <GuideCard
                key={guide.id}
                guide={guide}
                isActive={isActive}
                onSelect={handleSelect}
              />
            );
          })}
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

// ── Sub-component: one guide card with portrait + meta ──
function GuideCard({
  guide,
  isActive,
  onSelect,
}: {
  guide: GuideMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="btn flex w-full text-left transition-colors relative overflow-hidden"
      style={{
        border: `2px solid ${isActive ? '#fff' : 'rgba(255,255,255,0.3)'}`,
        background: isActive
          ? `linear-gradient(135deg, ${guide.accentDim} 0%, transparent 60%)`
          : 'transparent',
        boxShadow: isActive ? `0 0 0 1px ${guide.accentDim}` : 'none',
      }}
      onClick={() => onSelect(guide.id)}
    >
      {/* ── portrait (large, with CRT scan overlay) ── */}
      <div className="flex-shrink-0 w-16 h-16 m-2 relative">
        <div className="w-full h-full border border-white/60 relative overflow-hidden guide-portrait-frame">
          <img
            src={guide.portrait}
            alt={guide.name}
            className="w-full h-full object-cover guide-portrait-scan"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        {/* accent corner dot */}
        <span
          className="absolute -top-1 -right-1 w-2 h-2"
          style={{ backgroundColor: guide.accent }}
          aria-hidden="true"
        />
        {/* active checkmark */}
        {isActive && (
          <span
            className="absolute -bottom-1 -left-1 w-3 h-3 border border-white"
            style={{ backgroundColor: guide.accent }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* ── text content ── */}
      <div className="flex-1 min-w-0 py-2 pr-3 flex flex-col justify-center">
        <span className="flex items-center gap-2">
          <span className="font-pixel text-[12px] text-white tracking-wide truncate">
            {guide.name}
          </span>
          <span
            className="font-pixel text-[7px] tracking-[0.18em] uppercase"
            style={{ color: guide.accent }}
          >
            {guide.tag}
          </span>
        </span>
        <span className="font-mono-crt text-[13px] text-white/55 mt-1 leading-snug">
          {guide.description}
        </span>
        <span className="font-mono-crt text-[13px] text-white/45 italic mt-1 leading-snug">
          «{guide.greeting}»
        </span>
      </div>
    </button>
  );
}
