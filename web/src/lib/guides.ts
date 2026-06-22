// Guide metadata — single source of truth for per-guide visual identity.
// Front-only; backend character prompts live in data/characters.json.

export interface GuideMeta {
  id: string;
  name: string;
  description: string;
  greeting: string;

  // Visual identity
  accent: string;            // primary accent color (single allowed deviation from B&W)
  accentDim: string;         // dimmed variant for backgrounds / subtle accents
  portrait: string;          // pixel-art portrait path (square)
  cardBack: string;          // per-guide card back image path (2:3)

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
    description: 'Гадалка из тёмного леса. Говорит тенями и шёпотом луны.',
    greeting: 'Тихо. Карты уже смотрят на тебя.',
    accent: '#7B2D8E',
    accentDim: 'rgba(123, 45, 142, 0.18)',
    portrait: '/guides/shadow_walker.png',
    cardBack: '/cards/backs/back_shadow_walker.png',
    cornerSymbols: { tl: '☾', tr: '✦', bl: '†', br: '☽' },
    auraAlphabet: '·•✦✧☾☽◯◌○◇◎°~^ﾟ',
    ambientSymbols: ['☾', '☽', '✦', '✧', '◌', '○', '◇', '∼'],
    ambientPattern:
      'radial-gradient(ellipse at 20% 30%, rgba(123,45,142,0.10) 0%, transparent 50%),' +
      'radial-gradient(ellipse at 80% 70%, rgba(123,45,142,0.08) 0%, transparent 55%),' +
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
    accent: '#B8860B',
    accentDim: 'rgba(184, 134, 11, 0.18)',
    portrait: '/guides/ruin_keeper.png',
    cardBack: '/cards/backs/back_ruin_keeper.png',
    cornerSymbols: { tl: '⚰', tr: '☥', bl: '†', br: '⚹' },
    auraAlphabet: '·•☦☨☩⚱☥⚰†‡✠✚◯◇◎°~',
    ambientSymbols: ['⚰', '☥', '†', '⚹', '✠', '◇', '◯', '·'],
    ambientPattern:
      'radial-gradient(ellipse at 50% 20%, rgba(184,134,11,0.10) 0%, transparent 55%),' +
      'radial-gradient(ellipse at 30% 80%, rgba(184,134,11,0.07) 0%, transparent 50%),' +
      'repeating-linear-gradient(90deg, transparent 0px, transparent 32px, rgba(255,255,255,0.015) 32px, rgba(255,255,255,0.015) 33px),' +
      'repeating-linear-gradient(0deg, transparent 0px, transparent 32px, rgba(255,255,255,0.015) 32px, rgba(255,255,255,0.015) 33px)',
    subtitle: 'КАМЕНЬ · ПЕПЕЛ · ВЕК',
    loadingPhrase: 'ПЫЛЬ ОСЕДАЕТ...',
    tag: 'RUIN.KPR',
  },

  spark_of_chaos: {
    id: 'spark_of_chaos',
    name: 'Искра Хаоса',
    description: 'Дерзкий дух-трюкстер. За искрой — истина, за шуткой — правда.',
    greeting: 'Посмотрим, что шепнет хаос на этот раз.',
    accent: '#E63946',
    accentDim: 'rgba(230, 57, 70, 0.18)',
    portrait: '/guides/spark_of_chaos.png',
    cardBack: '/cards/backs/back_spark_of_chaos.png',
    cornerSymbols: { tl: '⌇', tr: '✕', bl: '⋈', br: '※' },
    auraAlphabet: '·•⌇∾◇◎∘○※✕⋈‡†°~^ﾟ',
    ambientSymbols: ['⌇', '∾', '※', '✕', '⋈', '∘', '·', '•'],
    ambientPattern:
      'radial-gradient(ellipse at 70% 30%, rgba(230,57,70,0.10) 0%, transparent 50%),' +
      'radial-gradient(ellipse at 25% 65%, rgba(230,57,70,0.08) 0%, transparent 55%),' +
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
