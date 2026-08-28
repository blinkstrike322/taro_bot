// Guide metadata — single source of truth for per-guide visual identity.
// Front-only; backend character prompts live in data/characters.json.

export interface GuideMeta {
  id: string;
  name: string;
  description: string;
  greeting: string;

  // Visual identity — палитра «Cathode Séance»:
  //   accent     — фосфорный акцент (яркий, контраст ≥7:1 на тьме)
  //   accentDim  — приглушённый вариант для свечений/подложек
  //   accentGlow — ореол для text-shadow больших надписей
  //   bgDeep     — тонированная тьма фона под гайда (не плоский чёрный)
  //   glowCenter — пятно электронно-лучевой трубки в центре экрана
  accent: string;            // primary accent color
  accentDim: string;         // dimmed variant for backgrounds / subtle accents
  accentGlow: string;        // halo variant for big glowing text
  bgDeep: string;            // guide-tinted deep background
  glowCenter: string;        // CRT center glow tint
  portrait: string;          // pixel-art portrait path (square)
  cardBack: string;          // per-guide card back image path (2:3)
  cardBackVersion: number;   // bump to bust TG WebView cache when card backs change

  // Per-guide corner symbols (4 corners of frames/cards)
  cornerSymbols: {
    tl: string;              // top-left
    tr: string;              // top-right
    bl: string;              // bottom-left
    br: string;              // bottom-right
  };

  // Per-guide ASCII aura alphabet (used around cards / on daily-pick)
  auraAlphabet: string;

  // Per-guide ambient floating symbols (drift across background)
  ambientSymbols: string[];

  // Per-guide CSS background pattern (procedural, applied to daily-pick screen)
  ambientPattern: string;

  // Per-guide header subtitle (visible in header strip)
  subtitle: string;

  // Per-guide loading phrase (replaces generic "ГАДАНИЕ...")
  loadingPhrase: string;

  // Per-guide "type" indicator (CRT-style tag)
  tag: string;
}

export const GUIDES: Record<string, GuideMeta> = {
  shadow_walker: {
    id: 'shadow_walker',
    name: 'Странница Теней',
    description: 'Ведьма из тёмного леса. Говорит тенями и шёпотом луны.',
    greeting: 'Тихо. Карты уже смотрят на тебя.',
    accent: '#c39dff',
    accentDim: 'rgba(195, 157, 255, 0.16)',
    accentGlow: 'rgba(195, 157, 255, 0.42)',
    bgDeep: '#080611',
    glowCenter: 'rgba(195, 157, 255, 0.055)',
    portrait: '/guides/shadow_walker.png',
    cardBack: '/cards/backs/back_shadow_walker.png',
    cardBackVersion: 2,
    cornerSymbols: { tl: '☾', tr: '✦', bl: '†', br: '☽' },
    auraAlphabet: '·•✦✧☾☽◯◌○◇◎°~^ﾟ',
    ambientSymbols: ['☾', '☽', '✦', '✧', '◌', '○', '◇', '∼'],
    ambientPattern:
      'radial-gradient(ellipse at 20% 30%, rgba(195,157,255,0.10) 0%, transparent 50%),' +
      'radial-gradient(ellipse at 80% 70%, rgba(195,157,255,0.08) 0%, transparent 55%),' +
      'repeating-linear-gradient(45deg, transparent 0px, transparent 22px, rgba(255,255,255,0.02) 22px, rgba(255,255,255,0.02) 23px)',
    subtitle: 'ТЕНЬ · ЛУНА · ШЁПОТ',
    loadingPhrase: 'ТЕНИ СГУЩАЮТСЯ...',
    tag: 'SHADOW.WLK',
  },

  ruin_keeper: {
    id: 'ruin_keeper',
    name: 'Хранитель Руин',
    description: 'Древний страж разрушенного. Помнит то, что все забыли.',
    greeting: 'Камень помнит. Карты молчат. Спрашивай.',
    accent: '#e8b568',
    accentDim: 'rgba(232, 181, 104, 0.15)',
    accentGlow: 'rgba(232, 181, 104, 0.40)',
    bgDeep: '#0d0a05',
    glowCenter: 'rgba(232, 181, 104, 0.05)',
    portrait: '/guides/ruin_keeper.png',
    cardBack: '/cards/backs/back_ruin_keeper.png',
    cardBackVersion: 2,
    cornerSymbols: { tl: '⚰', tr: '☥', bl: '†', br: '⚹' },
    auraAlphabet: '·•☦☨☩⚱☥⚰†‡✠✚◯◇◎°~',
    ambientSymbols: ['⚰', '☥', '†', '⚹', '✠', '◇', '◯', '·'],
    ambientPattern:
      'radial-gradient(ellipse at 50% 20%, rgba(232,181,104,0.10) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 30% 80%, rgba(232,181,104,0.07) 0%, transparent 50%),' +
      'repeating-linear-gradient(90deg, transparent 0px, transparent 32px, rgba(255,255,255,0.015) 32px, rgba(255,255,255,0.015) 33px),' +
      'repeating-linear-gradient(0deg, transparent 0px, transparent 32px, rgba(255,255,255,0.015) 32px, rgba(255,255,255,0.015) 33px)',
    subtitle: 'КАМЕНЬ · ПЕПЕЛ · ВЕК',
    loadingPhrase: 'ПЫЛЬ ОСЕДАЕТ...',
    tag: 'RUIN.KPR',
  },

  spark_of_chaos: {
    id: 'spark_of_chaos',
    name: 'Искра Хаоса',
    description: 'Дерзкий дух-трикстер. За искрой — истина, за шуткой — правда.',
    greeting: 'Посмотрим, что шепнет хаос на этот раз.',
    accent: '#ff7a8a',
    accentDim: 'rgba(255, 122, 138, 0.15)',
    accentGlow: 'rgba(255, 122, 138, 0.40)',
    bgDeep: '#100609',
    glowCenter: 'rgba(255, 122, 138, 0.05)',
    portrait: '/guides/spark_of_chaos.png',
    cardBack: '/cards/backs/back_spark_of_chaos.png',
    cardBackVersion: 2,
    cornerSymbols: { tl: '⌇', tr: '✕', bl: '⋈', br: '※' },
    auraAlphabet: '·•⌇∾◇◎∘○※✕⋈‡†°~^ﾟ',
    ambientSymbols: ['⌇', '∾', '※', '✕', '⋈', '∘', '·', '•'],
    ambientPattern:
      'radial-gradient(ellipse at 70% 30%, rgba(255,122,138,0.10) 0%, transparent 50%),' +
      'radial-gradient(ellipse at 25% 65%, rgba(255,122,138,0.08) 0%, transparent 55%),' +
      'repeating-linear-gradient(-30deg, transparent 0px, transparent 18px, rgba(255,255,255,0.02) 18px, rgba(255,255,255,0.02) 19px),' +
      'repeating-linear-gradient(60deg, transparent 0px, transparent 28px, rgba(255,255,255,0.015) 28px, rgba(255,255,255,0.015) 29px)',
    subtitle: 'ИСКРА · ДЫМ · ШЁПОТ',
    loadingPhrase: 'ИСКРЫ ПОЛЕТЕЛИ...',
    tag: 'SPARK.CHS',
  },
};

export const GUIDE_IDS = Object.keys(GUIDES);

export function getGuide(id: string | undefined | null): GuideMeta {
  if (id && GUIDES[id]) return GUIDES[id];
  return GUIDES.shadow_walker;
}
