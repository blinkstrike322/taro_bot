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

export interface ReadingPosition {
  позиция?: string;
  карта?: string;
  реверс?: boolean;
  трактовка?: string;
}

export interface Interpretation {
  intro: string;
  short_answer: string;
  card_meaning?: string[] | string;
  advice?: string;
  // новая схема этапа 2 (аддитивная, легаси-фолбэк на card_meaning):
  // three-card
  позиции?: ReadingPosition[];
  связь_карт?: string;
  // daily
  проявление?: string;
  на_что_смотреть?: string;
  траектория?: { утро?: string; день?: string; вечер?: string };
}

/** Ошибка API с продуктовым флагом: пелена сомкнулась — нужен paywall. */
export class ApiError extends Error {
  needsSubscription?: boolean;
  status?: number;

  constructor(message: string, opts?: { needsSubscription?: boolean; status?: number }) {
    super(message);
    this.name = 'ApiError';
    this.needsSubscription = opts?.needsSubscription;
    this.status = opts?.status;
  }
}

/** Phase 1 of the two-phase spread: cards at once, LLM whisper in background. */
export interface SpreadBeginResponse {
  cards: TarotCardData[];
  token: string;
  remaining?: number;
  limit?: number;
  /** динамические позиции 3-карточного расклада — вычислены бэкендом по вопросу */
  positions?: string[];
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

/** Разобрать тело ошибки: message + продуктовый флаг needs_subscription. */
async function readErrorBody(res: Response): Promise<ApiError> {
  let msg = 'Spread failed';
  let needsSubscription: boolean | undefined;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
    if (typeof body?.needs_subscription === 'boolean') {
      needsSubscription = body.needs_subscription;
    }
  } catch {}
  return new ApiError(msg, { needsSubscription, status: res.status });
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
  if (!res.ok) throw await readErrorBody(res);
  return res.json();
}

export async function spreadPoll(token: string): Promise<SpreadPollResponse> {
  const initData = telegramInitData();
  const res = await fetch(
    `${API_BASE}/api/spread/poll?token=${encodeURIComponent(token)}&init_data=${encodeURIComponent(initData)}`,
  );
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

/** Синхронизация проводника с сервером (иначе шёпот придёт голосом старого). */
export async function setCharacter(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: getInitData(), character_id: id }),
  });
  if (!res.ok) throw await readErrorBody(res);
  const data = await res.json();
  return data.character_id || id;
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
