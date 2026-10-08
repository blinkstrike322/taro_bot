// ─────────────────────────────────────────────────────────────
// api.ts — клиент канала ARCANUM (двухфазный расклад:
// карты сразу, толкование — фоновым шёпотом через поллинг).
// ─────────────────────────────────────────────────────────────

/** Telegram initData для авторизации каждого запроса.
 *  Dev-мок: NEXT_PUBLIC_DEV_MOCK_INITDATA — только локальная разработка,
 *  в проде Python отвергнет такие данные (подпись не совпадёт). */
function init_data(): string {
  if (typeof window === 'undefined') return '';
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp;
  if (tg?.initData) return tg.initData;
  return (process.env.NEXT_PUBLIC_DEV_MOCK_INITDATA as string | undefined) ?? '';
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
  позиции?: ReadingPosition[];
  связь_карт?: string;
  проявление?: string;
  на_что_смотреть?: string;
  траектория?: { утро?: string; день?: string; вечер?: string };
}

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

/** итог ритуала карты дня: серии после тяги */
export interface DailyRitualInfo {
  counted: boolean;
  morning: boolean;
  streakDays: number;
  morningStreak: number;
}

export interface SpreadBeginResponse {
  cards: TarotCardData[];
  token: string;
  remaining?: number;
  limit?: number;
  positions?: string[];
  spread_id?: string;
  spread_name?: string;
  position_keys?: string[];
  daily_ritual?: DailyRitualInfo;
}

export interface SpreadPollResponse {
  ready: boolean;
  interpretation?: Interpretation;
  error?: string;
}

export interface ReadingEntry {
  id: string;
  type: string;
  question: string | null;
  created_at: string;
  cards_data: any;
  interpretation: Interpretation;
  character_id: string;
}

async function readErrorBody(res: Response): Promise<ApiError> {
  let msg = 'канал недоступен';
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

/** фаза 1: раздача карт + запуск фонового шёпота */
export async function spreadBegin(
  spreadType: string | number,
  question: string | null,
  characterId: string = 'shadow_walker',
  /** локальный час оператора 0-23 — для серии рассветов */
  localHour?: number,
): Promise<SpreadBeginResponse> {
  const res = await fetch('/api/spread/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      init_data: init_data(),
      spread_type: spreadType,
      question,
      character_id: characterId,
      ...(typeof localHour === 'number' ? { local_hour: localHour } : {}),
    }),
  });
  if (!res.ok) throw await readErrorBody(res);
  return res.json();
}

export async function spreadPoll(token: string): Promise<SpreadPollResponse> {
  const res = await fetch(`/api/spread/poll?token=${encodeURIComponent(token)}&init_data=${encodeURIComponent(init_data())}`);
  if (!res.ok) throw new Error('канал прерван');
  return res.json();
}

/** ждать шёпот: поллинг до готовности, пока оператор вскрывает карты */
export async function pollInterpretation(
  token: string,
  timeoutMs = 120000,
  intervalMs = 1400,
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
  try {
    const res = await fetch(`/api/character?init_data=${encodeURIComponent(init_data())}`);
    if (!res.ok) return 'shadow_walker';
    const data = await res.json();
    return data.character_id || 'shadow_walker';
  } catch {
    return 'shadow_walker';
  }
}

export async function setCharacter(id: string): Promise<string> {
  const res = await fetch('/api/character', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: init_data(), character_id: id }),
  });
  if (!res.ok) throw await readErrorBody(res);
  const data = await res.json();
  return data.character_id || id;
}

export async function getReadings(): Promise<ReadingEntry[]> {
  const now = new Date();
  const res = await fetch(
    `/api/readings?year=${now.getFullYear()}&month=${now.getMonth() + 1}&init_data=${encodeURIComponent(init_data())}`,
  );
  if (!res.ok) throw new Error('журнал недоступен');
  const data = await res.json();
  return data.readings ?? [];
}

/** журнал за последние N дней (1-30): без привязки к месяцу —
 *  ретро-окно от текущего момента, для дайджеста недели */
export async function getReadingsDays(days: number): Promise<ReadingEntry[]> {
  const res = await fetch(`/api/readings?days=${days}&init_data=${encodeURIComponent(init_data())}`);
  if (!res.ok) throw new Error('журнал недоступен');
  const data = await res.json();
  return data.readings ?? [];
}

