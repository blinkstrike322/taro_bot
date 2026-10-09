// ─────────────────────────────────────────────────────────────
// transcript.ts — модель записей терминального скроллбэка.
// Весь флоу приложения — растущий журнал: команды, вывод,
// меню, карты, чтения. Никаких модалок и экранов.
// ─────────────────────────────────────────────────────────────
import type { Interpretation } from '@/lib/api';
import { GUIDES } from '@/lib/guides';
import { SPREADS } from '@/lib/spreads';

export type OutTone =
  | 'plain' | 'dim' | 'faint' | 'ok' | 'err' | 'warn'
  | 'info' | 'accent' | 'bright' | 'comment';

export interface OutLine {
  text: string;
  tone?: OutTone;
}

export interface TarotCard {
  id: string;
  name: string;
  image_url: string;
  is_reversed: boolean;
}

/** строка журнала истории — полные данные для повторного разворота */
export interface HistoryCardsData {
  cards?: TarotCard[];
  spread_type?: string;
  /** легаси карты дня: {chosen_index, chosen_card} — старые строки журнала */
  chosen_index?: number;
  chosen_card?: TarotCard;
}

export interface HistoryRow {
  id: string;
  type: string;
  question: string | null;
  created_at: string;
  cards_data?: HistoryCardsData | TarotCard[] | null;
  interpretation?: Interpretation;
  character_id?: string;
}

/** вариант списка отголосков: полная строка журнала едет с собой —
 *  клик разворачивает чтение без нового похода в сеть */
export interface EchoMatchItem {
  dbId: string;
  created_at: string;
  spreadLabel: string;
  question: string | null;
  sharedNames: string[];
  sharedCount: number;
  character_id?: string;
  /** полная строка журнала — карты и толкование для разворота */
  row: HistoryRow;
}

