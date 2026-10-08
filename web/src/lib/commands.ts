// ─────────────────────────────────────────────────────────────
// commands.ts — парсер команд ARCANUM shell.
// Терминал понимает префикс `taro` и без него, кириллицу тоже.
// ─────────────────────────────────────────────────────────────
import { SPREADS } from '@/lib/spreads';
import { GUIDES } from '@/lib/guides';

export type Cmd =
  | { kind: 'daily' }
  | { kind: 'ask'; question: string | null; cards: 1 | 3 }
  | { kind: 'spread'; id: string; question: string | null }
  | { kind: 'catalog' }
  | { kind: 'guides' }
  | { kind: 'library' }
  | { kind: 'stats' }
  | { kind: 'arcana'; dateArg: string | null; fresh: boolean }
  | { kind: 'moon' }
  | { kind: 'week' }
  | { kind: 'month' }
  | { kind: 'theme'; arg: string | null }
  | { kind: 'card'; query: string }
  | { kind: 'guide-set'; id: string }
  | { kind: 'history' }
  | { kind: 'help' }
  | { kind: 'clear' }
  | { kind: 'sound' }
  | { kind: 'whoami' }
  | { kind: 'uname' }
  | { kind: 'date' }
  | { kind: 'pwd' }
  | { kind: 'ls' }
  | { kind: 'sudo'; rest: string }
  | { kind: 'cat'; target: string }
  | { kind: 'exit' }
  | { kind: 'comment' }
  | { kind: 'unknown'; cmd: string };

export function shellUser(characterId: string): string {
  if (characterId === 'ruin_keeper') return 'keeper@arcanum';
  if (characterId === 'spark_of_chaos') return 'spark@arcanum';
  return 'shadow@arcanum';
}

const GUIDE_ALIASES: Record<string, string> = {
  'теней': 'shadow_walker', 'странница': 'shadow_walker', '1': 'shadow_walker',
  'shadow_walker': 'shadow_walker', 'walker': 'shadow_walker',
  'руины': 'ruin_keeper', 'руин': 'ruin_keeper', 'ruin': 'ruin_keeper',
  'хранитель': 'ruin_keeper', '2': 'ruin_keeper', 'ruin_keeper': 'ruin_keeper',
  'хаос': 'spark_of_chaos', 'искра': 'spark_of_chaos', 'chaos': 'spark_of_chaos',
  'spark': 'spark_of_chaos', 'спарк': 'spark_of_chaos', '3': 'spark_of_chaos',
  'spark_of_chaos': 'spark_of_chaos',
};

// алиасы раскладов каталога → id (сам id — тоже алиас: «taro pentagram»
// обязан работать — по нему кликает каталог)
const SPREAD_ALIASES: Record<string, string> = {};
for (const s of Object.values(SPREADS)) {
  if (s.id === 'daily' || s.id === 'single' || s.id === 'three') continue;
  SPREAD_ALIASES[s.id] = s.id;
  for (const a of s.aliases) SPREAD_ALIASES[a] = s.id;
}
// «тень» без текста — расклад тени; проводники переключаются по другим словам
SPREAD_ALIASES['тень'] = 'shadow';

function extractQuestion(rest: string): { question: string | null; cards: 1 | 3 } {
  let cards: 1 | 3 = 3;
  let s = rest.trim();
  if (/(^|\s)--cards\s*1(\s|$)/.test(s) || /(^|\s)-1(\s|$)/.test(s)) cards = 1;
  s = s.replace(/(^|\s)--cards\s*[13](\s|$)/g, ' ').replace(/(^|\s)-[13](\s|$)/g, ' ');
  const m = s.match(/^"([\s\S]*)"$/) || s.match(/^«([\s\S]*)»$/);
  if (m) s = m[1];
  s = s.trim();
  return { question: s.length ? s : null, cards };
}

// личный аркан: тело команды — дата (дд.мм.гггг), флаг --new/заново
// или пусто (спросить дату / взять из памяти терминала)
function parseArcanaCmd(rest: string): Cmd {
  let fresh = false;
  let dateArg: string | null = null;
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    const t = tok.toLowerCase();
    if (t === '--new' || t === 'заново') fresh = true;
    else if (dateArg == null) dateArg = tok;
  }
  return { kind: 'arcana', dateArg, fresh };
}

