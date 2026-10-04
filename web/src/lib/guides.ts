// Guide metadata — single source of truth for per-guide visual identity.
// Front-only; backend character prompts live in data/characters.json.

/* ============================================================
   ПАЛИТРА · «Alchemical Manuscript»
   Референсы:
   - Классическая алхимическая стадия (nigredo → albedo → citrinitas → rubedo)
   - Средневековые гримуары (Ключ Соломона, Гептамерон) — настоящий пигмент,
     а не цифровой неон
   - Art Nouveau / Mucha: dusty jewel tones, природные пигменты
   - Discordian / Sacred geometry palettes (terra cotta, malachite, lapis)

   Подход — три проводника = три алхимические стадии. Каждый цвет —
   намеренно desaturated, как пигмент на пергаменте, не «цифровой» hex.
   ============================================================ */

export interface GuideMeta {
  id: string;
  name: string;
  description: string;
  greeting: string;
  // Пул приветствий (зеркало backend data/characters.json → greetings):
  // смена проводника звучит живо, а не одним текстом.
  greetings: string[];

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

  // Per-guide interface whispers (short ambient phrases, in the guide's voice).
  // NOTE: duplicated here because the frontend cannot read data/characters.json
  // at runtime — that backend file is the SOURCE OF TRUTH for these texts.
  whispers: string[];

  // Per-guide ritual closings — подпись в конце чтения (reading-close-phrase).
  closings: string[];
}

