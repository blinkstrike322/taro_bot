// ─────────────────────────────────────────────────────────────
// spreads.ts — каталог раскладов ARCANUM (зеркало сервера).
// Лейауты: column1 | trio | pyramid | spine | pentagram | arc.
// Каждый лейаут несёт слоты геометрии (x,y — % контейнера,
// w — % ширины карты, rot — поворот) — рендерится одним
// движком в SpreadBlock, без исключений на каждый макет.
// ─────────────────────────────────────────────────────────────

export interface SpreadSlot {
  /** горизонталь центра слота, % ширины контейнера */
  x: number;
  /** вертикаль центра слота, % высоты контейнера */
  y: number;
  /** ширина карты, % ширины контейнера */
  w: number;
  /** поворот карты, градусы */
  rot: number;
  /** z-порядок для наложения дуги */
  z: number;
}

export interface FrontSpreadPosition {
  key: string;
  name: string;
  desc: string;
}

export interface FrontSpread {
  id: string;
  name: string;
  aliases: string[];
  cmd: string;
  count: number;
  layout: 'column1' | 'trio' | 'pyramid' | 'spine' | 'pentagram' | 'arc';
  needsQuestion: boolean;
  flipOrder: string[];
  positions: FrontSpreadPosition[];
  /** короткое описание для каталога */
  about: string;
}

