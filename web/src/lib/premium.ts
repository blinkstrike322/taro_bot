import type { Interpretation, ReadingEntry, SpreadBeginResponse, TarotCardData } from '@/lib/api';
import { SPREADS } from '@/lib/spreads';
import deck from '@/lib/tarot-deck.json';

export type PremiumScreen = 'home' | 'question' | 'setup' | 'spreads' | 'guides' | 'ritual' | 'reading' | 'journal';
export interface PremiumDraft {
  question: string;
  spreadId: string;
  operationKey?: string;
  operationGuide?: string;
}
export interface PremiumSession {
  token: string;
  question: string | null;
  spreadId: string;
  spreadName: string;
  guideId: string;
  cards: TarotCardData[];
  positions: string[];
  revealed: number[];
  createdAt: string;
  interpretation?: Interpretation;
  historical?: boolean;
  preview?: boolean;
  followups?: { question: string; answer: string; fallback?: boolean; cardIndex: number }[];
}
export interface PremiumSavedState {
  version: 1;
  guideId: string;
  draft: PremiumDraft;
  session: PremiumSession | null;
}

export const PREMIUM_GUIDES: Record<string, { symbol: 'moon' | 'arch' | 'spark'; lead: string; description: string; quote: string; accent: string }> = {
  shadow_walker: {
    symbol: 'moon', lead: 'Интуиция и бережная глубина',
    description: 'Поможет услышать то, что остаётся между строк. Мягко исследует чувства, сомнения и внутренние противоречия.',
    quote: '«Иногда ответу нужно немного тишины».', accent: '#a3afbb',
  },
  ruin_keeper: {
    symbol: 'arch', lead: 'Ясность и внутренняя опора',
    description: 'Говорит спокойно и прямо. Разбирает ситуацию по существу и помогает найти опору в том, на что ты можешь повлиять.',
    quote: '«Начнём с того, что выдержит время».', accent: '#b49a58',
  },
  spark_of_chaos: {
    symbol: 'spark', lead: 'Смелость и новый взгляд',
    description: 'Замечает неожиданные возможности. Чуть иронична, честна и умеет задать вопрос, которого ты избегаешь.',
    quote: '«А что, если разрешить себе иначе?»', accent: '#c88b75',
  },
};

export const PREMIUM_SPREADS: Record<string, { title: string; about: string; tag: string }> = {
  daily: { title: 'Карта дня', about: 'Небольшая пауза, чтобы почувствовать настрой дня и выбрать свой фокус.', tag: 'Ежедневный ритуал' },
  single: { title: 'Одна карта', about: 'Один образ, чтобы увидеть суть важного вопроса.', tag: 'Точный фокус' },
  three: { title: 'Три карты', about: 'Что привело сюда, что происходит сейчас и куда может вести следующий шаг.', tag: 'Глубокий взгляд' },
  yesno: { title: 'Да или нет', about: 'Аргументы за, сомнения и совет для твоего решения.', tag: 'На пороге выбора' },
  mfd: { title: 'Мысли · чувства · действия', about: 'Три стороны отношений: взгляд, эмоции и возможный поступок.', tag: 'Об отношениях' },
  shadow: { title: 'Тень', about: 'Бережное исследование скрытого: от внутренней защиты к новому шагу.', tag: 'Встреча с собой' },
  pentagram: { title: 'Пентаграмма', about: 'Цельный взгляд на ситуацию через пять стихий и её главный образ.', tag: 'С разных сторон' },
  horseshoe: { title: 'Подкова', about: 'Ситуация, препятствия, твой ресурс и возможное развитие.', tag: 'Большая картина' },
};

export const SPREAD_ORDER = ['daily', 'single', 'three', 'yesno', 'mfd', 'shadow', 'pentagram', 'horseshoe'];
export const EMPTY_DRAFT: PremiumDraft = { question: '', spreadId: 'three' };

