export type RitualScreen =
  | "home"
  | "question"
  | "table"
  | "reading"
  | "spreads"
  | "journal"
  | "guides"
  | "settings";
export interface Anchor {
  id: string;
  offset: number;
}
export interface Progress {
  index: number;
  revealed: number[];
  anchors: Record<string, Anchor>;
}
export interface RitualState {
  version: 2;
  screen: RitualScreen;
  guideId: string;
  draft: { question: string; spreadId: string; operationKey?: string };
  activeId: number | null;
  progress: Record<string, Progress>;
  effects: boolean;
  pendingFollowups: Record<
    string,
    { operation_key: string; question: string; card_index: number | null }
  >;
  retryKeys: Record<string, string>;
}
export const emptyState = (): RitualState => ({
  version: 2,
  screen: "home",
  guideId: "shadow_walker",
  draft: { question: "", spreadId: "three" },
  activeId: null,
  progress: {},
  effects: true,
  pendingFollowups: {},
  retryKeys: {},
});
export function storageKey(namespace: string, owner: number) {
  return `arcanum.ritual.v2:${namespace}:${owner}`;
}
export function sanitizeProgress(
  value: Partial<Progress> | undefined,
  count: number,
): Progress {
  return {
    index: Math.min(
      Math.max(0, Number.isInteger(value?.index) ? value!.index! : 0),
      Math.max(0, count - 1),
    ),
    revealed: [
      ...new Set(
        (value?.revealed || []).filter(
          (i) => Number.isInteger(i) && i >= 0 && i < count,
        ),
      ),
    ],
    anchors:
      value?.anchors && typeof value.anchors === "object" ? value.anchors : {},
  };
}
export function loadState(key: string): RitualState {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (s?.version === 2 && s.draft && s.progress) {
      const base = emptyState();
      return { ...base, ...s };
    }
  } catch {
    /* Private storage unavailable. */
  }
  return emptyState();
}
export function saveState(key: string, state: RitualState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* In-memory use remains available. */
  }
}

export function anchorScrollTop(
  scroll: number,
  sectionTop: number,
  viewportTop: number,
  offset: number,
) {
  return Math.max(0, scroll + sectionTop - viewportTop + offset);
}