export const SPREADS: Record<string, FrontSpread> = {
  daily: {
    id: 'daily', name: 'карта дня', aliases: ['день', 'daily', 'дневная', 'карта'],
    cmd: 'taro daily', count: 1, layout: 'column1',
    needsQuestion: false, flipOrder: ['p1'],
    positions: [{ key: 'p1', name: 'энергия дня', desc: 'главный сигнал сегодняшнего дня' }],
    about: 'одна карта — сигнал на весь день',
  },
  single: {
    id: 'single', name: 'одна карта', aliases: ['одна', 'one', 'ask1'],
    cmd: 'taro ask1', count: 1, layout: 'column1',
    needsQuestion: true, flipOrder: ['p1'],
    positions: [{ key: 'p1', name: 'суть ответа', desc: 'прямой ответ на вопрос' }],
    about: 'точечный ответ на конкретный вопрос',
  },
  yesno: {
    id: 'yesno', name: 'да / нет', aliases: ['данет', 'да-нет', 'yesno'],
    cmd: 'taro yesno', count: 3, layout: 'trio',
    needsQuestion: true, flipOrder: ['p1', 'p2', 'p3'],
    positions: [
      { key: 'p1', name: 'за', desc: 'что говорит «да»' },
      { key: 'p2', name: 'против', desc: 'что говорит «нет»' },
      { key: 'p3', name: 'совет', desc: 'как поступить с этим' },
    ],
    about: 'вердикт: за · против · совет',
  },
  three: {
    id: 'three', name: 'три карты', aliases: ['три', 'ask', 'спроси'],
    cmd: 'taro ask', count: 3, layout: 'pyramid',
    needsQuestion: false, flipOrder: ['p1', 'p2', 'p3'],
    positions: [
      { key: 'p1', name: 'позиция 1', desc: 'вычисляется по вопросу' },
      { key: 'p2', name: 'позиция 2', desc: 'вычисляется по вопросу' },
      { key: 'p3', name: 'позиция 3', desc: 'вычисляется по вопросу' },
    ],
    about: 'динамический расклад — позиции подстраиваются под вопрос',
  },
  mfd: {
    id: 'mfd', name: 'мысли · чувства · действия', aliases: ['чувства', 'мчд', 'mfd'],
    cmd: 'taro mfd', count: 3, layout: 'trio',
    needsQuestion: true, flipOrder: ['p1', 'p2', 'p3'],
    positions: [
      { key: 'p1', name: 'мысли', desc: 'что этот человек думает — вслух и про себя' },
      { key: 'p2', name: 'чувства', desc: 'что он чувствует на самом деле, под словами' },
      { key: 'p3', name: 'действия', desc: 'как это выйдет наружу — что он будет делать' },
    ],
    about: 'что он думает · чувствует · сделает',
  },
  shadow: {
    id: 'shadow', name: 'тень', aliases: ['тень-расклад', 'shadow-work', 'shadow'],
    cmd: 'taro shadow', count: 6, layout: 'spine',
    needsQuestion: false, flipOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    positions: [
      { key: 'p1', name: 'что я скрываю', desc: 'что во мне прячется за этой темой' },
      { key: 'p2', name: 'почему я это скрываю', desc: 'где и когда прятать стало безопаснее' },
      { key: 'p3', name: 'что скрывание защищает', desc: 'какую выгоду оно всё ещё даёт' },
      { key: 'p4', name: 'что оно стоит', desc: 'цена в энергии, честности, отношениях' },
      { key: 'p5', name: 'путь интеграции', desc: 'какое внутреннее разрешение вернёт это к свету' },
      { key: 'p6', name: 'следующий шаг', desc: 'одно маленькое конкретное действие на неделю' },
    ],
    about: 'шесть карт вглубь: от скрытого — к шагу',
  },
  pentagram: {
    id: 'pentagram', name: 'пентаграмма', aliases: ['пента', 'пентаграмма', 'pent'],
    cmd: 'taro pentagram', count: 6, layout: 'pentagram',
    needsQuestion: true,
    flipOrder: ['earth', 'air', 'water', 'fire', 'spirit', 'center'],
    positions: [
      { key: 'center', name: 'сигнификатор', desc: 'суть ситуации; кто ты в ней' },
      { key: 'spirit', name: 'дух', desc: 'сквозная линия, объединяющая все элементы' },
      { key: 'fire', name: 'огонь', desc: 'воля, импульс, что рвётся вперёд' },
      { key: 'water', name: 'вода', desc: 'чувства, интуиция, невысказанное' },
      { key: 'earth', name: 'земля', desc: 'тело, деньги, дом, опора' },
      { key: 'air', name: 'воздух', desc: 'мысль, слово, ясность' },
    ],
    about: 'пять стихий вокруг сигнификатора',
  },
  horseshoe: {
    id: 'horseshoe', name: 'подкова', aliases: ['подкова', 'shoe', 'horseshoe'],
    cmd: 'taro horseshoe', count: 7, layout: 'arc',
    needsQuestion: true, flipOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
    positions: [
      { key: 'p1', name: 'ситуация', desc: 'что происходит сейчас, на чём стоишь' },
      { key: 'p2', name: 'скрытое', desc: 'чего не видно изнутри ситуации' },
      { key: 'p3', name: 'препятствие', desc: 'что встаёт на пути' },
      { key: 'p4', name: 'внешнее', desc: 'люди и обстоятельства со стороны' },
      { key: 'p5', name: 'твоя позиция', desc: 'твой ресурс и твоя роль в этом' },
      { key: 'p6', name: 'чужая позиция', desc: 'другая сторона: что у них на уме' },
      { key: 'p7', name: 'исход', desc: 'куда ведёт текущая линия, если ничего не менять' },
    ],
    about: 'семь карт дугой: от ситуации — к исходу',
  },
};

// ── геометрии лейаутов: карта индексов (slotKey → слот) ──
// Координаты выверены с учётом: подпись под картой ~22-24px,
// карта 2:3, поворот увеличивает bbox на ~5%. y — % высоты,
// x — % ширины; пропорции контейнера заданы в LAYOUT_ASPECT.

/** подкова: 7 карт в два ряда со сдвигом (верх — 4, низ — 3) */
const ARC_SLOTS: Record<string, SpreadSlot> = {
  p1: { x: 13.5, y: 22, w: 22.5, rot: 6, z: 1 },
  p2: { x: 38, y: 22, w: 22.5, rot: 2, z: 1 },
  p3: { x: 62, y: 22, w: 22.5, rot: -2, z: 1 },
  p4: { x: 86.5, y: 22, w: 22.5, rot: -6, z: 1 },
  p5: { x: 25.5, y: 78, w: 22.5, rot: 4, z: 1 },
  p6: { x: 50, y: 78, w: 22.5, rot: 0, z: 1 },
  p7: { x: 74.5, y: 78, w: 22.5, rot: -4, z: 1 },
};

