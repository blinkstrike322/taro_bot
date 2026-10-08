'use client';

// ─────────────────────────────────────────────────────────────
// TuiMenu — ncurses-стиль: каталог раскладов и проводники.
// Строка = команда. Выбор — как ввод в терминале.
// «Недавний» — последний выбранный расклад из памяти терминала.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Sparkle } from 'lucide-react';
import { getGuide, GUIDES } from '@/lib/guides';
import { SPREADS, type FrontSpread } from '@/lib/spreads';
import { readLastSpread } from '@/hooks/useSpread';
import { sMenu, sGuide, haptic } from '@/lib/sound';

interface TuiMenuProps {
  menuId: 'catalog' | 'guides';
  activeGuideId: string;
  onRunCmd: (cmd: string) => void;
  onGuideSelect: (id: string) => void;
  /** лорометр: сколько чтений состоялось голосом каждого проводника */
  guideReadings?: Record<string, number>;
}

const CATALOG_ORDER = [
  'daily', 'single', 'yesno', 'three', 'mfd', 'shadow', 'pentagram', 'horseshoe',
];

function arcansLabel(count: number): string {
  const m10 = count % 10;
  const m100 = count % 100;
  if (m10 === 1 && m100 !== 11) return `${count} аркан`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${count} аркана`;
  return `${count} арканов`;
}

/* ── лорометр проводника ── */

/** сегментов в полосе лорометра */
const LORE_SEGMENTS = 5;

/** сколько сегментов залить: доля голоса среди всех чтений, минимум один */
function loreFilled(count: number, total: number): number {
  if (count <= 0 || total <= 0) return 0;
  return Math.max(1, Math.round((LORE_SEGMENTS * count) / total));
}

/** склонение: 1 чтение · 2 чтения · 5 чтений */
function readingsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'чтение';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'чтения';
  return 'чтений';
}

const LAYOUT_GLYPH: Record<string, string> = {
  column1: '▮', trio: '▮▮▮', pyramid: '▲', spine: '⌇', pentagram: '✪', arc: '◠',
};

export default function TuiMenu({
  menuId,
  activeGuideId,
  onRunCmd,
  onGuideSelect,
  guideReadings,
}: TuiMenuProps) {
  const isCatalog = menuId === 'catalog';

  // недавний расклад: читаем после первого кадра — SSR-рендер
  // совпадает, setState уезжает в rAF-колбэк (не в тело эффекта)
  const [recentId, setRecentId] = useState<string | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (isCatalog) setRecentId(readLastSpread());
    });
    return () => cancelAnimationFrame(raf);
  }, [isCatalog]);

  // суммарный счёт чтений по проводникам — база для доли лорометра
  let loreTotal = 0;
  if (!isCatalog) {
    for (const id of Object.keys(GUIDES)) loreTotal += guideReadings?.[id] ?? 0;
  }

  const handleSelect = (spread: FrontSpread) => {
    sMenu();
    haptic('tick');
    onRunCmd(spread.cmd);
  };

  const handleGuide = (id: string) => {
    if (id !== activeGuideId) {
      sGuide(id);
      haptic('tap');
      onGuideSelect(id);
    }
  };

  return (
    <div className="tui-menu">
      <div className="tui-head">
        <span className="tl tl-bright tl-semibold">
          {isCatalog ? 'ВИДЫ РАСКЛАДОВ' : 'ПРОВОДНИКИ'}
        </span>
        <span className="tl tl-faint">── {isCatalog ? '8' : '3'} доступно ──</span>
      </div>

      {isCatalog ? (
        <div className="menu-box">
          {CATALOG_ORDER.map((id) => {
            const s = SPREADS[id];
            if (!s) return null;
            const recent = recentId === id;
            return (
              <button
                key={id}
                type="button"
                className={`menu-row menu-row--spread${recent ? ' menu-row--recent' : ''}`}
                onClick={() => handleSelect(s)}
              >
                <span className="mr-glyph">{LAYOUT_GLYPH[s.layout] ?? '▮'}</span>
                <span className="mr-body">
                  <span className="mr-label">
                    {s.name}
                    {recent && (
                      <span className="mr-recent" title="твой последний расклад">
                        <Sparkle size={9} strokeWidth={2} aria-hidden="true" />
                        недавний
                      </span>
                    )}
                  </span>
                  <span className="mr-desc">{s.about}</span>
                </span>
                <span className="mr-right">
                  <span className="mr-count">{arcansLabel(s.count)}</span>
                  <span className="mr-chev">▸</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="menu-box menu-box--guides">
          {Object.values(GUIDES).map((g) => {
            const active = g.id === activeGuideId;
            const loreCount = guideReadings?.[g.id] ?? 0;
            const filled = loreFilled(loreCount, loreTotal);
            return (
              <button
                key={g.id}
                type="button"
                className={`menu-row menu-row--guide${active ? ' menu-row--active' : ''}`}
                onClick={() => handleGuide(g.id)}
              >
                <span className="mr-portrait">
                  { }
                  <img
                    src={g.portrait}
                    alt={g.name}
                    className={`mr-portrait-img${active ? ' mr-portrait-img--active' : ''}`}
                  />
                </span>
                <span className="mr-body">
                  <span className="mr-label">
                    <span className={`mr-marker${active ? ' mr-marker--on' : ''}`}>
                      {active ? '●' : '○'}
                    </span>
                    {' '}{g.name}
                  </span>
                  <span className="mr-desc">{g.description}</span>
                </span>
                <span className="mr-right">
                  <span
                    className={`mr-lore${loreCount === 0 ? ' mr-lore--empty' : ''}`}
                    title="сколько чтений прошло голосом этого проводника"
                  >
                    <span className="mr-lore-bar" aria-hidden="true">
                      {Array.from({ length: LORE_SEGMENTS }, (_, i) => (
                        <span
                          key={i}
                          className={`mr-lore-seg${i < filled ? ' mr-lore-seg--on' : ' mr-lore-seg--off'}`}
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          {i < filled ? '▰' : '▱'}
                        </span>
                      ))}
                    </span>
                    <span className="mr-lore-count">
                      {loreCount > 0 ? `${loreCount} ${readingsWord(loreCount)}` : 'ни одного'}
                    </span>
                  </span>
                  <span className="mr-tag">{g.tag}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="tl tl-comment tui-hint">
        {isCatalog ? '// тапни по строке' : '// каждый проводник читает по-своему · ▰ — доля твоих чтений'}
      </div>
    </div>
  );
}

export { getGuide };
