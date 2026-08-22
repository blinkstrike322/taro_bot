'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
import GuideAvatar from './GuideAvatar';
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
      try {
        (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
      } catch {}
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
    <div className="modal-overlay transition-opacity duration-200" onClick={onClose}>
      <div
        className="w-full max-w-[440px] m-3 relative modal-frame"
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
            <div className="display-xl !text-[30px]">проводницы</div>
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
            каждая читает карты по-своему. кто скажет тебе правду?
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
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

        <div className="flex justify-center p-4 pt-0">
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Карточка проводницы: портрет, голос, настроения ──
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
      className="btn flex w-full text-left relative overflow-hidden"
      style={{
        borderRadius: 3,
        border: `1px solid ${isActive ? guide.accent : 'var(--line)'}`,
        background: isActive
          ? `linear-gradient(135deg, ${guide.accentSoft} 0%, transparent 65%)`
          : 'transparent',
        padding: '14px',
        transition: 'border-color 0.2s ease, background 0.2s ease',
      }}
      onClick={() => onSelect(guide.id)}
    >
      {/* ── портрет ── */}
      <div className="flex-shrink-0 w-[72px] h-[72px] relative">
        <div
          className="w-full h-full guide-portrait-frame pixel-brackets overflow-hidden"
          style={{ border: `1px solid ${isActive ? guide.accent : 'var(--line-strong)'}` }}
        >
          <GuideAvatar guide={guide} className="w-full h-full" />
        </div>
        {isActive && (
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: guide.accent, color: 'var(--paper-bright)', borderRadius: 2 }}
            aria-hidden="true"
          >
            ✓
          </span>
        )}
      </div>

      {/* ── текст ── */}
      <div className="flex-1 min-w-0 pl-3.5 flex flex-col justify-center">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-[22px] font-semibold text-[color:var(--ink)] leading-none">
            {guide.name}
          </span>
          <span className="font-serif italic text-[13.5px]" style={{ color: guide.accentDeep }}>
            {guide.title}
          </span>
        </span>
        <span className="font-sans text-[12.5px] text-[color:var(--ink-soft)] mt-1.5 leading-snug">
          {guide.description}
        </span>
        <span className="font-serif italic text-[13.5px] mt-1.5 leading-snug" style={{ color: guide.accentDeep }}>
          «{guide.greeting}»
        </span>
        {/* настроения проводницы */}
        <span className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
          {guide.moodNames.map((m) => (
            <span key={m} className="tech-label" style={{ color: guide.accentDeep, opacity: 0.85 }}>
              · {m}
            </span>
          ))}
        </span>
      </div>
    </button>
  );
}
