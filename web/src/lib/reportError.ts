// Отправка клиентских ошибок на бэкенд (/api/log), чтобы отлавливать «Application error»
// с реальных устройств, где консоль недоступна (Telegram WebView на слабых телефонах).
// Fire-and-forget, троттлинг, без секретов.

let lastSent = 0;

export interface ClientErrorInfo {
  message: string;
  stack?: string;
  source?: string;
  line?: number | null;
  col?: number | null;
}

export function reportClientError(info: ClientErrorInfo): void {
  const now = Date.now();
  if (now - lastSent < 2000) return; // не спамим при каскадных ошибках
  lastSent = now;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const body = JSON.stringify({
    message: String(info.message ?? '').slice(0, 2000),
    stack: String(info.stack ?? '').slice(0, 6000),
    source: String(info.source ?? '').slice(0, 300),
    line: info.line ?? null,
    col: info.col ?? null,
    url: typeof location !== 'undefined' ? location.href : '',
    ua: (navigator.userAgent || '').slice(0, 300),
    dm: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: navigator.hardwareConcurrency ?? null,
  });

  try {
    const ok =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/log', new Blob([body], { type: 'application/json' }));
    if (!ok) {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // молча — диагностика не должна валить приложение ещё сильнее
  }
}