export function cardArt(card: Pick<TarotCardData, 'id' | 'image_url'>): string {
  if (['the-moon', 'the-fool', 'the-hermit'].includes(card.id)) return `/premium/cards/${card.id}.webp`;
  return card.image_url || `/cards/${card.id}.png`;
}

export function cardMetadata(id: string): { numeral: string; family: string } {
  const card = deck.find((c) => c.id === id);
  if (!card) return { numeral: '', family: 'Таро' };
  const numerals = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
  const suits: Record<string, string> = { cups: 'Кубки', swords: 'Мечи', wands: 'Жезлы', pentacles: 'Пентакли' };
  return { numeral: card.arcana === 'major' ? numerals[card.number] || '' : String(card.number), family: card.arcana === 'major' ? 'Старшие арканы' : suits[card.suit || ''] || 'Младшие арканы' };
}

export function sessionFromBegin(response: SpreadBeginResponse, draft: PremiumDraft, guideId: string): PremiumSession {
  return {
    token: response.token, question: draft.spreadId === 'daily' ? null : draft.question.trim() || null,
    spreadId: response.spread_id || draft.spreadId,
    spreadName: PREMIUM_SPREADS[response.spread_id || draft.spreadId]?.title || response.spread_name || 'Расклад',
    guideId, cards: response.cards,
    positions: response.positions || SPREADS[draft.spreadId]?.positions.map((p) => p.name) || [],
    revealed: [], createdAt: new Date().toISOString(),
  };
}

export function sessionFromHistory(row: ReadingEntry): PremiumSession {
  let raw = row.cards_data;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const cards: TarotCardData[] = Array.isArray(raw) ? raw : Array.isArray(raw?.cards) ? raw.cards : raw?.chosen_card ? [raw.chosen_card] : [];
  const legacy: Record<string, string> = { spread_1: 'single', spread_3: 'three' };
  const spreadId = raw?.spread_type && SPREADS[raw.spread_type] ? raw.spread_type : legacy[row.type] || row.type.replace(/^spread_/, '');
  let interpretation = row.interpretation;
  if (typeof interpretation === 'string') { const text: string = interpretation; try { interpretation = JSON.parse(text); } catch { interpretation = { intro: text, short_answer: '' }; } }
  return {
    token: `history:${row.id}`, question: row.question, spreadId,
    spreadName: PREMIUM_SPREADS[spreadId]?.title || row.type,
    guideId: row.character_id || 'shadow_walker',
    cards: cards.map((c) => ({ ...c, image_url: c.image_url || `/cards/${c.id}.png` })),
    positions: raw?.positions || interpretation?.позиции?.map((p) => p.позиция || '') || SPREADS[spreadId]?.positions.map((p) => p.name) || [],
    revealed: cards.map((_, index) => index), createdAt: row.created_at,
    interpretation: interpretation || { intro: 'Текст этого чтения не сохранился.', short_answer: '' }, historical: true,
  };
}

/** Browser storage is scoped to the Telegram account; preview never writes real sessions. */
export function premiumStorageKey(preview = false): string {
  if (preview) return 'arcanum.premium.preview.v1';
  const userId = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return `arcanum.premium.v1:${userId || 'browser'}`;
}

export function loadPremiumState(key: string): PremiumSavedState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (parsed?.version !== 1 || !parsed.draft || !SPREADS[parsed.draft.spreadId] || !PREMIUM_GUIDES[parsed.guideId]) return null;
    const session = parsed.session && Array.isArray(parsed.session.cards) && typeof parsed.session.token === 'string' ? parsed.session : null;
    return { ...parsed, session };
  } catch { return null; }
}

export function savePremiumState(key: string, state: PremiumSavedState): void {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Quota/private mode: the in-memory session remains usable. */ }
}

export function readingPosition(session: PremiumSession, index: number): string {
  return session.interpretation?.позиции?.[index]?.позиция || session.positions[index] || `Позиция ${index + 1}`;
}

