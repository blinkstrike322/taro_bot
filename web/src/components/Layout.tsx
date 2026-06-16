'use client';

import { ReactNode } from 'react';
import CrtOverlay from './CrtOverlay';
import Button from './Button';
// import CursedFooter from './CursedFooter';
import Toast from './Toast';

const CHARACTER_INFO: Record<string, { name: string; color: string }> = {
  shadow_walker: { name: 'Странница Теней', color: '#7B2D8E' },
  ruin_keeper: { name: 'Хранитель Руин', color: '#B8860B' },
  spark_of_chaos: { name: 'Искра Хаoса', color: '#E63946' },
};

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
  return (
    <CrtOverlay>
      <div className="w-full max-w-screen overflow-x-hidden border-y-4 border-white bg-black relative flex flex-col min-h-dvh">
        <div className="flex items-stretch bg-white text-black font-pixel relative overflow-hidden">
          {/* circuit trace decoration */}
          <div className="circuit-trace circuit-trace--h" style={{ top: '50%' }} />

          <div className="ornament-side px-2">
            <span>╔</span>
            <span>║</span>
            <span>║</span>
            <span>║</span>
            <span>╚</span>
          </div>

          <div className="flex-1 flex items-center justify-center border-x-2 border-black px-2 py-3 text-center relative">
            {/* occult corner symbols */}
            <span className="absolute top-1 left-1 text-[9px] text-black/30 select-none" aria-hidden="true">♰</span>
            <span className="absolute top-1 right-1 text-[9px] text-black/30 select-none" aria-hidden="true">⚹</span>
            <span className="absolute bottom-1 left-1 text-[9px] text-black/30 select-none" aria-hidden="true">♱</span>
            <span className="absolute bottom-1 right-1 text-[9px] text-black/30 select-none" aria-hidden="true">†</span>

            <span className="frame-title text-[18px] tracking-[0.08em] leading-relaxed">
              <span className="title-ornament-inner-tl" />
              <span className="title-ornament-inner-br" />
              ARCANA.LINK

            </span>
          </div>

          <div className="ornament-side px-2">
            <span>╔</span>
            <span>║</span>
            <span>║</span>
            <span>║</span>
            <span>╚</span>
          </div>
        </div>

        <div className="flex justify-between font-pixel text-[11px] text-white px-3 py-2 border-b-2 border-white tracking-wide select-none">
          <span><span className="blink">■</span> SPREAD: {spreadType ?? '—'}</span>
          <span className="flex items-center gap-1.5">
            {characterId && CHARACTER_INFO[characterId] && (
              <>
                <span
                  className="inline-block w-2.5 h-2.5 border border-white/30 flex-shrink-0"
                  style={{ backgroundColor: CHARACTER_INFO[characterId].color }}
                />
                <span className="text-[10px]">{CHARACTER_INFO[characterId].name}</span>
              </>
            )}
          </span>
        </div>

        <div className="text-center text-white text-base py-1 tracking-[0.3em] select-none">
          ═══ ❖ ═══ ═══ ❖ ═══
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        <div className="flex flex-col gap-2 px-3 py-2">
          <div className="flex flex-nowrap justify-center gap-1.5">
            <Button onClick={onNewSpread} className="!px-2 !text-[12px]">
              <span className="text-[11px]">✦</span> НOВЫЙ РАСКЛАД
            </Button>
            <Button onClick={onOpenCatalog} className="!px-2 !text-[12px]">
              <span className="text-[11px]">☰</span> КАТАЛOГ
            </Button>
            <Button onClick={onOpenSettings} className="!px-2 !text-[12px]">
              <span className="text-[11px]">⚙</span> НАСТРOЙКИ
            </Button>
          </div>
          <Button onClick={onOpenCalendar} className="w-full" variant="secondary">
            <span className="text-[13px]">◈</span> КАЛЕНДАРЬ
          </Button>
        </div>

        {/* <CursedFooter /> */}

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
