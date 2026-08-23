// Guide metadata — single source of truth for per-guide visual identity.
// Front-only; backend character prompts live in data/characters.json.

export interface GuideMeta {
  id: string;
  name: string;
  title: string;
  description: string;
  greeting: string;
  greetings: string[];

  // Visual identity — feminine pastel accents over ivory base
  accent: string;            // primary accent (text-safe on ivory)
  accentDim: string;         // dimmed variant for glows / washes
  accentSoft: string;        // soft tint for backgrounds / chips
  accentDeep: string;        // deep variant for gradients
  portrait: string;          // pixel-art portrait path (square)
  /** если задан — вместо портрета-картинки плоская плашка этого цвета */
  portraitColor?: string;
  cardBack: string;          // per-guide card back image path (2:3)
  cardBackVersion: number;   // bump to bust TG WebView cache when card backs change

  // Per-guide corner symbols (4 corners of frames/cards)
  cornerSymbols: {
    tl: string;
    tr: string;
    bl: string;
    br: string;
  };

  // Per-guide ASCII aura alphabet (used around cards / on daily-pick)
  auraAlphabet: string;

  // Per-guide ambient floating symbols (drift across background)
  ambientSymbols: string[];

  // Per-guide CSS background pattern (procedural, light pastel)
  ambientPattern: string;

  // Per-guide header subtitle (visible in header strip)
  subtitle: string;

  // Per-guide loading phrase
  loadingPhrase: string;

  // Per-guide mood names (shown in settings, mirrors backend moods)
  moodNames: string[];

  // Suggested follow-up questions in the guide's voice
  chatChips: string[];

  // Per-guide "type" indicator (retro tag)
  tag: string;

  // ── Sensory identity (atmosphere engine) ──
  clouds: {
    bank: 'moon' | 'ember' | 'storm';
    drift: number;
    tint: string;
    blend: 'screen' | 'multiply';
    density: number;
  };
  flower: { seed: number; tilt: number };
  revealBurst: { symbol: string; count: number };
}

