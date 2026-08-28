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

/** Phase 1 of the two-phase spread: cards at once, LLM whisper in background. */
export interface SpreadBeginResponse {
  cards: TarotCardData[];
  token: string;
  remaining?: number;
  limit?: number;
}

export interface SpreadPollResponse {
  ready: boolean;
  interpretation?: Interpretation;
  error?: string;
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

function telegramInitData(): string {
  try {
    return (window as any).Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

export async function spread(
  spreadType: 1 | 3,
  question: string | null,
  characterId: string = 'shadow_walker',
): Promise<SpreadResponse> {
  const initData = telegramInitData();
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
    let msg = 'Spread failed';
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/** Двухфазный расклад: карты сразу, толкование — фоновым шёпотом. */
export async function spreadBegin(
  spreadType: 1 | 3,
  question: string | null,
  characterId: string = 'shadow_walker',
): Promise<SpreadBeginResponse> {
  const initData = telegramInitData();
  const res = await fetch(`${API_BASE}/api/spread/begin`, {
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
    let msg = 'Spread failed';
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function spreadPoll(token: string): Promise<SpreadPollResponse> {
  const res = await fetch(`${API_BASE}/api/spread/poll?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('канал прерван');
  return res.json();
}

/** Ждать шёпот: поллит до готовности, пока оператор вскрывает карты. */
export async function pollInterpretation(
  token: string,
  timeoutMs = 180000,
  intervalMs = 1500,
): Promise<Interpretation> {
  const t0 = Date.now();
  for (;;) {
    const res = await spreadPoll(token);
    if (res.ready) {
      if (res.error) throw new Error(res.error);
      if (res.interpretation) return res.interpretation;
      throw new Error('шёпот вернулся пустым');
    }
    if (Date.now() - t0 > timeoutMs) throw new Error('канал молчит слишком долго');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
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
