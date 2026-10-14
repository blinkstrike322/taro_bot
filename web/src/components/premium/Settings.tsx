"use client";
import { useEffect, useState } from "react";
import { getPreferences, savePreferences } from "@/lib/api";
export function Settings({
  effects,
  onEffects,
}: {
  effects: boolean;
  onEffects: (value: boolean) => void;
}) {
  const [notifications, setNotifications] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let gone = false;
    getPreferences()
      .then((p) => {
        if (!gone) setNotifications(p.notifications_enabled);
      })
      .catch(() => {
        if (!gone) setError("Не удалось загрузить настройки уведомлений.");
      });
    return () => {
      gone = true;
    };
  }, []);
  async function toggle() {
    if (notifications === null || busy) return;
    setBusy(true);
    setError("");
    try {
      setNotifications(
        (await savePreferences(!notifications)).notifications_enabled,
      );
    } catch {
      setError("Настройка не сохранилась. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-page">
      <h1>Настройки</h1>
      <p className="subtle">Пространство в твоём ритме.</p>
      <div className="settings-list">
        <label>
          <span>
            Эффекты и движение
            <small>Учитываем системное уменьшение движения.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={effects}
            onChange={(e) => onEffects(e.target.checked)}
          />
        </label>
        <label>
          <span>
            Уведомления бота<small>Напоминания о твоём ритуале.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            disabled={busy || notifications === null}
            checked={notifications === true}
            onChange={() => void toggle()}
          />
        </label>
      </div>
      <p className="footnote">Сейчас приложение работает без звука.</p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </section>
  );
}