/** статистика оператора: серия дней, всего чтений, лорометр проводников */
export interface OperatorStats {
  streakDays: number;
  totalReadings: number;
  lastDailyAt: string | null;
  /** серия рассветов: карты дня, тянутые до полудня, подряд */
  morningStreak?: number;
  lastMorningAt?: string | null;
  /** сколько чтений голосом каждого проводника (id → N) */
  guideReadings?: Record<string, number>;
  /** сколько чтений по каждому типу расклада (raw type → N) */
  spreadCounts?: Record<string, number>;
}
export async function getStats(): Promise<OperatorStats | null> {
  try {
    const res = await fetch(`/api/stats?init_data=${encodeURIComponent(init_data())}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── уточняющий вопрос после чтения ──

/** карта в запросе: имя + контекст выпадения */
export interface FollowUpCardPayload {
  name: string;
  id?: string;
  orientation?: string;
  is_reversed?: boolean;
  position?: string | null;
}

export interface FollowUpPayload {
  question: string;
  /** одиночный путь (основной): одна карта */
  card?: FollowUpCardPayload;
  /** парный путь: вопрос о связи двух карт */
  cards?: [FollowUpCardPayload, FollowUpCardPayload];
  spread_name: string;
  spread_question: string | null;
  reading_summary: string;
  character_id: string;
}

export interface FollowUpResponse {
  answer: string;
  fallback?: boolean;
}

export async function askFollowup(payload: FollowUpPayload): Promise<FollowUpResponse> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: init_data(), ...payload }),
  });
  if (!res.ok) throw await readErrorBody(res);
  const data = await res.json();
  if (!data?.answer) throw new ApiError('шёпот вернулся пустым');
  return { answer: String(data.answer), fallback: data.fallback === true };
}

// ── рефлексия недели ──

/** сводка недели — клиент агрегирует, сервер валидирует */
export interface WeekDigestPayload {
  total: number;
  days_active: number;
  spread_counts: Record<string, number>;
  card_counts: Record<string, number>;
  guide_counts: Record<string, number>;
  questions: string[];
  date_from: string;
  date_to: string;
}

export interface WeekResponse {
  answer: string;
  fallback?: boolean;
}

export async function askWeek(
  digest: WeekDigestPayload,
  characterId: string,
): Promise<WeekResponse> {
  const res = await fetch('/api/week', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: init_data(), digest, character_id: characterId }),
  });
  if (!res.ok) throw await readErrorBody(res);
  const data = await res.json();
  if (!data?.answer) throw new ApiError('неделя молчит');
  return { answer: String(data.answer), fallback: data.fallback === true };
}

// ── месячный дайджест ──

/** сводка месяца для /api/month: числа + имена + вопросы */
export interface MonthDigestPayload {
  total: number;
  days_active: number;
  days_in_month: number;
  month_name: string;
  year: number;
  spread_counts: Record<string, number>;
  card_counts: Record<string, number>;
  guide_counts: Record<string, number>;
  majors: number;
  suit_counts: Record<string, number>;
  days: { day: number; count: number }[];
  questions: string[];
}

export interface MonthResponse {
  answer: string;
  fallback?: boolean;
}

export async function askMonth(
  digest: MonthDigestPayload,
  characterId: string,
): Promise<MonthResponse> {
  const res = await fetch('/api/month', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: init_data(), digest, character_id: characterId }),
  });
  if (!res.ok) throw await readErrorBody(res);
  const data = await res.json();
  if (!data?.answer) throw new ApiError('месяц молчит');
  return { answer: String(data.answer), fallback: data.fallback === true };
}

// ── прогноз дня по карте ──

/** структура дневного прогноза: лозунг, три времени, фокус, шкалы */
export interface DayForecast {
  лозунг: string;
  утро: string;
  день: string;
  вечер: string;
  фокус: string;
  тонус: number;
  удача: number;
  общение: number;
  глоток: string;
}

export interface DayForecastPayload {
  card: { name: string; is_reversed?: boolean };
  character_id: string;
}

export interface DayForecastResponse {
  forecast: DayForecast;
  fallback: boolean;
}

/** прогноз дня: карта дня уже вскрыта — вывести из неё план дня */
export async function dayForecast(payload: DayForecastPayload): Promise<DayForecastResponse> {
  const res = await fetch('/api/forecast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: init_data(), ...payload }),
  });
  if (!res.ok) throw await readErrorBody(res);
  const data = await res.json();
  if (!data?.forecast) throw new ApiError('прогноз не собрался');
  return { forecast: data.forecast as DayForecast, fallback: data.fallback === true };
}

/** весь журнал (до 500 строк) — хроника карты смотрит на всё */
export async function getAllReadings(): Promise<ReadingEntry[]> {
  const res = await fetch(`/api/readings?all=1&init_data=${encodeURIComponent(init_data())}`);
  if (!res.ok) throw new Error('журнал недоступен');
  const data = await res.json();
  return data.readings ?? [];
}
