// ─────────────────────────────────────────────────────────────
// commands.ts — парсер команд ARCANUM shell.
// Терминал понимает префикс `taro` и без него, кириллицу тоже.
// ─────────────────────────────────────────────────────────────

export type Cmd =
  | { kind: 'daily' }
  | { kind: 'ask'; question: string | null; cards: 1 | 3 }
  | { kind: 'catalog' }
  | { kind: 'guides' }
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

const GUIDE_ALIASES: Record<string, string> = {
  'тень': 'shadow_walker', 'shadow': 'shadow_walker', 'теней': 'shadow_walker',
  'странница': 'shadow_walker', '1': 'shadow_walker',
  'руины': 'ruin_keeper', 'руин': 'ruin_keeper', 'ruin': 'ruin_keeper',
  'хранитель': 'ruin_keeper', '2': 'ruin_keeper',
  'хаос': 'spark_of_chaos', 'искра': 'spark_of_chaos', 'chaos': 'spark_of_chaos',
  'spark': 'spark_of_chaos', 'спарк': 'spark_of_chaos', '3': 'spark_of_chaos',
};

function extractQuestion(rest: string): { question: string | null; cards: 1 | 3 } {
  let cards: 1 | 3 = 3;
  let s = rest.trim();
  if (/(^|\s)--cards\s*1(\s|$)/.test(s) || /(^|\s)-1(\s|$)/.test(s)) cards = 1;
  s = s.replace(/(^|\s)--cards\s*[13](\s|$)/g, ' ').replace(/(^|\s)-[13](\s|$)/g, ' ');
  // strip surrounding quotes if the whole remainder is quoted
  const m = s.match(/^"([\s\S]*)"$/) || s.match(/^«([\s\S]*)»$/);
  if (m) s = m[1];
  s = s.trim();
  return { question: s.length ? s : null, cards };
}

export function parseCommand(rawInput: string): Cmd | null {
  const input = rawInput.trim();
  if (!input) return null;
  if (input.startsWith('#') || input.startsWith('//')) return { kind: 'comment' };

  // tokenize: first word + rest
  const sp = input.indexOf(' ');
  const head = (sp === -1 ? input : input.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : input.slice(sp + 1).trim();

  // optional `taro` / `./сеанс` prefix
  let body = input;
  if (head === 'taro' || head === 'taro.exe' || head === './сеанс' || head === 'сеанс') {
    body = rest;
  }
  const bsp = body.indexOf(' ');
  const bhead = (bsp === -1 ? body : body.slice(0, bsp)).toLowerCase();
  const brest = bsp === -1 ? '' : body.slice(bsp + 1).trim();

  switch (bhead) {
    case 'daily':
    case 'день':
    case 'дневная':
    case '-d':
    case '--daily':
    case 'карта':
    case 'карту':
      return { kind: 'daily' };

    case 'ask':
    case 'ask1':
    case 'спроси':
    case 'спросить':
    case 'вопрос': {
      const r = extractQuestion(brest);
      if (bhead === 'ask1') r.cards = 1;
      return { kind: 'ask', question: r.question, cards: r.cards };
    }

    case 'catalog':
    case 'каталог':
    case 'расклады':
    case 'расклад':
      return { kind: 'catalog' };

    case 'guides':
    case 'guide':
    case 'проводник':
    case 'проводники':
    case 'проводника': {
      const key = brest.toLowerCase().trim();
      if (key && GUIDE_ALIASES[key]) return { kind: 'guide-set', id: GUIDE_ALIASES[key] };
      return { kind: 'guides' };
    }

    case 'history':
    case 'история':
    case 'журнал':
    case 'log':
    case 'лог':
      return { kind: 'history' };

    case 'sound':
    case 'звук':
    case 'аудио':
      return { kind: 'sound' };

    case '': // bare `taro`
      return { kind: 'unknown', cmd: 'taro' };
  }

  // bare shell commands (also reachable without taro prefix)
  switch (head) {
    case 'help': case 'помощь': case 'ман': case 'man': case '?': return { kind: 'help' };
    case 'clear': case 'очистить': case 'cls': return { kind: 'clear' };
    case 'whoami': case 'ктоя': return { kind: 'whoami' };
    case 'uname': return { kind: 'uname' };
    case 'date': case 'дата': return { kind: 'date' };
    case 'pwd': case 'гдея': return { kind: 'pwd' };
    case 'ls': case 'dir': case 'лс': return { kind: 'ls' };
    case 'sudo': return { kind: 'sudo', rest: input.slice(5).trim() };
    case 'cat': case 'кот': return { kind: 'cat', target: rest.toLowerCase() };
    case 'exit': case 'logout': case 'выход': return { kind: 'exit' };
  }

  // `taro guide <имя>` handled above; guide alias as bare command
  if (GUIDE_ALIASES[head]) return { kind: 'guide-set', id: GUIDE_ALIASES[head] };

  return { kind: 'unknown', cmd: head };
}

// ── shell user per guide ──
export function shellUser(characterId: string): string {
  switch (characterId) {
    case 'ruin_keeper': return 'ruin@taro';
    case 'spark_of_chaos': return 'chaos@taro';
    default: return 'shadow@taro';
  }
}
