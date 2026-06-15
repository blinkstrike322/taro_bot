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
    'btn flex items-center gap-1 border-[3px] border-black font-pixel text-[13px] px-3 py-2 tracking-wide font-bold';
  const variants = {
    primary: 'bg-white text-black',
    secondary: 'bg-transparent border-white text-white',
  };
  const outline =
    variant === 'primary' ? 'outline outline-2 outline-white' : '';

  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${outline} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
