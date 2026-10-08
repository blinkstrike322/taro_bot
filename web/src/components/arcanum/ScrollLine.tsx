'use client';

// ─────────────────────────────────────────────────────────────
// ScrollLine — строка свитка в транскрипте: подтверждение
// переписи (буфер или запасной путь файлом) + кнопка-ссылка
// «↓ свиток.txt». Скачивание: blob → временный <a download>,
// objectURL отзывается после того, как браузер взял файл.
// ─────────────────────────────────────────────────────────────
import { useRef } from 'react';
import { sEnter } from '@/lib/sound';
import type { Entry } from '@/lib/transcript';

export type ScrollEntry = Extract<Entry, { kind: 'scroll' }>;

interface ScrollLineProps {
  entry: ScrollEntry;
}

export default function ScrollLine({ entry }: ScrollLineProps) {
  // текущий живой blob-URL (свежий на каждое скачивание)
  const urlRef = useRef<string | null>(null);

  const handleDownload = () => {
    if (urlRef.current) return; // скачивание уже пошло
    const blob = new Blob([entry.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    sEnter();
    // отложенный revoke: браузер уже взял файл, URL отзываем
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (urlRef.current === url) urlRef.current = null;
    }, 9000);
  };

  return (
    <div className="scroll-entry">
      <span className="scroll-glyph" aria-hidden="true">⎘</span>
      <span className="tl tl-ok scroll-label">{entry.label}</span>
      <button
        type="button"
        className="scroll-link"
        onClick={handleDownload}
        aria-label={`скачать файл ${entry.filename}`}
      >
        <span className="scroll-link-glyph" aria-hidden="true">↓</span>
        <span className="scroll-link-name">{entry.filename}</span>
      </button>
    </div>
  );
}