export function parseCommand(rawInput: string): Cmd | null {
  const input = rawInput.trim();
  if (!input) return null;
  if (input.startsWith('#') || input.startsWith('//')) return { kind: 'comment' };

  const sp = input.indexOf(' ');
  const head = (sp === -1 ? input : input.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : input.slice(sp + 1).trim();

  let body = input;
  if (head === 'taro' || head === 'taro.exe' || head === './сеанс' || head === 'сеанс' || head === 'man') {
    body = rest;
  }

  const bsp = body.indexOf(' ');
  const bhead = (bsp === -1 ? body : body.slice(0, bsp)).toLowerCase();
  const brest = bsp === -1 ? '' : body.slice(bsp + 1).trim();

  switch (bhead) {
    case '': {
      if (head === 'taro' || head === './сеанс' || head === 'сеанс' || head === 'man') {
        // «man taro» и «taro» без команды → help
        if (head === 'man' && brest) {
          return parseCommand(brest) ?? { kind: 'help' };
        }
        return { kind: 'help' };
      }
      return { kind: 'unknown', cmd: input };
    }
    case 'help': case 'справка': case '?':
      return { kind: 'help' };
    // двухсловный алиас: «личный аркан [дата]»
    case 'личный': {
      if (brest === 'аркан' || brest.startsWith('аркан ')) {
        return parseArcanaCmd(brest.slice('аркан'.length).trim());
      }
      return { kind: 'unknown', cmd: input };
    }
    case 'daily': case 'день': case 'дневная': case 'карта-дня':
      return { kind: 'daily' };
    case 'ask': case 'спроси': case 'вопрос': {
      const { question, cards } = extractQuestion(brest);
      if (question == null) return { kind: 'ask', question: null, cards };
      return { kind: 'spread', id: cards === 1 ? 'single' : 'three', question };
    }
    case 'ask1': case 'одна': case 'одну': {
      const { question } = extractQuestion(brest);
      return { kind: 'spread', id: 'single', question };
    }
    case 'catalog': case 'каталог': case 'расклады': case 'меню':
      return { kind: 'catalog' };
    case 'guides': case 'проводники': case 'гайды': case 'проводник': {
      if (brest && GUIDE_ALIASES[brest.toLowerCase()]) {
        return { kind: 'guide-set', id: GUIDE_ALIASES[brest.toLowerCase()] };
      }
      return { kind: 'guides' };
    }
    // библиотека арканов: вся колода под взглядом
    case 'library': case 'библиотека': case 'колода':
    case 'cards': case 'карты': case 'deck':
      return { kind: 'library' };
    // статистика оператора: серия, чтения, расклады, голоса
    case 'stats': case 'статистика': case 'стата':
      return { kind: 'stats' };
    // личный аркан: нумерологическое ядро даты рождения
    case 'arcana': case 'аркан': case 'birth':
      return parseArcanaCmd(brest);
    // фаза луны: синодический цикл под взглядом
    case 'moon': case 'луна': case 'луна-фаза':
      return { kind: 'moon' };
    // дайджест недели: сводка чтений за 7 дней
    case 'week': case 'неделя': case 'дайджест': case 'итоги':
      return { kind: 'week' };
    // дайджест месяца: календарный месяц целиком («месяц» —
    // интуитивнее здесь, луна осталась на «taro moon/луна»)
    case 'month': case 'месяц': case 'месячный': case 'итоги-месяца':
      return { kind: 'month' };
    // покрытие фосфора: тема терминала (без аргумента — список)
    case 'theme': case 'тема': case 'скин': case 'покрытие': case 'фосфор':
      return { kind: 'theme', arg: brest || null };
    // хроника карты: вся история выпадений аркана
    case 'card': case 'карта': case 'хроника':
      return { kind: 'card', query: brest };
    case 'history': case 'журнал': case 'сеансы':
      return { kind: 'history' };
    case 'clear': case 'очистить': case 'cls':
      return { kind: 'clear' };
    case 'sound': case 'звук':
      return { kind: 'sound' };
    case 'whoami':
      return { kind: 'whoami' };
    case 'uname':
      return { kind: 'uname' };
    case 'date':
      return { kind: 'date' };
    case 'pwd':
      return { kind: 'pwd' };
    case 'ls':
      return { kind: 'ls' };
    case 'sudo':
      return { kind: 'sudo', rest: brest };
    case 'cat':
      return { kind: 'cat', target: brest };
    case 'exit': case 'logout':
      return { kind: 'exit' };
    default: {
      // «man taro» и прочие «man <команда>» — разбираем команду за man
      // (справка о справке: любое man-обращение ведёт в help)
      if (head === 'man' && body) {
        return parseCommand(body) ?? { kind: 'help' };
      }
      // прямой выбор проводника: «тень» как слово проводника не берём — это расклад
      if (GUIDE_ALIASES[bhead] && bhead !== 'тень') {
        return { kind: 'guide-set', id: GUIDE_ALIASES[bhead] };
      }
      const alias = SPREAD_ALIASES[bhead];
      if (alias) {
        const spread = SPREADS[alias];
        const needsQ = spread.needsQuestion;
        const { question } = extractQuestion(brest);
        if (needsQ && question == null) {
          return { kind: 'spread', id: alias, question: null };
        }
        return { kind: 'spread', id: alias, question };
      }
      // хвостовой вопрос: «taro mfd он меня любит» — уже покрыто alias
      return { kind: 'unknown', cmd: input };
    }
  }
}

/** подсказки автокомплита для командной строки */
export const COMMAND_HINTS: string[] = [
  'taro daily', 'taro ask', 'taro ask1', 'taro yesno', 'taro mfd',
  'taro shadow', 'taro pentagram', 'taro horseshoe',
  'taro catalog', 'taro guides', 'taro library', 'taro history', 'taro stats',
  'taro arcana',
  'taro moon',
  'taro week',
  'taro month',
  'taro theme',
  'taro card',
  'taro sound',
  'clear',
];

/** все id проводников для быстрых подсказок */
export function guideHint(id: string): string | undefined {
  return GUIDES[id] ? `taro guides` : undefined;
}
