'use client';

import { ReactNode } from 'react';
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

  return (
    <CrtOverlay>
      <div
        className="w-full max-w-screen overflow-x-hidden bg-black relative flex flex-col min-h-dvh"
        style={{ '--guide-accent': guide.accent } as React.CSSProperties}
      >
        {/* ─── HEADER — minimal, monochrome ─── */}
        <div className="arcanum-header">
          {/* per-guide corner symbols — subtle, dim white */}
          <div className="corner-decor top-left" aria-hidden="true">
            {guide.cornerSymbols.tl}
          </div>
          <div className="corner-decor top-right" aria-hidden="true">
            {guide.cornerSymbols.tr}
          </div>
          <div className="corner-decor bottom-left" aria-hidden="true">
            {guide.cornerSymbols.bl}
          </div>
          <div className="corner-decor bottom-right" aria-hidden="true">
            {guide.cornerSymbols.br}
          </div>
          <div className="header-artifacts" aria-hidden="true" />

          <div className="header-content">
            <span className="sparkle" aria-hidden="true">✦</span>
            <h1 className="brand-title">ARCANUM.ocv</h1>
            <span className="sparkle" aria-hidden="true">✦</span>
          </div>
        </div>

        {/* ─── GUIDE BAR — minimal, black background, single accent dot ─── */}
        <div className="relative flex items-center gap-2 px-3 py-2 border-b border-white/40 select-none overflow-hidden bg-black">
          {/* guide portrait pixel-art sprite — small, monochrome */}
          <div className="relative flex-shrink-0">
            <div
              className="w-8 h-8 border border-white/60 relative overflow-hidden guide-portrait-frame"
            >
              <img
                src={guide.portrait}
                alt={guide.name}
                className="w-full h-full object-cover guide-portrait-scan"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            {/* tiny accent dot — only splash of color in the bar */}
            <span
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5"
              style={{ backgroundColor: guide.accent }}
              aria-hidden="true"
            />
          </div>

          {/* guide name + tag — white, monochrome */}
          <div className="flex flex-col flex-1 min-w-0 leading-none">
            <span className="font-pixel text-[11px] text-white tracking-wide truncate">
              {guide.name}
            </span>
            <span className="font-pixel text-[7px] tracking-[0.18em] uppercase mt-1 text-white/40">
              {guide.tag}
            </span>
          </div>

          {/* spread type indicator (right side) — minimal */}
          <div className="flex flex-col items-end leading-none">
            <span className="font-pixel text-[9px] text-white/80 tracking-wide">
              <span className="blink">■</span> {spreadType ?? '—'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>

        {/* ─── FOOTER NAV — vibe buttons ─── */}
        <div className="flex flex-col gap-2 px-3 py-2 border-t border-white/40 bg-black">
          <div className="flex flex-nowrap justify-center gap-1.5">
            <Button onClick={onNewSpread} className="!px-2 !text-[11px]">
              <span className="text-[10px]">✦</span> НOВЫЙ
            </Button>
            <Button onClick={onOpenCatalog} className="!px-2 !text-[11px]">
              <span className="text-[10px]">☰</span> КАТАЛOГ
            </Button>
            <Button onClick={onOpenSettings} className="!px-2 !text-[11px]">
              <span className="text-[10px]">⚙</span> ПРOВOДНИК
            </Button>
          </div>
          <Button onClick={onOpenCalendar} className="w-full" variant="secondary">
            <span className="text-[12px]">◈</span> ИСТOРИЯ РАСКЛАДOВ
          </Button>
        </div>

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