export type Entry =
  | { id: number; kind: 'cmd'; text: string }
  | { id: number; kind: 'out'; lines: OutLine[]; stagger?: boolean }
  | { id: number; kind: 'boot' }
  | { id: number; kind: 'motd' }
  | { id: number; kind: 'progress'; label: string; durMs: number }
  | { id: number; kind: 'pending'; label: string }
  | {
      id: number; kind: 'daily'; card: TarotCard; flipped: boolean;
      interpretation: Interpretation | null;
      whisperReady?: boolean;
      /** токен сеанса — «отправить в терминал» после вскрытия */
      token?: string;
    }
  | {
      id: number; kind: 'spread';
      cards: TarotCard[]; flipped: boolean[];
      question: string | null;
      interpretation: Interpretation | null;
      spreadLabel: string; count: number;
      spreadId?: string;
      layout?: string;
      flipOrder?: string[];
      positionKeys?: string[];
      positions?: string[];
      whisperReady?: boolean;
      /** токен сеанса — «отправить в терминал» после вскрытия */
      token?: string;
    }
  | {
      id: number; kind: 'json';
      interpretation: Interpretation;
      cards: TarotCard[];
      question: string | null;
      spreadLabel: string;
      instant?: boolean;
      characterId?: string;
      /** id расклада — «спросить снова» повторяет расклад */
      spreadId?: string;
      /** id строки БД — для инстант-разворотов из журнала:
       *  отголосок исключает саму строку из поиска;
       *  «отправить в терминал» шарит по нему */
      dbId?: string;
      /** токен сеанса живого чтения — шаринг по нему */
      token?: string;
    }
  | { id: number; kind: 'menu'; menuId: 'catalog' | 'guides' }
  | { id: number; kind: 'library'; open?: boolean }
  | { id: number; kind: 'stats' }
  | { id: number; kind: 'history'; rows: HistoryRow[] }
  | { id: number; kind: 'restore'; count: number; savedAt: number }
  | {
      id: number; kind: 'followup';
      cardName: string;
      cardImage?: string;
      question: string;
      answer: string;
      spreadLabel?: string;
      characterId?: string;
      /** парный вопрос: вторая карта и признак пары */
      cardName2?: string;
      cardImage2?: string;
      pair?: boolean;
    }
  | { id: number; kind: 'error'; msg: string }
  | { id: number; kind: 'ok'; msg: string }
  | { id: number; kind: 'paywall'; msg: string }
  | {
      /** личный аркан: нумерологическое ядро даты рождения.
       *  не restorable — после рестарта taro arcana пересчитает
       *  мгновенно (whisper не персистится). */
      id: number; kind: 'arcana';
      /** дата рождения дд.мм.гггг (цепочка пересчитывается на лету) */
      dateStr: string;
      cardId: string;
      /** шёпот проводника — приходит асинхронно (или фолбэк) */
      whisper?: string;
      /** ждём LLM-шёпот: до ответа показываем pending-строку */
      askWhisper?: boolean;
      /** повторный показ из localStorage — без шёпота, компактно */
      fromMemory?: boolean;
    }
  | {
      /** фаза луны: блок сам пересчитывает дату при рендере.
       *  не restorable — пересчёт дешевле хранения. */
      id: number; kind: 'moon';
    }
  | {
      /** дайджест недели: сводка чтений за 7 дней. блок сам
       *  грузит журнал и LLM-рефлексию. не restorable — цифры
       *  недели меняются день ото дня, пересчёт честнее хранения. */
      id: number; kind: 'week';
    }
  | {
      /** дайджест месяца: текущий календарный месяц в картах —
       *  полоса дней, баланс аркан, карта месяца, рефлексия.
       *  не restorable — месяц доживает до конца, пересчёт
       *  честнее хранения. */
      id: number; kind: 'month';
    }
  | {
      /** покрытие фосфора: список тем терминала. активная тема —
       *  live-состояние, не запись; блок рендерит текущее всегда.
       *  не restorable — тема живёт в taro_theme, не в транскрипте. */
      id: number; kind: 'theme';
    }
  | {
      /** прогноз дня по карте: лозунг/утро/день/вечер/шкалы/глоток.
       *  прогноз прилетает асинхронно (LLM) и дописывается в запись.
       *  не restorable — прогноз свеж только для сегодняшнего дня. */
      id: number; kind: 'forecast';
      /** карта дня, по которой выведен прогноз */
      cardName: string;
      cardImage?: string;
      reversed?: boolean;
      /** сама структура; пока нет — блок показывает ожидание */
      forecast?: import('@/lib/api').DayForecast;
      /** прогноз собран локально, без LLM */
      fallback?: boolean;
      /** канал не ответил — блок честно говорит об этом */
      failed?: boolean;
    }
  | {
      /** хроника карты: вся история выпадений аркана в журнале.
       *  блок сам тянет журнал (?all=1) и собирает события.
       *  не restorable — хроника пересчитывается по команде. */
      id: number; kind: 'card';
      /** id карты в колоде (the-fool и т.п.) */
      cardId: string;
      cardName: string;
      cardImage: string;
      arcana: string;
      suit: string | null;
      /** номер аркана/масти — для подписи */
      number: number;
      upright: string;
      reversed: string;
    }
  | {
      /** отголосок журнала: прошлые чтения с общими картами —
       *  список-выбор под текущим чтением. не restorable —
       *  эхо переслушивается чипом заново, БД не дублируем. */
      id: number; kind: 'echo';
      /** строка-вариант: всё для показа + полная строка для разворота */
      matches: EchoMatchItem[];
      /** чтение, к которому прислушивались */
      forEntryId: number;
    };

const WHISPERS: string[] = [
  'тени перешёптываются',
  'канал стабилен. помехи минимальны',
  'карты дышат в такт',
  'луна одобряет',
];

export function randomWhisper(guideId?: string | null): string {
  const pool = guideId ? GUIDES[guideId]?.whispers : undefined;
  const source = pool && pool.length ? pool : WHISPERS;
  return source[Math.floor(Math.random() * source.length)];
}

export function randomHex(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dd} ${months[d.getMonth()]} · ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

export function spreadLabelFromType(type: string): string {
  // легаси-формат бота хранил «spread_yesno»; наша БД — голый id
  const id = type.startsWith('spread_') ? type.slice('spread_'.length) : type;
  if (SPREADS[id]) return SPREADS[id].name;
  return type;
}
