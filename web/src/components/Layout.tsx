'use client';

import { ReactNode, useEffect } from 'react';
import CrtOverlay from './CrtOverlay';
import Toast from './Toast';
import PixelFlower from './PixelFlower';
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
    case 'daily': return 'расклад дня';
    case '1':     return 'одна карта';
    case '3':     return 'три карты';
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
        className="w-full max-w-screen overflow-x-hidden relative flex flex-col"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
          height: 'var(--app-height, 100dvh)',
          boxSizing: 'border-box',
        } as React.CSSProperties}
      >
        {/* ── большой пиксель-цветок, прорастающий из-за края экрана ── */}
        <div
          className="absolute pointer-events-none z-0"
          style={{ top: '-18%', right: '-24%', width: '68vmin', height: '68vmin' }}
          aria-hidden="true"
        >
          <PixelFlower seed={21} size={720} color={guide.accent} opacity={0.16} dense />
        </div>

        {/* ─── HEADER — editorial: бренд слева, проводница строкой ─── */}
        <header
          className="relative z-20 flex items-baseline gap-3 px-5 pt-4 pb-3 select-none"
          style={{
            background: 'linear-gradient(180deg, rgba(242,240,244,0.92) 0%, rgba(242,240,244,0.0) 100%)',
          }}
        >
          {/* бренд — строчный, как подпись объекта */}
          <button
            type="button"
            className="font-serif text-[26px] font-medium leading-none text-[color:var(--ink)] tracking-tight text-left"
            style={{ fontFeatureSettings: '"smcp" off' }}
            onClick={onNewSpread}
            aria-label="arcanum.ocv — новый расклад"
          >
            arcanum<span style={{ color: guide.accentDeep }}>.ocv</span>
          </button>

          {/* тип расклада — техническая подпись */}
          <span className="tech-label hidden xs:inline" style={{ transform: 'translateY(-1px)' }}>
            / {formatSpreadType(spreadType)} · {arcanaCount ?? 1}
          </span>

          {/* проводница — имя-строка + мини-портрет */}
          <button
            type="button"
            className="ml-auto flex items-center gap-2"
            onClick={onOpenSettings}
            aria-label={`Проводница: ${guide.name}. Сменить`}
          >
            <span className="flex flex-col items-end leading-none">
              <span className="font-serif italic text-[15px] text-[color:var(--ink)]">
                {guide.name}
              </span>
              <span className="tech-label" style={{ color: guide.accentDeep }}>
                {guide.tag}
              </span>
            </span>
            <span className="w-8 h-8 guide-portrait-frame flex-shrink-0" style={{ border: `1px solid ${guide.accentDim}` }}>
              <img
                src={guide.portrait}
                alt={guide.name}
                className="w-full h-full object-cover guide-portrait-scan"
                style={{ imageRendering: 'pixelated' }}
              />
            </span>
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative z-10">{children}</div>

        {/* ─── FOOTER — слова-ссылки, типографская навигация ─── */}
        <footer
          className="relative z-20 flex items-center justify-center gap-1 flex-wrap px-4 py-3"
          style={{
            background: 'linear-gradient(0deg, rgba(242,240,244,0.95) 0%, rgba(242,240,244,0.0) 100%)',
          }}
        >
          <span aria-hidden="true" className="tech-label select-none" style={{ opacity: 0.6 }}>✦</span>
          <button type="button" className="nav-word" onClick={onNewSpread}>новый</button>
          <span className="tech-label select-none" style={{ opacity: 0.45 }}>·</span>
          <button type="button" className="nav-word" onClick={onOpenCatalog}>расклады</button>
          <span className="tech-label select-none" style={{ opacity: 0.45 }}>·</span>
          <button type="button" className="nav-word" onClick={onOpenSettings}>проводница</button>
          <span className="tech-label select-none" style={{ opacity: 0.45 }}>·</span>
          <button type="button" className="nav-word" onClick={onOpenCalendar}>история</button>
          <span aria-hidden="true" className="tech-label select-none" style={{ opacity: 0.6 }}>✦</span>
        </footer>

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
