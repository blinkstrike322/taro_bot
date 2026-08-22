'use client';

import { ReactNode, useEffect } from 'react';
import CrtOverlay from './CrtOverlay';
import Toast from './Toast';
import PixelEdge from './PixelEdge';
import Glyph from './Glyph';
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
        {/* ─── HEADER — сигнатурная полоса с миллиметровкой ─── */}
        <header className="relative z-20 flex-shrink-0" style={{ background: guide.accent }}>
          <div className="relative band-grid overflow-hidden">
            <div className="relative flex items-center gap-3 px-5 pt-4 pb-3.5">
              {/* бренд — белый, с точкой-пикселем */}
              <button
                type="button"
                className="font-serif text-[29px] font-medium leading-none tracking-tight text-left flex items-center band-text"
                onClick={onNewSpread}
                aria-label="arcanum.ocv — новый расклад"
              >
                arcanum<span className="band-text-dim">.ocv</span>
                <span
                  className="inline-block ml-1.5"
                  style={{ width: 4, height: 4, background: '#F8F6F9', marginBottom: 2 }}
                  aria-hidden="true"
                />
              </button>

              <span
                className="tech-label hidden xs:inline band-text-dim"
                style={{ transform: 'translateY(-1px)' }}
              >
                / {formatSpreadType(spreadType)} · {arcanaCount ?? 1}
              </span>

              {/* проводница — имя крупно, без аватара */}
              <button
                type="button"
                className="ml-auto flex items-center"
                onClick={onOpenSettings}
                aria-label={`Проводница: ${guide.name}. Сменить`}
              >
                <span className="flex flex-col items-end leading-none">
                  <span className="font-serif italic text-[21px] font-semibold band-text">
                    {guide.name}
                  </span>
                  <span className="tech-label band-text-dim" style={{ fontSize: 10 }}>
                    {guide.tag}
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* пиксельное растворение полосы в светлый интерфейс */}
          <PixelEdge color={guide.accent} height={16} seed={4} />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative z-10">{children}</div>

        {/* ─── FOOTER — навигация на светлой квадратной сетке ─── */}
        <footer className="relative z-20 flex-shrink-0 px-4 pt-3 pb-4 grid-light">
          <span className="rule-pixel block mb-2" aria-hidden="true" />
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button type="button" className="nav-word" style={{ color: guide.accentDeep }} onClick={onNewSpread}>
              <Glyph name="sprig" size={11} />новый
            </button>
            <Glyph name="diamond" size={6} style={{ color: 'var(--ink-faint)', opacity: 0.7 }} />
            <button type="button" className="nav-word" style={{ color: guide.accentDeep }} onClick={onOpenCatalog}>
              <Glyph name="star4" size={11} />расклады
            </button>
            <Glyph name="constellation" size={11} style={{ color: 'var(--ink-faint)', opacity: 0.7 }} />
            <button type="button" className="nav-word" style={{ color: guide.accentDeep }} onClick={onOpenSettings}>
              <Glyph name="constellation" size={11} />проводница
            </button>
            <Glyph name="bud" size={9} style={{ color: 'var(--ink-faint)', opacity: 0.7 }} />
            <button type="button" className="nav-word" style={{ color: guide.accentDeep }} onClick={onOpenCalendar}>
              <Glyph name="cross" size={9} />история
            </button>
          </div>
        </footer>

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
