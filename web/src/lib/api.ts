const API_BASE = '';

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
  card_meaning: string[];
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

export function getTgId(): number {
  try {
    const tg = (window as any).Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.id || 0;
  } catch {
    return 0;
  }
}

export async function spread(
  spreadType: 1 | 3,
  question: string | null,
  characterId: string = 'shadow_walker',
): Promise<SpreadResponse> {
  const tgId = getTgId();
  const res = await fetch(`${API_BASE}/api/spread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tg_id: tgId,
      spread_type: spreadType,
      question,
      character_id: characterId,
    }),
  });
  if (!res.ok) throw new Error('Spread failed');
  return res.json();
}

export async function getReadings(
  year: number,
  month: number,
): Promise<ReadingsResponse> {
  const tgId = getTgId();
  const monthStr = String(month).padStart(2, '0');
  const res = await fetch(
    `${API_BASE}/api/readings?tg_id=${tgId}&year=${year}&month=${monthStr}`,
  );
  if (!res.ok) throw new Error('Get readings failed');
  return res.json();
}
