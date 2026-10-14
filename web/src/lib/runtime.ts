export interface Runtime {
  user_id: number;
  namespace: string;
  mode: "telegram" | "fixture" | "live";
  init_data: string;
}
let current: Runtime | null = null;
export function runtimeIdentity() {
  return current;
}
export async function initializeRuntime(): Promise<Runtime> {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ARCANUM_STUDIO === "1"
  ) {
    const response = await fetch("/__studio/bootstrap", { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        "Студия недоступна. Повтори подключение: сохранённый сеанс останется на месте.",
      );
    const value = await response.json();
    if (!value.init_data || !value.namespace || !value.user_id)
      throw new Error("Не удалось подтвердить локальный аккаунт.");
    current = value;
    return value;
  }
  const tg = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          initData?: string;
          initDataUnsafe?: { user?: { id: number } };
          ready?: () => void;
          expand?: () => void;
        };
      };
    }
  ).Telegram?.WebApp;
  if (!tg?.initData)
    throw new Error(
      "Не удалось подтвердить сеанс Telegram. Закрой и снова открой приложение.",
    );
  tg.ready?.();
  tg.expand?.();
  let user = tg.initDataUnsafe?.user?.id;
  if (!user) {
    try {
      user = JSON.parse(
        new URLSearchParams(tg.initData).get("user") || "{}",
      ).id;
    } catch {
      /* Server verifies signature. */
    }
  }
  if (!user) throw new Error("Не удалось определить аккаунт Telegram.");
  current = {
    user_id: user,
    namespace: "telegram",
    mode: "telegram",
    init_data: tg.initData,
  };
  return current;
}
