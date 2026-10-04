// ─────────────────────────────────────────────────────────────
// DEV-ONLY mock API — lets the webapp run without the backend.
// Activated exclusively in `next dev` (never in prod export).
// Remove this file + its import in _app.tsx if not needed.
// ─────────────────────────────────────────────────────────────
import { SPREADS, type FrontSpread } from '@/lib/spreads';

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

// пул фраз для трактовок позиций (2-3 предложения на позицию)
const LINES = [
  'то, что ушло, все еще держит тебя за рукав.',
  'ты стоишь на перекрестке, и это честнее, чем кажется.',
  'будущее просит не скорости, а направления.',
  'карта говорит тише, чем ты привык слышать, — прислушайся.',
  'здесь решает не сила, а выбор момента.',
  'то, что кажется потерей, обернется освобождением.',
  'ситуация зреет; не срывай ее раньше срока.',
  'ответ уже у тебя в руках, осталось перестать с ним спорить.',
];

// синтез-фразы для связи_карт (по одной на чтение)
const SYNTH = [
  'карты спорят, но спор этот продуктивный: движение здесь важнее покоя.',
  'все три линии сходятся в одном: решает не обстоятельство, а твоя ставка.',
  'карты не обещают легкого пути, но показывают, где он открыт.',
];

// вердикты для yesno — short_answer начинается с одного из них
const VERDICTS = ['Да.', 'Скорее да.', 'Скорее нет.', 'Нет.'];

// расклад последнего /begin — poll должен знать имена позиций
let lastSpread: FrontSpread = SPREADS.three;

function mockPositions(spread: FrontSpread): string[] {
  if (spread.id === 'three') {
    return ['Твоя позиция и энергия', 'Динамика между вами', 'Главный вектор развития'];
  }
  // метки — в том же порядке, что и position_keys (порядок вскрытия):
  // каждый ключ разрешается в имя своей позиции каталога
  const byKey = new Map(spread.positions.map((p) => [p.key, p.name]));
  return spread.flipOrder.map((k) => byKey.get(k) ?? k);
}

function positionMeaning(seed: number, i: number): string {
  return `${LINES[(seed + i) % LINES.length]} ${LINES[(seed + i + 3) % LINES.length]}`;
}

export function installMockApi() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__mockApiInstalled) return;
  w.__mockApiInstalled = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';

    if (url.includes('/api/spread/begin')) {
      const body = JSON.parse(init?.body || '{}');
      const sid = body.spread_type;
      // id каталога — из SPREADS; легаси 3|'3' → three, остальное → daily
      const spread = SPREADS[sid] ?? (sid === 3 || sid === '3' ? SPREADS.three : SPREADS.daily);
      lastSpread = spread;
      const n = spread.count;
      const ids = pick(Date.now() % 100000, n);
      return new Response(JSON.stringify({
        cards: ids.map((id) => ({
          id,
          name: NAMES[id],
          is_reversed: Math.random() > 0.7,
          orientation: 'upright',
        })),
        token: `mock-${Math.random().toString(36).slice(2, 10)}`,
        remaining: 9,
        limit: 10,
        spread_id: spread.id,
        spread_name: spread.name,
        positions: mockPositions(spread),
        position_keys: spread.flipOrder,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/api/spread/poll')) {
      const spread = lastSpread;
      const n = spread.count;
      const seed = Date.now() % LINES.length;
      const ids = pick(Date.now() % 100000, n);
      if (n > 1) {
        const interpretation = {
          intro: INTROS[Date.now() % INTROS.length],
          short_answer: spread.id === 'yesno'
            ? `${VERDICTS[Date.now() % VERDICTS.length]} ${ANSWERS[Date.now() % ANSWERS.length]}`
            : ANSWERS[Date.now() % ANSWERS.length],
          card_meaning: ids.map((id, i) =>
            `${NAMES[id]} — ${LINES[(seed + i) % LINES.length]}`),
          позиции: ids.map((id, i) => ({
            позиция: mockPositions(spread)[i],
            карта: `${NAMES[id]}${Math.random() > 0.7 ? ' перевернута' : ''}`,
            реверс: Math.random() > 0.7,
            трактовка: positionMeaning(seed, i),
          })),
          связь_карт: SYNTH[Date.now() % SYNTH.length],
          advice: ADVICES[Date.now() % ADVICES.length],
        };
        return new Response(JSON.stringify({ ready: true, interpretation }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      const meanings = ids.map((id, i) =>
        `${NAMES[id]}${i === 1 ? ' перевёрнута' : ''} — «${['нить', 'узор', 'вектор'][i] || 'послание'}»: ${['то, что ушло, всё ещё держит тебя за рукав.', 'ты стоишь на перекрёстке, и это честнее, чем кажется.', 'будущее просит не скорости, а направления.'][i] || 'тише — и увидишь.'}`,
      );
      return new Response(JSON.stringify({
        ready: true,
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
      const catalogReading = (id: number, spreadId: string, question: string | null) => {
        const spread = SPREADS[spreadId];
        const ids = pick(id * 7 + 3, spread.count);
        const seed = id % LINES.length;
        return {
          id,
          type: `spread_${spreadId}`,
          question,
          created_at: `2026-08-${String(10 + id - 1).padStart(2, '0')}T12:00:00`,
          cards_data: {
            cards: ids.map((cid) => ({ id: cid, name: NAMES[cid], is_reversed: id % 3 === 1 })),
            spread_type: spreadId,
          },
          interpretation: {
            intro: INTROS[id % INTROS.length],
            short_answer: ANSWERS[id % ANSWERS.length],
            позиции: spread.positions.map((p, i) => ({
              позиция: p.name,
              карта: `${NAMES[ids[i]]}${id % 3 === 1 ? ' перевернута' : ''}`,
              реверс: id % 3 === 1,
              трактовка: positionMeaning(seed, i),
            })),
            связь_карт: SYNTH[id % SYNTH.length],
            advice: ADVICES[id % ADVICES.length],
          },
          character_id: 'shadow_walker',
        };
      };
      const legacyReadings = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        type: ['daily', 'spread_1', 'spread_3'][i % 3],
        question: i % 2 ? 'стоит ли менять работу?' : null,
        created_at: `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00`,
        cards_data: { cards: pick(i + 3, i % 3 === 0 ? 1 : 3).map((id) => ({ id, name: NAMES[id], is_reversed: i === 1 })) },
        interpretation: {
          intro: INTROS[i % INTROS.length],
          short_answer: ANSWERS[i % ANSWERS.length],
          card_meaning: [NAMES[pick(i + 3, 1)[0]] + ' — тихий знак дня.'],
          advice: ADVICES[i % ADVICES.length],
        },
        character_id: 'shadow_walker',
      }));
      return new Response(JSON.stringify({
        readings: [
          ...legacyReadings,
          catalogReading(7, 'pentagram', 'кто я в этой ситуации?'),
          catalogReading(8, 'shadow', 'что я скрываю от себя?'),
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return origFetch(input as any, init);
  };

  // eslint-disable-next-line no-console
  console.log('[dev] mock API installed');
}
