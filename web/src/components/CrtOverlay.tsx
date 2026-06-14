'use client';

import { ReactNode } from 'react';

interface CrtOverlayProps {
  children: ReactNode;
}

export default function CrtOverlay({ children }: CrtOverlayProps) {
  return <div className="crt flex flex-col items-center w-full">{children}</div>;
}