export function positionMeaning(session: PremiumSession, index: number): string {
  const interpreted = session.interpretation?.позиции?.[index]?.трактовка;
  if (interpreted) return interpreted;
  const meanings = session.interpretation?.card_meaning;
  return Array.isArray(meanings) ? meanings[index] || '' : index === 0 && typeof meanings === 'string' ? meanings : '';
}

export function formatPremiumDate(value: string): string {
  // SQLite timestamps are UTC, even when their string omits the zone.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function hasTelegramAuth(): boolean {
  return Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || process.env.NEXT_PUBLIC_DEV_MOCK_INITDATA);
}

export function makeOperationKey(): string {
  return crypto.randomUUID();
}

export function previewSession(draft: PremiumDraft, guideId: string): PremiumSession {
  const names = ['the-moon', 'the-fool', 'the-hermit'];
  const cards = names.map((id) => {
    const card = deck.find((c) => c.id === id)!;
    return { id, name: card.name, upright: card.upright, reversed: card.reversed, is_reversed: false, orientation: 'прямая', image_url: `/cards/${id}.png` };
  });
  const intros: Record<string, string> = {
    shadow_walker: 'Давай немного замедлимся. Здесь есть и желание перемен, и потребность чувствовать опору. Карты предлагают услышать обе стороны.',
    ruin_keeper: 'Разделим то, что известно, и то, что ты пока предполагаешь. Перемены возможны; им нужны ясный первый шаг и собственные критерии решения.',
    spark_of_chaos: 'Похоже, часть тебя уже стоит у двери. Другая всё ещё проверяет замки. Посмотрим, как дать место любопытству, сохранив здравый смысл.',
  };
  return {
    token: 'preview-showcase', preview: true, question: draft.question.trim() || 'Как понять, что я готова к переменам?',
    spreadId: 'three', spreadName: 'Три карты', guideId, cards,
    positions: ['Что остаётся в тени', 'Точка настоящего', 'Возможный следующий шаг'],
    revealed: [], createdAt: new Date().toISOString(),
    interpretation: {
      intro: intros[guideId] || intros.shadow_walker,
      short_answer: 'Готовность к переменам может прийти через небольшой опыт. Тебе не обязательно заранее знать весь путь — достаточно прояснить, какой первый шаг тебе подходит.',
      позиции: [
        { позиция: 'Что остаётся в тени', карта: 'Луна', трактовка: 'Луна отражает неопределённость: желание двигаться вперёд есть, а очертания будущего ещё размыты. Попробуй назвать свой страх конкретно. Что ты знаешь из опыта, а что дорисовывает тревога? Это поможет отделить полезную осторожность от привычки откладывать.' },
        { позиция: 'Точка настоящего', карта: 'Шут', трактовка: 'Шут предлагает место для любопытства. Возможно, тебе нужен первый опыт, чтобы почувствовать направление: разговор, пробная задача, короткая поездка. Выбери действие, у которого невысокая цена ошибки. Так появятся реальные впечатления, на которые можно опереться.' },
        { позиция: 'Возможный следующий шаг', карта: 'Отшельник', трактовка: 'Отшельник напоминает о твоём собственном темпе. После первого опыта устрой себе спокойную паузу: что дало энергию, а что потребовало слишком много? Решение станет яснее, если сравнить впечатления со своими ценностями, а не с чужими ожиданиями.' },
      ],
      связь_карт: 'От тумана Луны через открытость Шута к свету Отшельника — здесь складывается путь из трёх движений: назвать неизвестное, попробовать малое и прислушаться к себе. Каждый шаг добавляет ясности для следующего.',
      advice: 'Запиши одно изменение, которого ты хочешь, и один небольшой способ познакомиться с ним в ближайшие семь дней. После этого спроси себя: «Мне хочется продолжить?»',
    },
  };
}
