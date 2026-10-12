import type { CSSProperties } from 'react';

export type IconName = 'star' | 'cards' | 'journal' | 'guide' | 'arrow' | 'back' | 'close' | 'check' | 'moon' | 'arch' | 'spark' | 'refresh';

export function Icon({ name, size = 24, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'star' && <><path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10Z" /><path d="m5 5 3 3m8 8 3 3m0-14-3 3M8 16l-3 3" /></>}
    {name === 'cards' && <><rect x="8" y="4" width="10" height="16" rx="1.5" /><path d="m7 7-3 1 3 14 6-1" /><path d="m13 8 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" /></>}
    {name === 'journal' && <><path d="M4 8a8 8 0 1 1-1 7M4 3v5H0" /><path d="M12 7v5l3 2" /></>}
    {name === 'guide' && <><path d="m12 2 10 18H2Z" /><circle cx="12" cy="13" r="3" /><path d="M12 8V5m0 13v2" /></>}
    {name === 'arrow' && <path d="M4 12h16m-6-6 6 6-6 6" />}
    {name === 'back' && <path d="M20 12H4m6-6-6 6 6 6" />}
    {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
    {name === 'moon' && <><path d="M17.5 3.5a9 9 0 1 1-13 13A9 9 0 0 0 17.5 3.5Z" /><path d="m6 3 .5 2 2 .5-2 .5L6 8l-.5-2-2-.5 2-.5Z" /></>}
    {name === 'arch' && <><path d="M5 21V10a7 7 0 0 1 14 0v11M8 21V10a4 4 0 0 1 8 0v11M3 21h18M12 3v3M5 9h3m8 0h3" /><path d="M12 11v7m-2-2h4" /></>}
    {name === 'spark' && <><path d="m12 2 1 6 5-4-3 6 7 2-7 2 3 6-5-4-1 6-1-6-5 4 3-6-7-2 7-2-3-6 5 4Z" /><circle cx="12" cy="12" r="1" /></>}
    {name === 'refresh' && <><path d="M20 7a8 8 0 1 0 1 8M20 2v5h-5" /></>}
  </svg>;
}

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`p-divider ${className}`} aria-hidden="true"><span /><Icon name="star" size={18} /><span /></div>;
}

export function Astrolabe({ className = '' }: { className?: string }) {
  return <svg className={`p-astrolabe ${className}`} viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth=".6" aria-hidden="true">
    <circle cx="200" cy="200" r="183" /><circle cx="200" cy="200" r="150" /><circle cx="200" cy="200" r="111" /><circle cx="200" cy="200" r="67" />
    <path d="M200 0v400M0 200h400M70 70l260 260M70 330 330 70" />
    <path d="M200 17 358 290H42Z" /><path d="M200 383 42 110h316Z" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => <path key={r} transform={`rotate(${r} 200 200)`} d="M200 9v16M196 17h8" />)}
  </svg>;
}
