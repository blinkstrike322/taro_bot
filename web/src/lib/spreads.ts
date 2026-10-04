// ─────────────────────────────────────────────────────────────
// Зеркало data/spreads.json — frontend не читает data/ в рантайме.
// Backend — источник правды. Структура и тексты позиций — ТОЧНО
// как в data/spreads.json (version 1); расхождения чинить в обоих местах.
// ─────────────────────────────────────────────────────────────

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
  layout: string;
  needsQuestion: boolean;
  flipOrder: string[];
  positions: FrontSpreadPosition[];
}

export const SPREADS: Record<string, FrontSpread> = {
  daily: {
    id: 'daily', name: 'карта дня', aliases: ['день', 'daily', 'дневная', 'карта'],
    cmd: 'taro daily', count: 1, layout: 'column1',
    needsQuestion: false, flipOrder: ['p1'],
    positions: [{ key: 'p1', name: 'энергия дня', desc: 'главный сигнал сегодняшнего дня' }],
  },
  single: {
    id: 'single', name: 'одна карта', aliases: ['одна', 'one', 'ask1'],
    cmd: 'taro ask1', count: 1, layout: 'column1',
    needsQuestion: true, flipOrder: ['p1'],
    positions: [{ key: 'p1', name: 'суть ответа', desc: 'прямой ответ на вопрос' }],
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
  },
  three: {
    id: 'three', name: 'три карты', aliases: ['три', 'ask', 'спроси'],
    cmd: 'taro ask', count: 3, layout: 'pyramid',
    needsQuestion: false, flipOrder: ['p1', 'p2', 'p3'],
    positions: [
      { key: 'p1', name: 'позиция 1', desc: 'вычисляется бэкендом по вопросу' },
      { key: 'p2', name: 'позиция 2', desc: 'вычисляется бэкендом по вопросу' },
      { key: 'p3', name: 'позиция 3', desc: 'вычисляется бэкендом по вопросу' },
    ],
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
  },
  shadow: {
    id: 'shadow', name: 'тень', aliases: ['тень-расклад', 'shadow-work', 'shadow'],
    cmd: 'taro shadow', count: 6, layout: 'spine',
    needsQuestion: false, flipOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    positions: [
      { key: 'p1', name: 'что я скрываю', desc: 'что во мне прячется за этой темой' },
      { key: 'p2', name: 'почему я это скрываю', desc: 'где и когда прятать стало безопаснее' },
      { key: 'p3', name: 'что скрывание защищает', desc: 'какую выгоду оно все еще дает' },
      { key: 'p4', name: 'что оно стоит', desc: 'цена в энергии, честности, отношениях' },
      { key: 'p5', name: 'путь интеграции', desc: 'какое внутреннее разрешение вернет это к свету' },
      { key: 'p6', name: 'следующий шаг', desc: 'одно маленькое конкретное действие на ближайшую неделю' },
    ],
  },
  pentagram: {
    id: 'pentagram', name: 'пентаграмма', aliases: ['пента', 'пентаграмма', 'pent'],
    cmd: 'taro pentagram', count: 6, layout: 'pentagram',
    needsQuestion: true,
    flipOrder: ['earth', 'air', 'water', 'fire', 'spirit', 'center'],
    positions: [
      { key: 'center', name: 'сигнификатор', desc: 'суть ситуации; кто ты в ней. вскрывается последней' },
      { key: 'spirit', name: 'дух', desc: 'квинтэссенция; сквозная линия, объединяющая все. не предсказание' },
      { key: 'fire', name: 'огонь', desc: 'воля, импульс, что рвется вперед' },
      { key: 'water', name: 'вода', desc: 'чувства, интуиция, невысказанное' },
      { key: 'earth', name: 'земля', desc: 'тело, деньги, дом, опора' },
      { key: 'air', name: 'воздух', desc: 'мысль, слово, ясность; истории, которые мы себе рассказываем' },
    ],
  },
  horseshoe: {
    id: 'horseshoe', name: 'подкова', aliases: ['подкова', 'shoe', 'horseshoe'],
    cmd: 'taro horseshoe', count: 7, layout: 'arc',
    needsQuestion: true, flipOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
    positions: [
      { key: 'p1', name: 'ситуация', desc: 'что происходит сейчас, на чем стоишь' },
      { key: 'p2', name: 'скрытое', desc: 'чего не видно изнутри ситуации' },
      { key: 'p3', name: 'препятствие', desc: 'что встает на пути' },
      { key: 'p4', name: 'внешнее', desc: 'люди и обстоятельства со стороны' },
      { key: 'p5', name: 'твоя позиция', desc: 'твой ресурс и твоя роль в этом' },
      { key: 'p6', name: 'чужая позиция', desc: 'другая сторона: что у них на уме' },
      { key: 'p7', name: 'исход', desc: 'куда ведет текущая линия, если ничего не менять' },
    ],
  },
};

export function getFrontSpread(id: string): FrontSpread | undefined {
  return SPREADS[id];
}
