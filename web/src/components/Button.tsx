'use client';

import { ReactNode, MouseEvent } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  variant?: 'primary' | 'secondary';
}

export default function Button({
  children,
  onClick,
  className = '',
  variant = 'primary',
}: ButtonProps) {
  const base =
    'btn-vibe relative flex items-center justify-center gap-1.5 font-pixel text-[12px] px-3 py-2 tracking-wide font-bold select-none';

  const variants = {
    primary: 'btn-vibe--primary',
    secondary: 'btn-vibe--secondary',
  };

  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`}
      onClick={onClick}
    >
      <span className="btn-vibe-corners" aria-hidden="true">
        <span className="bvc bvc-tl" />
        <span className="bvc bvc-tr" />
        <span className="bvc bvc-bl" />
        <span className="bvc bvc-br" />
      </span>
      <span className="btn-vibe-scan" aria-hidden="true" />
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </button>
  );
}
