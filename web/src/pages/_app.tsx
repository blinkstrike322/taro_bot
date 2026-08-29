import type { AppProps } from 'next/app';
import { Component, ReactNode, useEffect } from 'react';
import '@/styles/globals.css';
import { reportClientError } from '@/lib/reportError';

// Dev-only backend mock — strips out of the production export.
if (process.env.NODE_ENV !== 'production') {
  require('@/lib/mockApi').installMockApi();
}

function setAppHeight() {
  const h = window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
}

// Лёгкий boundary: цепляет ошибку рендера, шлёт её на /api/log и вместо
// глухого «Application error» показывает понятный fallback с перезагрузкой.
class ReportBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: unknown) {
    reportClientError({
      message: (error as Error)?.message || String(error),
      stack: (error as Error)?.stack || String(info ?? ''),
    });
  }

  override render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', fontFamily: 'monospace', color: '#e8b46e' }}>
          <div>╭─ сеанс прерван ─╮</div>
          <div style={{ margin: '1rem 0', opacity: 0.7 }}>произошла ошибка отрисовки терминала</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ background: 'transparent', border: '1px solid #e8b46e', color: '#e8b46e', padding: '0.5rem 1.25rem', cursor: 'pointer' }}
          >
            перезапустить сеанс
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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

    // Глобальные отчёты: необработанные исключения и rejected-промисы в веб-вьюхе.
    const onError = (e: ErrorEvent) =>
      reportClientError({
        message: e.message,
        stack: (e.error as Error)?.stack,
        source: e.filename,
        line: e.lineno,
        col: e.colno,
      });
    const onRejection = (e: PromiseRejectionEvent) =>
      reportClientError({
        message:
          ((e.reason as Error)?.message as string) || String(e.reason ?? 'unhandledrejection'),
        stack: (e.reason as Error)?.stack,
      });

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <ReportBoundary>
      <Component {...pageProps} />
    </ReportBoundary>
  );
}