export const GUIDES: Record<string, GuideMeta> = {
  shadow_walker: {
    id: 'shadow_walker',
    name: 'Странница Теней',
    description: 'Гадалка из темного леса. Говорит тенями и шепотом луны.',
    greeting: 'Тихо. Карты уже смотрят на тебя.',
    greetings: [
      'Тихо. Карты уже смотрят на тебя.',
      'Тс-с. Я уже слышу твой вопрос.',
      'Заходи, малыш. Вода в чаше еще не остыла.',
      'Ночь длинная, а вопрос у тебя один. Давай его сюда.',
      'Свеча горит, чай заварен. Рассказывай.',
      'Плед на кресле твой. Садись ближе.'
    ],
    // ALBEDO · серебряная лунная стадия
    // accent: серебристо-лавандовый с холодным синим подтоном — как аметист
    //   под лунным светом, не «розовая жвачка»
    // bgDeep: глубокий indigo, почти чёрный, с холодным уклоном (не плоский #000)
    //   ещё затемнён на ~10% для глубины фона
    accent: '#b5a5e6',
    accentDim: 'rgba(181, 165, 230, 0.22)',
    accentGlow: 'rgba(181, 165, 230, 0.55)',
    bgDeep: '#05040f',
    glowCenter: 'rgba(181, 165, 230, 0.06)',
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
    subtitle: 'ТЕНЬ · ЛУНА · ШЕПОТ',
    loadingPhrase: 'ТЕНИ СГУЩАЮТСЯ...',
    tag: 'SHADOW.WLK',
    whispers: [
      'тени перешептываются',
      'где-то далеко скрипнула ветка',
      'луна скользнула за кроны',
      'мох помнит твои шаги',
      'тишина сгущается — слушай',
      'свеча моргнула — кто-то вспомнил о тебе',
      'вода в чаше пошла кругами',
      'тропа за окном притихла',
      'дым потянулся к твоему плечу',
      'ночь подвинулась ближе — пусть',
    ],
    closings: [
      'иди спать, я постерегу',
      'гаси свет — ночь меня сменит',
      'укройся потеплее, тропы никуда не уйдут',
      'свечу приглушу — спи спокойно',
      'завтра луна будет мягче — она обещала',
      'тихо. я тут — никто не пройдет',
      'отдай бессонницу лесу — он умеет держать',
      'плед твой, чай остыл — до утра',
    ],
  },

  ruin_keeper: {
    id: 'ruin_keeper',
    name: 'Хранитель Руин',
    description: 'Древний страж разрушенного. Помнит то, что все забыли.',
    greeting: 'Камень помнит. Карты молчат. Спрашивай.',
    greetings: [
      'Камень помнит. Карты молчат. Спрашивай.',
      'Садись ближе. Говори, что стряслось.',
      'Я старше твоего вопроса. Но спрашивай.',
      'Очаг горит, время есть. Выкладывай.',
      'Я слушаю. Коротко и по делу.',
      'Руины не идут к людям. Хорошо, что ты пришел.',
    ],
    // CITRINITAS · золотая солнечная стадия
    // accent: antique brass — оксидированная латунь с зеленцой,
    //   не ярко-жёлтый и не neon gold. Пигмент старого манускрипта.
    // bgDeep: тёплый табач, как выцветший пергамент под пеплом,
    //   затемнён ещё на ~10% для глубины
    accent: '#c8a368',
    accentDim: 'rgba(200, 163, 104, 0.22)',
    accentGlow: 'rgba(200, 163, 104, 0.5)',
    bgDeep: '#0a0704',
    glowCenter: 'rgba(200, 163, 104, 0.06)',
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
    whispers: [
      'пыль оседает',
      'камень держит тишину',
      'где-то осыпалась стена',
      'тихо. так и должно быть',
      'фундамент не врет',
      'в своде гулко отозвался шаг',
      'очаг еще держит тепло',
      'время точит стену медленно',
      'колодец отозвался эхом',
      'ступень под ногой крепкая',
    ],
    closings: [
      'сказано. камень запомнил',
      'свиток закрыт. печать стоит',
      'дело за руками — руины подождут',
      'иди. утро не будет ждать',
      'хлеб остывает — иди жить',
      'порог близко. шагай',
      'стена встанет, если класть по камню в день',
      'время на твоей стороне — не проспи',
    ],
  },

  spark_of_chaos: {
    id: 'spark_of_chaos',
    name: 'Искра Хаоса',
    description: 'Дерзкий дух-трикстер. За искрой — истина, за шуткой — правда.',
    greeting: 'Посмотрим, что шепнет хаос на этот раз.',
    greetings: [
      'Посмотрим, что шепнет хаос на этот раз.',
      'О, наконец-то. Скучно было до жути.',
      'Заходи, зай. Рассказывай, во что вляпалась на этот раз.',
      'Ну-с, герой. Только чур не обижаться на правду.',
      'Ты вовремя. Я как раз скучала по чужим драмам.',
      'Костер горит, вишня на закуску. Выкладывай.',
    ],
    // RUBEDO · красная стадия завершения
    // accent: vintage carmine — глубокий старинный красный, как выцветшее
    //   вино/кровь на пергаменте. НЕ neon pink и НЕ ярко-розовый.
    // bgDeep: oxblood — красновато-чёрный, как остывшая лава,
    //   затемнён ещё на ~10% для глубины
    accent: '#d65a6e',
    accentDim: 'rgba(214, 90, 110, 0.22)',
    accentGlow: 'rgba(214, 90, 110, 0.55)',
    bgDeep: '#0a0406',
    glowCenter: 'rgba(214, 90, 110, 0.06)',
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
    subtitle: 'ИСКРА · ДЫМ · ШЕПОТ',
    loadingPhrase: 'ИСКРЫ ПОЛЕТЕЛИ...',
    tag: 'SPARK.CHS',
    whispers: [
      'искры потянулись к фитилю',
      'хаос зевает от скуки',
      'где-то лопнул стакан',
      'тихо слишком тихо. подозрительно',
      'колода сама тасуется. к чему бы',
      'костер плюнул искрой в твою сторону',
      'ветер листает карты без спроса',
      'вишневая косточка щелкнула о блюдце',
      'где-то смеются — вроде бы над тобой',
    ],
    closings: [
      'искра погасла — хаос доволен',
      'дым рассеялся, знак остался',
      'пламя расписалось за тебя',
      'иди, герой, хаос тебя сегодня прикрыл',
      'беги делать — я прикрою твой тыл искрами',
      'не забудь меня, зай. я не забуду твой вопрос',
      'костер догорает, а ты — разгорайся',
      'вот такая драма. второй сезон за тобой',
    ],
  },
};

export const GUIDE_IDS = Object.keys(GUIDES);

export function getGuide(id: string | undefined | null): GuideMeta {
  if (id && GUIDES[id]) return GUIDES[id];
  return GUIDES.shadow_walker;
}
