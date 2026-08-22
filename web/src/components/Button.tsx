'use client';

import { ReactNode, MouseEvent } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  variant?: 'primary' | 'secondary';
}

/**
 * Текстовая кнопка-типографика: serif-курсив + пиксель-капс внутри
 * (смешение шрифтов, как на постере). Без плашки и обводки.
 * Внутри children можно миксовать: <span>получить</span><span className="btn-word__pix">ответ ✦</span>
 */
export default function Button({
  children,
  onClick,
  className = '',
  variant = 'primary',
}: ButtonProps) {
  const base = 'btn-word select-none';

  const variants = {
    primary: '',
    secondary: 'btn-word--dim',
  };

  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
