'use client';

import { ReactNode, useEffect } from 'react';
import CrtOverlay from './CrtOverlay';
import Toast from './Toast';
import PixelFlower from './PixelFlower';
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
        {/* ─── HEADER — сигнатурная полоса: белый ирис на цветной миллиметровке ─── */}
        <header className="relative z-20 flex-shrink-0" style={{ background: guide.accent }}>
          <div className="relative band-grid overflow-hidden">
            {/* ирис-фрагмент, обрезанный правым краем полосы — как на схеме */}
            <div
              className="absolute pointer-events-none select-none"
              style={{ top: '-26%', right: '-7%', opacity: 0.95 }}
              aria-hidden="true"
            >
              <PixelFlower seed={9} size={150} variant="iris" color="#F8F6F9" bgColor={guide.accent} opacity={1} />
            </div>

            <div className="relative flex items-baseline gap-3 px-5 pt-4 pb-2.5">
              {/* бренд — белый, с точкой-пикселем */}
              <button
                type="button"
                className="font-serif text-[26px] font-medium leading-none tracking-tight text-left flex items-baseline band-text"
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

              <span className="tech-label hidden xs:inline band-text-dim" style={{ transform: 'translateY(-1px)' }}>
                / {formatSpreadType(spreadType)} · {arcanaCount ?? 1}
              </span>

              {/* проводница */}
              <button
                type="button"
                className="ml-auto flex items-center gap-2"
                onClick={onOpenSettings}
                aria-label={`Проводница: ${guide.name}. Сменить`}
              >
                <span className="flex flex-col items-end leading-none">
                  <span className="font-serif italic text-[15px] band-text">
                    {guide.name}
                  </span>
                  <span className="tech-label band-text-dim">
                    {guide.tag}
                  </span>
                </span>
                <span
                  className="w-8 h-8 guide-portrait-frame flex-shrink-0"
                  style={{ border: '1.5px solid rgba(248,246,249,0.55)' }}
                >
                  <img
                    src={guide.portrait}
                    alt={guide.name}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: 'pixelated', filter: 'grayscale(0.15) contrast(1.1)' }}
                  />
                </span>
              </button>
            </div>

            {/* строка глифов — белые символы схемы */}
            <div className="relative flex items-center gap-3 px-5 pb-2 select-none" aria-hidden="true">
              <Glyph name="constellation" size={11} style={{ color: 'rgba(248,246,249,0.6)' }} />
              <Glyph name="star4" size={8} style={{ color: 'rgba(248,246,249,0.5)' }} />
              <span style={{ flex: 1 }} />
              <Glyph name="diamond" size={7} style={{ color: 'rgba(248,246,249,0.55)' }} />
              <Glyph name="crescent" size={10} style={{ color: 'rgba(248,246,249,0.65)' }} />
            </div>
          </div>

          {/* пиксельное растворение полосы в светлый интерфейс */}
          <PixelEdge color={guide.accent} height={16} seed={4} />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative z-10">{children}</div>

        {/* ─── FOOTER — навигация на сигнатурной полосе ─── */}
        <footer className="relative z-20 flex-shrink-0">
          {/* пиксельное растворение снизу вверх */}
          <PixelEdge color={guide.accent} height={14} seed={6} flip />

          <div className="band-grid relative" style={{ background: guide.accent }}>
            {/* маленькая глифовая композиция — асимметрия */}
            <div className="flex items-end gap-4 px-5 pt-2 select-none" aria-hidden="true">
              <Glyph name="star4" size={8} style={{ color: 'rgba(248,246,249,0.5)' }} />
              <Glyph name="crescent" size={11} style={{ color: 'rgba(248,246,249,0.75)' }} />
              <span style={{ flex: 1 }} />
              <Glyph name="diamond" size={7} style={{ color: 'rgba(248,246,249,0.65)' }} />
            </div>

            <div className="flex items-center justify-center gap-2.5 flex-wrap px-4 py-2.5">
              <button type="button" className="nav-word nav-word--band" onClick={onNewSpread}>
                <Glyph name="sprig" size={11} />новый
              </button>
              <Glyph name="diamond" size={6} style={{ color: 'rgba(248,246,249,0.45)' }} />
              <button type="button" className="nav-word nav-word--band" onClick={onOpenCatalog}>
                <Glyph name="star4" size={11} />расклады
              </button>
              <Glyph name="constellation" size={11} style={{ color: 'rgba(248,246,249,0.45)' }} />
              <button type="button" className="nav-word nav-word--band" onClick={onOpenSettings}>
                <Glyph name="crescent" size={11} />проводница
              </button>
              <Glyph name="bud" size={9} style={{ color: 'rgba(248,246,249,0.45)' }} />
              <button type="button" className="nav-word nav-word--band" onClick={onOpenCalendar}>
                <Glyph name="cross" size={9} />история
              </button>
            </div>
          </div>
        </footer>

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
