'use client';

import { ReactNode, useEffect } from 'react';
import CrtOverlay from './CrtOverlay';
import Toast from './Toast';
import PixelFlower from './PixelFlower';
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

// фрагмент дизера — крошечный растровый штрих у бренда
function DitherFragment({ color }: { color: string }) {
  const dots = [
    [0, 0], [2, 0], [5, 0], [0, 2], [3, 2], [6, 2], [1, 4], [4, 4], [7, 4], [2, 6], [5, 6],
  ];
  return (
    <svg viewBox="0 0 8 7" width={22} height={19} shapeRendering="crispEdges" aria-hidden="true">
      {dots.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={color} opacity={0.75} />
      ))}
    </svg>
  );
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
          style={{ top: '-16%', right: '-26%', width: '64vmin', height: '64vmin' }}
          aria-hidden="true"
        >
          <PixelFlower
            seed={21}
            size={720}
            color={guide.accent}
            accentColor="var(--accent-blue)"
            opacity={0.17}
            dense
          />
        </div>

        {/* ─── HEADER — кусок editorial poster ─── */}
        <header
          className="relative z-20 px-5 pt-4 select-none"
          style={{
            background: 'linear-gradient(180deg, rgba(242,240,244,0.94) 0%, rgba(242,240,244,0) 100%)',
          }}
        >
          <div className="flex items-baseline gap-3">
            {/* бренд + глубокая синяя точка — visual punctuation */}
            <button
              type="button"
              className="font-serif text-[26px] font-medium leading-none text-[color:var(--ink)] tracking-tight text-left flex items-baseline"
              onClick={onNewSpread}
              aria-label="arcanum.ocv — новый расклад"
            >
              arcanum<span style={{ color: guide.accentDeep }}>.ocv</span>
              <span
                className="inline-block ml-1.5"
                style={{ width: 4, height: 4, background: 'var(--accent-blue)', marginBottom: 2 }}
                aria-hidden="true"
              />
            </button>

            {/* тех-подпись типа расклада */}
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
          </div>

          {/* фрагмент дизера под брендом + faded line с разрывами */}
          <div className="flex items-center gap-3 mt-2.5">
            <DitherFragment color={guide.accent} />
            <span className="rule-pixel flex-1" aria-hidden="true" />
            <Glyph name="constellation" size={12} style={{ color: 'var(--ink-faint)' }} />
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative z-10">{children}</div>

        {/* ─── FOOTER — навигация + signature artwork ─── */}
        <footer
          className="relative z-20 flex flex-col items-center px-4 pt-2 pb-3"
          style={{
            background: 'linear-gradient(0deg, rgba(242,240,244,0.95) 0%, rgba(242,240,244,0.0) 100%)',
          }}
        >
          {/* маленькая композиция из глифов над навигацией — асимметрия */}
          <div className="flex items-end gap-4 mb-1.5 select-none" aria-hidden="true">
            <Glyph name="star4" size={8} style={{ color: 'var(--ink-faint)' }} />
            <Glyph name="crescent" size={11} style={{ color: guide.accent, opacity: 0.8 }} />
            <Glyph name="diamond" size={7} style={{ color: 'var(--accent-blue)', opacity: 0.85 }} />
          </div>

          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button type="button" className="nav-word" onClick={onNewSpread}>
              <Glyph name="sprig" size={11} />новый
            </button>
            <Glyph name="diamond" size={6} style={{ color: 'var(--ink-faint)', opacity: 0.7 }} />
            <button type="button" className="nav-word" onClick={onOpenCatalog}>
              <Glyph name="star4" size={11} />расклады
            </button>
            <Glyph name="constellation" size={11} style={{ color: 'var(--ink-faint)', opacity: 0.7 }} />
            <button type="button" className="nav-word" onClick={onOpenSettings}>
              <Glyph name="crescent" size={11} />проводница
            </button>
            <Glyph name="bud" size={9} style={{ color: 'var(--ink-faint)', opacity: 0.7 }} />
            <button type="button" className="nav-word" onClick={onOpenCalendar}>
              <Glyph name="cross" size={9} />история
            </button>
          </div>
        </footer>

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
