// ─────────────────────────────────────────────────────────────
// DEV-ONLY mock API — lets the webapp run without the backend.
// Activated exclusively in `next dev` (never in prod export).
// Remove this file + its import in _app.tsx if not needed.
// ─────────────────────────────────────────────────────────────

const DECK = [
  'the-fool', 'the-magician', 'the-high-priestess', 'the-empress',
  'the-emperor', 'the-hierophant', 'the-lovers', 'the-chariot',
  'strength', 'the-hermit', 'wheel-of-fortune', 'justice',
  'the-hanged-man', 'death', 'temperance', 'the-devil',
  'the-tower', 'the-star', 'the-moon', 'the-sun',
  'judgement', 'the-world',
];

const NAMES: Record<string, string> = {
  'the-fool': 'Дурак', 'the-magician': 'Маг', 'the-high-priestess': 'Жрица',
  'the-empress': 'Императрица', 'the-emperor': 'Император',
  'the-hierophant': 'Иерофант', 'the-lovers': 'Влюблённые',
  'the-chariot': 'Колесница', 'strength': 'Сила', 'the-hermit': 'Отшельник',
  'wheel-of-fortune': 'Колесо Фортуны', 'justice': 'Справедливость',
  'the-hanged-man': 'Повешенный', 'death': 'Смерть', 'temperance': 'Умеренность',
  'the-devil': 'Дьявол', 'the-tower': 'Башня', 'the-star': 'Звезда',
  'the-moon': 'Луна', 'the-sun': 'Солнце', 'judgement': 'Суд', 'the-world': 'Мир',
};

function pick(seed: number, n: number) {
  const out: string[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(DECK[Math.floor(s / 233280 * DECK.length) % DECK.length]);
  }
  return out;
}

const INTROS = [
  'Карты легли странно. Тени вокруг них длиннее обычного — это значит, что ответ уже живёт в тебе.',
  'Свеча трещит, когда вопрос честный. Сейчас она трещит. Слушай.',
];

const ANSWERS = [
  'То, что ты считаешь концом, — лишь порог. Карты настаивают: переступи его, не оборачиваясь.',
  'Да, но не сразу. Сначала тебе придётся отпустить то, что ты давно носишь с собой.',
];

const ADVICES = [
  'Не ищи знак — стань им. Три дня молчи о планах, и путь проявится сам.',
  'Сделай маленький шаг сегодня. Хаос любит смелых, но платит по счетам аккуратно.',
];

export function installMockApi() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__mockApiInstalled) return;
  w.__mockApiInstalled = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';

    if (url.includes('/api/spread')) {
      const body = JSON.parse(init?.body || '{}');
      const n = body.spread_type === 3 ? 3 : 1;
      const ids = pick(Date.now() % 100000, n);
      const positions = n === 3 ? ['прошлое', 'настоящее', 'будущее'] : ['послание'];
      const meanings = ids.map((id, i) =>
        `${NAMES[id]}${i === 1 ? ' перевёрнута' : ''} — «${positions[i] || 'послание'}»: ${['то, что ушло, всё ещё держит тебя за рукав.', 'ты стоишь на перекрёстке, и это честнее, чем кажется.', 'будущее просит не скорости, а направления.'][i] || 'тише — и увидишь.'}`,
      );
      return new Response(JSON.stringify({
        cards: ids.map((id) => ({
          id,
          name: NAMES[id],
          is_reversed: Math.random() > 0.7,
          orientation: 'upright',
        })),
        interpretation: {
          intro: INTROS[Date.now() % INTROS.length],
          short_answer: ANSWERS[Date.now() % ANSWERS.length],
          card_meaning: meanings,
          advice: ADVICES[Date.now() % ADVICES.length],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/api/character')) {
      return new Response(JSON.stringify({ character_id: 'shadow_walker' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/api/readings')) {
      return new Response(JSON.stringify({
        readings: Array.from({ length: 6 }, (_, i) => ({
          id: i + 1,
          type: ['daily', '1', '3'][i % 3],
          question: i % 2 ? 'стоит ли менять работу?' : null,
          created_at: `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00`,
          cards_data: [],
          interpretation: {},
          character_id: 'shadow_walker',
        })),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return origFetch(input as any, init);
  };

  // eslint-disable-next-line no-console
  console.log('[dev] mock API installed');
}
