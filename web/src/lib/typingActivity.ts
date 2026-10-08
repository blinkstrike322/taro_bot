// ─────────────────────────────────────────────────────────────
// typingActivity.ts — модульный счётчик активных потоков печати.
// Shell подписывается и ставит data-typing на root и .crt:
// CSS ставит ambient-слои на паузу — main-thread остаётся печати.
// ─────────────────────────────────────────────────────────────

type Listener = (active: boolean) => void;

let count = 0;
const listeners = new Set<Listener>();

function notify() {
  const active = count > 0;
  listeners.forEach((l) => l(active));
}

export const typingActivity = {
  begin() {
    count += 1;
    if (count === 1) notify();
  },
  end() {
    count = Math.max(0, count - 1);
    if (count === 0) notify();
  },
  isActive() {
    return count > 0;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