export const GUIDES: Record<string, GuideMeta> = {
  shadow_walker: {
    id: 'shadow_walker',
    name: 'Селена',
    title: 'Дочь Луны',
    description: 'Лунная сестра. Слышит твои сны раньше, чем ты их увидишь.',
    greeting: 'Я тут. И луна тут. Спрашивай.',
    greetings: [
      'Я тут. И луна тут. Спрашивай.',
      'Тс-с. Я уже слышу твой вопрос.',
      'Проходи. Вода в чаше ещё не остыла.',
    ],
    accent: '#2749D2',
    accentDim: 'rgba(39, 73, 210, 0.22)',
    accentSoft: '#E4E8F9',
    accentDeep: '#1B36A6',
    portrait: '/guides/shadow_walker.png?v=2',
    cardBack: '/cards/backs/back_shadow_walker.png',
    cardBackVersion: 5,
    cornerSymbols: { tl: '◦', tr: '✦', bl: '◇', br: '○' },
    auraAlphabet: '·•✦✧○◌◇◎°~ﾟ',
    ambientSymbols: ['✦', '✧', '◌', '○', '◇', '·'],
    ambientPattern:
      'radial-gradient(ellipse at 20% 20%, rgba(141,137,192,0.14) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 85% 75%, rgba(207,201,221,0.18) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 60% 10%, rgba(217,223,234,0.16) 0%, transparent 50%)',
    subtitle: 'луна · вода · сны',
    loadingPhrase: 'луна слушает...',
    moodNames: ['светлая луна', 'туманная ночь', 'гроза', 'прилив'],
    chatChips: [
      'Что мне стоит почувствовать в этом раскладе?',
      'Какая карта здесь главная?',
      'О чём карты молчат?',
    ],
    tag: 'MOON.SIS',
    clouds: { bank: 'moon', drift: 0.5, tint: 'brightness(1.05) saturate(0.8) hue-rotate(-10deg)', blend: 'screen', density: 2 },
    flower: { seed: 17, tilt: -3 },
    revealBurst: { symbol: '✦', count: 10 },
  },

  ruin_keeper: {
    id: 'ruin_keeper',
    name: 'Веста',
    title: 'Хранительница Очага',
    description: 'Хранительница древнего очага. Скажет правду так, что её захочется услышать.',
    greeting: 'Очаг горит. Садись ближе. Спрашивай.',
    greetings: [
      'Очаг горит. Садись ближе. Спрашивай.',
      'Хлеб на столе, соль в плошке. Говори.',
      'Я ждала тебя. Огонь не зря трещал с утра.',
    ],
    accent: '#C96F1E',
    accentDim: 'rgba(201, 111, 30, 0.22)',
    accentSoft: '#F4E9DC',
    accentDeep: '#9A5410',
    portrait: '/guides/ruin_keeper.png',
    portraitColor: '#C96F1E',
    cardBack: '/cards/backs/back_ruin_keeper.png',
    cardBackVersion: 5,
    cornerSymbols: { tl: '◆', tr: '✦', bl: '◇', br: '○' },
    auraAlphabet: '·•✦✧◆◇◎°~ﾟ',
    ambientSymbols: ['✦', '✧', '◆', '◇', '○', '·'],
    ambientPattern:
      'radial-gradient(ellipse at 50% 15%, rgba(168,146,111,0.14) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 15% 80%, rgba(238,233,223,0.5) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 85% 60%, rgba(217,223,234,0.18) 0%, transparent 50%)',
    subtitle: 'очаг · янтарь · хлеб',
    loadingPhrase: 'очаг разгорается...',
    moodNames: ['тёплый очаг', 'янтарный полдень', 'камень', 'вечерний дым'],
    chatChips: [
      'Что мне делать по шагам?',
      'Где моя сила в этой ситуации?',
      'На что опереться на этой неделе?',
    ],
    tag: 'AMBER.KPR',
    clouds: { bank: 'ember', drift: 0.3, tint: 'sepia(0.5) saturate(1.4) brightness(0.96)', blend: 'multiply', density: 1 },
    flower: { seed: 23, tilt: 2 },
    revealBurst: { symbol: '◆', count: 8 },
  },

  spark_of_chaos: {
    id: 'spark_of_chaos',
    name: 'Лилит',
    title: 'Искра',
    description: 'Искра с характером. Откроет глаза — и заставит смеяться.',
    greeting: 'О, наконец-то. Я так и знала, что ты придёшь.',
    greetings: [
      'О, наконец-то. Я так и знала, что ты придёшь.',
      'Ставлю свою искру: вопрос у тебя интересный.',
      'Ты вовремя. Мне как раз было скучно.',
    ],
    accent: '#C9356F',
    accentDim: 'rgba(201, 53, 111, 0.22)',
    accentSoft: '#F5E5EC',
    accentDeep: '#9B2453',
    portrait: '/guides/spark_of_chaos.png',
    portraitColor: '#C9356F',
    cardBack: '/cards/backs/back_spark_of_chaos.png',
    cardBackVersion: 5,
    cornerSymbols: { tl: '✧', tr: '◇', bl: '✦', br: '○' },
    auraAlphabet: '·•✦✧◇◎∘○°~ﾟ',
    ambientSymbols: ['✦', '✧', '◇', '○', '·', '•'],
    ambientPattern:
      'radial-gradient(ellipse at 75% 25%, rgba(188,131,153,0.14) 0%, transparent 52%),' +
      'radial-gradient(ellipse at 20% 70%, rgba(207,201,221,0.18) 0%, transparent 52%),' +
      'radial-gradient(ellipse at 45% 90%, rgba(217,223,234,0.14) 0%, transparent 50%)',
    subtitle: 'искра · вишня · смех',
    loadingPhrase: 'искра зажигается...',
    moodNames: ['искры', 'тихий огонь', 'шторм', 'полуночный смех'],
    chatChips: [
      'Скажи прямо — что здесь не так?',
      'Где я себе вру?',
      'Что сделать уже сегодня?',
    ],
    tag: 'SPARK.FOX',
    clouds: { bank: 'storm', drift: 1.3, tint: 'saturate(0.7) contrast(1.05)', blend: 'multiply', density: 2 },
    flower: { seed: 41, tilt: -5 },
    revealBurst: { symbol: '✧', count: 12 },
  },
};

// порядок показа: Селена, Лилит, Веста
export const GUIDE_IDS = ['shadow_walker', 'spark_of_chaos', 'ruin_keeper'];

export function getGuide(id: string | undefined | null): GuideMeta {
  if (id && GUIDES[id]) return GUIDES[id];
  return GUIDES.shadow_walker;
}
