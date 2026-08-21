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
    'btn-vibe relative flex items-center justify-center gap-1.5 font-sans text-[13px] font-bold px-4 py-2.5 tracking-wide select-none';

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
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </button>
  );
}
