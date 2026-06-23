import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '@/styles/globals.css';

function setAppHeight() {
  const h = window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
}

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.expand();
      }
    } catch {}

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    return () => window.removeEventListener('resize', setAppHeight);
  }, []);

  return <Component {...pageProps} />;
}
