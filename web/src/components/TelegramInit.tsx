"use client";

import { useEffect } from "react";

/**
 * Контракт Telegram Mini App, потерянный при переписывании фронта:
 * ready() снимает сплэш-лоадер клиента, expand() разворачивает на весь экран.
 * Сам скрипт SDK подключён в layout (strategy="beforeInteractive"), поэтому
 * к моменту эффекта window.Telegram.WebApp уже существует — гонки с defer,
 * на которую натыкался старый pages-router апп, здесь нет.
 */
export default function TelegramInit() {
  useEffect(() => {
    const tg = (
      window as unknown as {
        Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } };
      }
    ).Telegram?.WebApp;
    try {
      tg?.ready?.();
      tg?.expand?.();
    } catch {
      // Вне Telegram WebApp недоступен — браузерный запуск, не критично.
    }
  }, []);
  return null;
}
