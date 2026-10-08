// ─────────────────────────────────────────────────────────────
// echo.ts — «отголосок журнала»: карты повторяются — и терминал
// помнит. Чистая функция поиска прошлых чтений с общими картами.
// Никакого React и сети — только множества имён и даты.
// ─────────────────────────────────────────────────────────────
import type { HistoryRow } from '@/lib/transcript';

/** что мы знаем о текущем чтении */
export interface EchoCurrent {
  cards: { name: string }[];
  question: string | null;
  spreadLabel: string;
}

/** найденный отголосок: строка журнала + общие карты */
export interface EchoMatch {
  row: HistoryRow;
  sharedNames: string[];
  sharedCount: number;
}

/** свежие строки БД моложе этого окна — само текущее чтение:
 *  оно уже сохранено в журнал, эхом самого себя не бывает */
const SELF_WINDOW_MS = 3 * 60 * 1000;

/** сколько отголосков показываем — терминал не болтлив */
const MAX_MATCHES = 3;

/** имена карт строки журнала (cards_data — объект или массив) */
function rowCardNames(row: HistoryRow): string[] {
  const data = row.cards_data;
  const cards = Array.isArray(data)
    ? data
    : Array.isArray(data?.cards)
      ? data.cards
      : [];
  const names: string[] = [];
  for (const c of cards) {
    const n = typeof c?.name === 'string' ? c.name.trim() : '';
    if (n) names.push(n);
  }
  return names;
}

function timeOf(row: HistoryRow): number {
  const t = Date.parse(row.created_at);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Поиск отголосков: прошлые чтения с общими картами.
 *
 * Порог: расклад из 2+ карт — нужно ≥2 общих; одиночное чтение
 * (карта дня, ask1) — достаточно 1 общей.
 *
 * Исключения:
 *  · строки моложе 3 минут — текущее чтение уже лежит в БД;
 *  · строка с dbId (инстант из журнала) — сам развёрнутый сеанс;
 *  · дубли — вопрос (непустой, совпавший) И весь набор карт тот же.
 *
 * Сортировка: число общих карт ↓, затем дата ↓. Топ-3.
 */
export function findEchoes(
  current: EchoCurrent,
  rows: HistoryRow[],
  excludeDbId?: string,
): EchoMatch[] {
  const currentNames = new Set(
    current.cards
      .map((c) => (typeof c?.name === 'string' ? c.name.trim() : ''))
      .filter(Boolean),
  );
  if (currentNames.size === 0) return [];

  // порог общих карт: одиночному чтению хватит одной
  const threshold = current.cards.length > 1 ? 2 : 1;

  const now = Date.now();
  const currentQ = (current.question ?? '').trim().toLowerCase();

  const matches: EchoMatch[] = [];
  for (const row of rows) {
    // инстант-разворот из журнала: саму строку не эхаем
    if (excludeDbId && row.id === excludeDbId) continue;

    // свежесохранённое текущее чтение — не отголосок, а отражение
    const t = timeOf(row);
    if (t > 0 && now - t < SELF_WINDOW_MS) continue;

    const rowNames = rowCardNames(row);
    if (rowNames.length === 0) continue;

    const shared = [...currentNames].filter((n) => rowNames.includes(n));
    if (shared.length < threshold) continue;

    // дубль: непустой вопрос совпал И карты те же — это оно само
    // (пустые вопросы не считаем совпадением: карта дня без
    // вопроса, выпавшая снова, — настоящий отголосок, не дубль)
    const rowQ = (row.question ?? '').trim().toLowerCase();
    const sameQuestion = currentQ.length > 0 && rowQ === currentQ;
    const rowSet = new Set(rowNames);
    const sameCards =
      rowSet.size === currentNames.size &&
      [...currentNames].every((n) => rowSet.has(n));
    if (sameQuestion && sameCards) continue;

    matches.push({ row, sharedNames: shared, sharedCount: shared.length });
  }

  // громче отголосок — тот, где больше общих карт; при равенстве
  // свежий звучит первым
  matches.sort((a, b) => {
    if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
    return timeOf(b.row) - timeOf(a.row);
  });

  return matches.slice(0, MAX_MATCHES);
}