/** пентаграмма: дух — верх, по часовой воздух/вода/земля/огонь, центр — сигнификатор */
const PG_SLOTS: Record<string, SpreadSlot> = {
  spirit: { x: 50, y: 16, w: 17, rot: 0, z: 2 },
  air:    { x: 79, y: 38, w: 17, rot: 0, z: 2 },
  water:  { x: 72, y: 84.5, w: 17, rot: 0, z: 2 },
  earth:  { x: 28, y: 84.5, w: 17, rot: 0, z: 2 },
  fire:   { x: 21, y: 38, w: 17, rot: 0, z: 2 },
  center: { x: 50, y: 56, w: 23, rot: 0, z: 3 },
};

/** хребет: 6 карт сеткой 2×3, между колоннами — вертикальный след */
const SPINE_SLOTS: Record<string, SpreadSlot> = {
  p1: { x: 25, y: 16, w: 33, rot: 0, z: 1 },
  p2: { x: 75, y: 16, w: 33, rot: 0, z: 1 },
  p3: { x: 25, y: 50, w: 33, rot: 0, z: 1 },
  p4: { x: 75, y: 50, w: 33, rot: 0, z: 1 },
  p5: { x: 25, y: 84, w: 33, rot: 0, z: 1 },
  p6: { x: 75, y: 84, w: 33, rot: 0, z: 1 },
};

/** пирамида: 2-я сверху над 1-й и 3-й снизу */
const PYRAMID_SLOTS: Record<string, SpreadSlot> = {
  p1: { x: 22, y: 78, w: 28, rot: -2, z: 1 },
  p2: { x: 50, y: 22, w: 28, rot: 0, z: 2 },
  p3: { x: 78, y: 78, w: 28, rot: 2, z: 1 },
};

export function getLayoutSlots(
  layout: FrontSpread['layout'],
  positionKeys?: string[],
): SpreadSlot[] | null {
  const n = positionKeys?.length ?? 0;
  switch (layout) {
    case 'column1':
      return null; // флоу-лейаут
    case 'trio':
      return null; // флоу-лейаут
    case 'pyramid':
      return ['p1', 'p2', 'p3'].map((k) => PYRAMID_SLOTS[k]);
    case 'spine':
      return Array.from({ length: n || 6 }, (_, i) =>
        SPINE_SLOTS[`p${i + 1}`] ?? SPINE_SLOTS.p6,
      );
    case 'pentagram':
      return (positionKeys ?? ['spirit', 'fire', 'water', 'earth', 'air', 'center'])
        .map((k) => PG_SLOTS[k] ?? PG_SLOTS.center);
    case 'arc':
      return Array.from({ length: n || 7 }, (_, i) =>
        ARC_SLOTS[`p${i + 1}`] ?? ARC_SLOTS.p4,
      );
    default:
      return null;
  }
}

/** пропорции контейнера для absolute-лейаутов (выверены под слоты) */
export const LAYOUT_ASPECT: Partial<Record<FrontSpread['layout'], string>> = {
  pyramid: '1 / 1.1',
  spine: '4 / 6.9',
  pentagram: '1 / 1.05',
  arc: '10 / 9',
};

/** соединительные линии пентаграммы (для SVG-контура) — точки дух→огонь→вода... */
export const PENTAGRAM_EDGES: ReadonlyArray<readonly [string, string]> = [
  ['spirit', 'fire'], ['fire', 'water'], ['water', 'air'],
  ['air', 'earth'], ['earth', 'spirit'],
];

export function getFrontSpread(id: string): FrontSpread | undefined {
  return SPREADS[id];
}
