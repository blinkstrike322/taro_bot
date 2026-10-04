'use client';

/**
 * Сигнал активности печати: модульный счётчик активных потоков.
 * ProseType/Typewriter вызывают begin()/end() вокруг реальной печати
 * (парно: begin — когда пошёл rAF-поток typeInto, end — в .then(finished),
 * который гарантированно резолвится и при отмене). Shell подписывается
 * и ставит/снимает атрибут data-typing на .shell-root / .crt —
 * CSS ставит ambient-слои на паузу, пока канал печатает.
 */
let count = 0;
const subs = new Set<(active: boolean) => void>();

function emit() {
  const active = count > 0;
  subs.forEach((cb) => cb(active));
}

export const typingActivity = {
  begin() {
    count += 1;
    if (count === 1) emit();
  },
  end() {
    count = Math.max(0, count - 1);
    if (count === 0) emit();
  },
  /** подписка на смену состояния; возвращает отписку */
  subscribe(cb: (active: boolean) => void): () => void {
    subs.add(cb);
    cb(count > 0); // синхронизируем с текущим состоянием сразу
    return () => subs.delete(cb);
  },
  isActive() {
    return count > 0;
  },
};
