'use client';

// ─────────────────────────────────────────────────────────────
// LibraryBlock — библиотека арканов: вся колода (78) прямо в
// транскрипте. Фильтры по мастям, живой поиск по имени и
// карточка аркана с обеими гранями — прямая и перевёрнутая.
// Никаких модалок: панель разворачивается под сеткой.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import deckJson from '@/lib/tarot-deck.json';
import { sCellTick, sFlip, sMenu, sPageTurn, sType, haptic } from '@/lib/sound';

interface DeckCard {
  id: string;
  name: string;
  arcana: string;
  suit: string | null;
  number: number;
  filename: string;
  upright: string;
  reversed: string;
}

const DECK: DeckCard[] = deckJson as DeckCard[];

/** ключи фильтров — они же значения suit в колоде */
type LibFilter = 'all' | 'major' | 'wands' | 'cups' | 'swords' | 'pentacles';

const SUIT_LABEL: Record<string, string> = {
  wands: 'жезлы',
  cups: 'кубки',
  swords: 'мечи',
  pentacles: 'пентакли',
};

/** глифы мастей — терминальные, без эмодзи */
const SUIT_GLYPH: Record<string, string> = {
  major: '✶',
  wands: '⌇',
  cups: '♥',
  swords: '✕',
  pentacles: '◈',
};

const FILTERS: { key: LibFilter; label: string; glyph: string | null }[] = [
  { key: 'all', label: 'всё', glyph: null },
  { key: 'major', label: 'старшие', glyph: null },
  { key: 'wands', label: 'жезлы', glyph: '⌇' },
  { key: 'cups', label: 'кубки', glyph: '♥' },
  { key: 'swords', label: 'мечи', glyph: '✕' },
  { key: 'pentacles', label: 'пентакли', glyph: '◈' },
];

/** ранг младшего аркана числом: туз и двор */
function minorRank(n: number): string {
  if (n === 1) return 'туз';
  if (n === 11) return 'паж';
  if (n === 12) return 'рыцарь';
  if (n === 13) return 'королева';
  if (n === 14) return 'король';
  return String(n);
}

/** метка карточки: «старший аркан» либо «масть · ранг» */
function metaLabel(card: DeckCard): string {
  if (card.arcana === 'major') return 'старший аркан';
  const suit = card.suit ? SUIT_LABEL[card.suit] ?? card.suit : '';
  return `${suit} · ${minorRank(card.number)}`;
}

