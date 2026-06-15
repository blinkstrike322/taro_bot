'use client';

import { ReactNode } from 'react';
import CrtOverlay from './CrtOverlay';
import Button from './Button';
import CursedFooter from './CursedFooter';
import Toast from './Toast';

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
}: LayoutProps) {
  return (
    <CrtOverlay>
      <div className="w-full border-y-4 border-white bg-black relative flex flex-col min-h-screen">
        <div className="flex justify-between bg-black text-white font-pixel text-[11px] leading-none px-2 py-2 border-b-2 border-white tracking-tight">
          <span>┌─[OCGV_V1.0]─[root@taro]─[~]</span>
          <span>││ 0x3F ││</span>
        </div>

        <div className="flex items-stretch bg-white text-black font-pixel">
          <div className="flex flex-col items-center justify-center px-2 text-[16px] leading-none select-none">
            ┌┐
            <br />
            └┘
          </div>
          <div className="flex-1 flex items-center justify-center border-x-2 border-black px-2 py-3 text-center">
            <span className="text-[22px] tracking-[0.12em] leading-relaxed">
              [ ~/TAROT.bot ]*
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-2 text-[16px] leading-none select-none">
            ┌┐
            <br />
            └┘
          </div>
        </div>

        <div className="flex justify-between font-pixel text-[11px] text-white px-3 py-2 border-b-2 border-white tracking-wide select-none">
          <span>✦ SPREAD: {spreadType ?? '—'}</span>
          <span>ARCANA: ✦ {arcanaCount ?? 0}/78 ✦</span>
        </div>

        <div className="text-center text-white text-base py-1 tracking-[0.3em] select-none">
          ═══ ❖ ═══ ═══ ❖ ═══
        </div>

        <div className="flex-1">{children}</div>

        <div className="flex flex-col gap-2 px-3 py-2">
          <div className="flex flex-nowrap justify-center gap-1.5">
            <Button onClick={onNewSpread} className="!px-2 !text-[12px]">
              <span className="text-[11px]">✦</span> НОВЫЙ РАСКЛАД
            </Button>
            <Button onClick={onOpenCatalog} className="!px-2 !text-[12px]">
              <span className="text-[11px]">☰</span> КАТАЛОГ
            </Button>
            <Button onClick={onOpenSettings} className="!px-2 !text-[12px]">
              <span className="text-[11px]">⚙</span> НАСТРОЙКИ
            </Button>
          </div>
          <Button onClick={onOpenCalendar} className="w-full" variant="secondary">
            <span className="text-[13px]">◈</span> КАЛЕНДАРЬ
          </Button>
        </div>

        <CursedFooter />

        <Toast message={toastMessage} visible={toastVisible} onHide={onToastHide} />
      </div>
    </CrtOverlay>
  );
}
