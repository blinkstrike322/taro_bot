export type Intent = "next" | "previous" | "table" | null;
export interface GestureStart {
  x: number;
  y: number;
  top: boolean;
  bottom: boolean;
}
export function gestureIntent(
  start: GestureStart,
  end: { x: number; y: number },
): Intent {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  if (dx < -64 && Math.abs(dx) > Math.abs(dy) * 1.6) return "table";
  if (Math.abs(dy) <= 64 || Math.abs(dy) <= Math.abs(dx) * 1.6) return null;
  if (dy < 0 && start.bottom) return "next";
  if (dy > 0 && start.top) return "previous";
  return null;
}
export function nextUnopened(
  open: number[],
  index: number,
  count: number,
): number | null {
  for (let step = 1; step <= count; step++) {
    const next = (index + step) % count;
    if (!open.includes(next)) return next;
  }
  return null;
}

export function nextChapter(
  open: number[],
  index: number,
  count: number,
): number | null {
  return index + 1 < count ? index + 1 : nextUnopened(open, index, count);
}
