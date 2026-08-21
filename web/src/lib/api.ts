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
  reading_id: number;
  cards: TarotCardData[];
  interpretation: Interpretation;
  remaining?: number | null;
  limit?: number | null;
}

export interface FollowupResponse {
  answer: string;
  remaining: number;
}

export interface ReadingEntry {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
  cards_data: any;
  interpretation: Interpretation;
  character_id: string;
}

export interface ReadingsResponse {
  readings: ReadingEntry[];
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'Ошибка. Попробуй снова.';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function spread(
  spreadType: 1 | 3 | 'daily',
  question: string | null,
  characterId: string = 'shadow_walker',
): Promise<SpreadResponse> {
  let initData = '';
  try {
    initData = (window as any).Telegram?.WebApp?.initData || '';
  } catch {}
  return postJSON('/api/spread', {
    init_data: initData,
    spread_type: spreadType,
    question,
    character_id: characterId,
  });
}

export async function followup(
  readingId: number,
  question: string,
): Promise<FollowupResponse> {
  let initData = '';
  try {
    initData = (window as any).Telegram?.WebApp?.initData || '';
  } catch {}
  return postJSON('/api/followup', {
    init_data: initData,
    reading_id: readingId,
    question,
  });
}

export async function getCharacter(): Promise<string> {
  const initData = getInitData();
  try {
    const res = await fetch(`${API_BASE}/api/character?init_data=${encodeURIComponent(initData)}`);
    if (!res.ok) return 'shadow_walker';
    const data = await res.json();
    return data.character_id || 'shadow_walker';
  } catch {
    return 'shadow_walker';
  }
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
