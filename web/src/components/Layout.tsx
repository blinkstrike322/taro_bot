'use client';

import { ReactNode, useEffect } from 'react';
import CrtOverlay from './CrtOverlay';
import Button from './Button';
import Toast from './Toast';
import { getGuide } from '@/lib/guides';

interface LayoutProps {
  children: ReactNode;
  onOpenCatalog?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendar?: () => void;
  onNewSpread?: () => void;
  toastMessage?: string;
  toastVisible?: boolean;
  onToastHide?: () => void;
  spreadType?: string;
  arcanaCount?: number;
  characterId?: string;
}

function formatSpreadType(spreadType?: string): string {
  switch (spreadType) {
    case 'daily': return 'Расклад дня';
    case '1':     return 'Одна карта';
    case '3':     return 'Три карты';
    default:      return '—';
  }
}

export default function Layout({
  children,
  onOpenCatalog,
  onOpenSettings,
  onOpenCalendar,
  onNewSpread,
  toastMessage,
  toastVisible = false,
  onToastHide,
  spreadType,
  arcanaCount,
  characterId,
}: LayoutProps) {
  const guide = getGuide(characterId);

  // Lock viewport height on mount to prevent keyboard from pushing content
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.expand();
      const h = tg.viewportStableHeight || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    }
    const lock = () => {
      if (!tg) {
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      }
    };
    lock();
    window.addEventListener('resize', lock);
    return () => window.removeEventListener('resize', lock);
  }, []);

  return (
    <CrtOverlay>
      <div
        className="w-full max-w-screen overflow-x-hidden bg-transparent relative flex flex-col"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
          height: 'var(--app-height, 100dvh)',
          boxSizing: 'border-box',
        } as React.CSSProperties}
      >
        {/* ─── HEADER — бренд + проводница + тип расклада ─── */}
        <header
          className="relative flex items-center gap-3 px-4 py-3 select-none"
          style={{
            background: 'rgba(255, 253, 249, 0.75)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {/* бренд */}
          <div className="flex flex-col flex-shrink-0 leading-none">
            <span className="font-serif text-[19px] font-semibold tracking-wide text-[color:var(--ink)]">
              Amo Tarot
            </span>
            <span className="font-pixel text-[8px] tracking-[0.22em] uppercase mt-0.5" style={{ color: guide.accent }}>
              ✦ {guide.subtitle}
            </span>
          </div>

          {/* проводница — компактный чип */}
          <button
            type="button"
            className="ml-auto flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full transition-colors"
            style={{
              background: guide.accentSoft,
              border: `1.5px solid ${guide.accentDim}`,
            }}
            onClick={onOpenSettings}
            aria-label={`Проводница: ${guide.name}. Сменить`}
          >
            <span className="relative flex-shrink-0">
              <span className="block w-7 h-7 guide-portrait-frame" style={{ borderRadius: 999, border: `1.5px solid ${guide.accent}` }}>
                <img
                  src={guide.portrait}
                  alt={guide.name}
                  className="w-full h-full object-cover guide-portrait-scan"
                  style={{ imageRendering: 'pixelated' }}
                />
              </span>
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: guide.accent, boxShadow: `0 0 0 2px #FFFDF9, 0 0 6px ${guide.accent}` }}
                aria-hidden="true"
              />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="font-sans text-[12px] font-bold text-[color:var(--ink)]">
                {guide.name}
              </span>
              <span className="font-pixel text-[7px] tracking-[0.18em] uppercase mt-0.5" style={{ color: guide.accentDeep }}>
                {guide.tag}
              </span>
            </span>
          </button>

          {/* тип расклада */}
          <div
            className="flex-shrink-0 flex flex-col items-end leading-none px-3 py-1.5 rounded-full"
            style={{ background: 'var(--paper)', border: '1.5px solid var(--line-strong)' }}
          >
            <span className="font-pixel text-[9px] tracking-[0.14em] uppercase text-[color:var(--ink-soft)]">
              {formatSpreadType(spreadType)}
            </span>
            <span className="font-serif italic text-[13px] leading-none mt-0.5" style={{ color: guide.accent }}>
              {(arcanaCount ?? 1) > 1 ? `${arcanaCount} карты` : '1 карта'}
            </span>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</div>

        {/* ─── FOOTER NAV — пилюли ─── */}
        <footer
          className="flex flex-col gap-2 px-3 py-3"
          style={{
            background: 'rgba(255, 253, 249, 0.8)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderTop: '1px solid var(--line)',
          }}
        >
          <div className="flex flex-nowrap justify-center gap-2">
            <Button onClick={onNewSpread} className="!px-3 !text-[12px]">
              ✦ Новый
            </Button>
            <Button onClick={onOpenCatalog} className="!px-3 !text-[12px]">
              ☰ Расклады
            </Button>
            <Button onClick={onOpenSettings} className="!px-3 !text-[12px]">
              ☾ Проводница
            </Button>
            <Button onClick={onOpenCalendar} className="!px-3 !text-[12px]">
              ◈ История
            </Button>
          </div>
        </footer>

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
