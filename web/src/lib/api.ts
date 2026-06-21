const API_BASE = '';

export function getInitData(): string {
  try {
    return (window as any).Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

export interface TarotCardData {
  id: string;
  name: string;
  upright: string;
  reversed: string;
  is_reversed: boolean;
  orientation: string;
  image_url: string;
}

export interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning: string[] | string;
  advice: string;
}

export interface SpreadResponse {
  cards: TarotCardData[];
  interpretation: Interpretation;
}

export interface ReadingEntry {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
  cards_data: string;
  character_id: string;
}

export interface ReadingsResponse {
  readings: ReadingEntry[];
}

export async function spread(
  spreadType: 1 | 3,
  question: string | null,
  characterId: string = 'shadow_walker',
): Promise<SpreadResponse> {
  let initData = '';
  try {
    initData = (window as any).Telegram?.WebApp?.initData || '';
  } catch {}
  const res = await fetch(`${API_BASE}/api/spread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      init_data: initData,
      spread_type: spreadType,
      question,
      character_id: characterId,
    }),
  });
  if (!res.ok) {
    let msg = 'Расклад не удался';
    try { const body = await res.json(); msg = body.error || msg; } catch {}
    const err: any = new Error(msg);
    err.response = { error: msg };
    throw err;
  }
  return res.json();
}

export async function getReadings(
  year: number,
  month: number,
): Promise<ReadingsResponse> {
  let initData = '';
  try {
    initData = (window as any).Telegram?.WebApp?.initData || '';
  } catch {}
  const monthStr = String(month).padStart(2, '0');
  const res = await fetch(
    `${API_BASE}/api/readings?init_data=${encodeURIComponent(initData)}&year=${year}&month=${monthStr}`,
  );
  if (!res.ok) throw new Error('Get readings failed');
  return res.json();
}