/** видимый срез колоды: фильтр × поиск (мгновенный, без дебаунса) */
function visibleFor(filter: LibFilter, query: string): DeckCard[] {
  const q = query.trim().toLowerCase();
  return DECK.filter((card) => {
    if (filter === 'major') {
      if (card.arcana !== 'major') return false;
    } else if (filter !== 'all' && card.suit !== filter) {
      return false;
    }
    if (q && !card.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export default function LibraryBlock() {
  // библиотека закрыта по умолчанию: сетка из 78 карт тяжеловесна,
  // запись в транскрипте начинается со свёрнутой шапки
  const [libOpen, setLibOpen] = useState(false);
  const [filter, setFilter] = useState<LibFilter>('all');
  const [query, setQuery] = useState('');
  // открытая карта и карта, которая ещё рендерится в панели
  // (вторая живёт на время анимации сворачивания)
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);

  /* поколение видов: номер растёт при каждой смене фильтра/поиска.
     Ячейка играет каскад входа только в поколении, в котором
     родилась (впервые попала в список). Выжившие при смене вида
     не переигрывают анимацию — оживают только новые. */
  const [gen, setGen] = useState(0);
  const [born, setBorn] = useState<Record<string, number>>(() =>
    Object.fromEntries(DECK.map((c) => [c.id, 0])),
  );

  const counts = useMemo(() => {
    const c: Record<LibFilter, number> = {
      all: DECK.length, major: 0, wands: 0, cups: 0, swords: 0, pentacles: 0,
    };
    for (const card of DECK) {
      if (card.arcana === 'major') c.major += 1;
      else if (card.suit && card.suit in c) c[card.suit as LibFilter] += 1;
    }
    return c;
  }, []);

  const visible = useMemo(() => visibleFor(filter, query), [filter, query]);

  const shownCard = useMemo(
    () => (shownId ? DECK.find((c) => c.id === shownId) ?? null : null),
    [shownId],
  );

  /** сменить вид и пометить ячейки, что родились в нём */
  const shiftView = (nextFilter: LibFilter, nextQuery: string) => {
    const oldIds = new Set(visibleFor(filter, query).map((c) => c.id));
    const nextGen = gen + 1;
    const fresh = visibleFor(nextFilter, nextQuery).filter((c) => !oldIds.has(c.id));
    if (fresh.length > 0) {
      const patch: Record<string, number> = {};
      for (const c of fresh) patch[c.id] = nextGen;
      setBorn((prev) => ({ ...prev, ...patch }));
    }
    setGen(nextGen);
    setFilter(nextFilter);
    setQuery(nextQuery);
  };

  const selectFilter = (key: LibFilter) => {
    if (filter === key) return;
    shiftView(key, query);
    sPageTurn();
    haptic('tick');
  };

  const closeCard = () => {
    setOpenId(null);
    sMenu();
    haptic('tick');
    // даём панели схлопнуться, потом убираем содержимое
    setTimeout(() => setShownId(null), 240);
  };

  const openLib = () => {
    setLibOpen(true);
    sMenu();
    haptic('tick');
  };

  const closeLib = () => {
    setLibOpen(false);
    sMenu();
    haptic('tick');
  };

  const openCard = (card: DeckCard) => {
    // тап по открытой карте — свернуть
    if (openId === card.id) {
      closeCard();
      return;
    }
    setOpenId(card.id);
    setShownId(card.id);
    sFlip();
    haptic('tick');
  };

  // открытая карточка — в поле зрения: ждём разворота панели
  // (0fr → 1fr, 220ms) и только потом скроллим — иначе «nearest»
  // не видит её высоту и оставляет за срезом экрана
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shownId) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(
      () => {
        detailRef.current?.scrollIntoView({
          block: 'nearest',
          behavior: reduced ? 'auto' : 'smooth',
        });
      },
      reduced ? 0 : 230,
    );
    return () => clearTimeout(t);
  }, [shownId]);

  // ── звуковой слой ──

  // шелест прокрутки: сетка сама не скроллит — листает транскрипт;
  // находим скроллящего предка и на каждые ≥120px накопленной
  // прокрутки (не чаще 900мс, только пока библиотека в кадре)
  // играем очень тихий page-turn без щелчка
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = rootRef.current;
    if (!wrap) return;
    let scroller: HTMLElement | null = null;
    let p: HTMLElement | null = wrap.parentElement;
    while (p) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        scroller = p;
        break;
      }
      p = p.parentElement;
    }
    if (!scroller) return;
    const sc = scroller;
    let lastAt = 0;
    let acc = 0;
    let lastTop = sc.scrollTop;
    const onScroll = () => {
      const now = performance.now();
      acc += Math.abs(sc.scrollTop - lastTop);
      lastTop = sc.scrollTop;
      if (now - lastAt < 900 || acc < 120) return;
      // не в кадре — не шелестим (и копим заново)
      const sr = sc.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      if (wr.bottom <= sr.top || wr.top >= sr.bottom) {
        acc = 0;
        return;
      }
      lastAt = now;
      acc = 0;
      sPageTurn(true);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, []);

  // ховер ячейки — тик «перебирания страниц»: только новый элемент
  // (не тот же), только мышь (тач-тап сразу играет sFlip, без тика)
  const hoveredIdRef = useRef<string | null>(null);
  const hoverCell = (id: string) => {
    if (hoveredIdRef.current === id) return;
    hoveredIdRef.current = id;
    sCellTick();
  };

  if (!libOpen) {
    return (
      <div className="lib-block" ref={rootRef}>
        <div className="lib-head">
          <span className="tl tl-bright tl-semibold lib-title">БИБЛИОТЕКА АРКАНОВ</span>
          <span className="tl tl-faint lib-sub">
            ── {DECK.length} арканов ──
          </span>
          <button
            type="button"
            className="lib-collapse"
            onClick={openLib}
            aria-expanded={false}
            aria-label="открыть библиотеку арканов"
          >
            открыть библиотеку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lib-block" ref={rootRef}>
      {/* шапка — в тон меню-заголовкам */}
      <div className="lib-head">
        <span className="tl tl-bright tl-semibold lib-title">БИБЛИОТЕКА АРКАНОВ</span>
        <span className="tl tl-faint lib-sub">
          ── {DECK.length} арканов · тапни карту — она расскажет о себе ──
        </span>
        <button
          type="button"
          className="lib-collapse"
          onClick={closeLib}
          aria-expanded={true}
          aria-label="скрыть библиотеку арканов"
        >
          ✕ скрыть библиотеку
        </button>
      </div>

      {/* фильтры по мастям */}
      <div className="lib-tabs" role="tablist" aria-label="фильтр колоды">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`lib-tab${filter === f.key ? ' lib-tab--active' : ''}`}
            onClick={() => selectFilter(f.key)}
          >
            {f.glyph && <span className="lib-tab-glyph" aria-hidden="true">{f.glyph}</span>}
            {f.label} · {counts[f.key]}
          </button>
        ))}
      </div>

      {/* поиск по имени */}
      <div className="lib-search">
        <span className="lib-search-glyph" aria-hidden="true">⌕</span>
        <input
          className="lib-search-input"
          type="text"
          value={query}
          onChange={(e) => {
            shiftView(filter, e.target.value);
            sType();
          }}
          placeholder="искать аркан…"
          aria-label="поиск аркана"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="lib-search-clear"
            onClick={() => {
              shiftView(filter, '');
              sMenu();
              haptic('tick');
            }}
            aria-label="очистить поиск"
          >
            ✕
          </button>
        )}
      </div>

      {/* сетка арканов */}
      {visible.length > 0 ? (
        <div className="lib-grid">
          {(() => {
            let freshIdx = -1; // счётчик новорождённых — база задержки каскада
            return visible.map((card) => {
              const fresh = born[card.id] === gen;
              if (fresh) freshIdx += 1;
              const delay = Math.min(freshIdx * 18, 600);
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`lib-cell${openId === card.id ? ' lib-cell--open' : ''}${fresh ? ' lib-cell--in' : ''}`}
                  style={fresh ? { animationDelay: `${delay}ms` } : undefined}
                  onClick={() => openCard(card)}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'mouse') return;
                    hoverCell(card.id);
                  }}
                  aria-label={`аркан ${card.name}`}
                  aria-expanded={openId === card.id}
                >
                  <span className="lib-cell-art">
                    <img src={`/cards/${card.filename}`} alt="" loading="lazy" />
                  </span>
                  <span className="lib-cell-name">{card.name}</span>
                  <span className="lib-cell-glyph" aria-hidden="true">
                    {SUIT_GLYPH[card.arcana === 'major' ? 'major' : card.suit ?? ''] ?? '◈'}
                  </span>
                </button>
              );
            });
          })()}
        </div>
      ) : (
        <div className="lib-empty tl tl-faint">ничего не нашлось · попробуй другое имя</div>
      )}

      {/* карточка аркана — разворот под сеткой */}
      <div
        ref={detailRef}
        className={`lib-detail-wrap${openId ? ' lib-detail-wrap--open' : ''}`}
      >
        <div className="lib-detail-inner">
          {shownCard && (
            <div className="lib-detail frame-ritual" key={shownCard.id}>
              <span className="corner corner-tl">╔</span>
              <span className="corner corner-tr">┐</span>
              <span className="corner corner-bl">└</span>
              <span className="corner corner-br">╝</span>

              <div className="lib-detail-body">
                <div className="lib-detail-art">
                  <img src={`/cards/${shownCard.filename}`} alt={shownCard.name} />
                </div>
                <div className="lib-detail-info">
                  <div className="lib-detail-name tl tl-bright">{shownCard.name}</div>
                  <div className="lib-detail-meta tl tl-faint">{metaLabel(shownCard)}</div>

                  <div className="lib-meaning">
                    <div className="lib-meaning-label tl tl-comment">{'// прямая'}</div>
                    <div className="tl tl-plain">{shownCard.upright}</div>
                  </div>
                  <div className="lib-meaning">
                    <div className="lib-meaning-label tl tl-comment">{'// перевёрнутая'}</div>
                    <div className="tl tl-dim">{shownCard.reversed}</div>
                  </div>

                  <button type="button" className="lib-collapse" onClick={closeCard}>
                    ✕ свернуть
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="lib-hint tl tl-comment">
        {`// показано ${visible.length} из ${DECK.length} · поиск ищет по имени`}
      </div>
    </div>
  );
}
