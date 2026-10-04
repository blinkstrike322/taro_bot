'use client';

// TuiMenu — ncurses-стиль выбора: каталог раскладов и проводники.
// Выбор пункта = выполнение команды (эхо + запуск), как в жизни.
import { GUIDES } from '@/lib/guides';
import { SPREADS, type FrontSpread } from '@/lib/spreads';

interface TuiMenuProps {
  menuId: 'catalog' | 'guides';
  activeGuideId: string;
  onRunCmd: (cmd: string) => void;
  onGuideSelect: (id: string) => void;
}

interface Row {
  key: string;
  marker: string;
  label: string;
  desc: string;
  right: string;
  cmd?: string;      // команда для эха при выборе
  guideId?: string;  // если строка = проводник
  active?: boolean;
}

// порядок строк каталога — как в data/spreads.json (Task 9)
const CATALOG_ORDER = [
  'daily', 'single', 'yesno', 'three', 'mfd', 'shadow', 'pentagram', 'horseshoe',
];

/** русский плюрал: 1 аркан / 2-4 аркана / 5+ арканов */
function arcansLabel(count: number): string {
  const m10 = count % 10;
  const m100 = count % 100;
  if (m10 === 1 && m100 !== 11) return `${count} аркан`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${count} аркана`;
  return `${count} арканов`;
}

function catalogRows(): Row[] {
  const spreads = CATALOG_ORDER
    .map((id) => SPREADS[id])
    .filter((s): s is FrontSpread => Boolean(s));
  return spreads.map((s, i) => ({
    key: s.id,
    marker: String(i + 1),
    label: s.name,
    // у «трёх карт» позиции вычисляет бэкенд по вопросу — в меню фикс-строка
    desc: s.id === 'three'
      ? 'динамический расклад по вопросу'
      : s.positions.map((p) => p.name).join(' · '),
    right: arcansLabel(s.count),
    cmd: s.cmd,
  }));
}

function guideRows(activeGuideId: string): Row[] {
  return Object.values(GUIDES).map((g) => ({
    key: g.id,
    marker: g.id === activeGuideId ? '●' : '○',
    label: g.name,
    desc: g.description,
    right: g.tag,
    guideId: g.id,
    active: g.id === activeGuideId,
  }));
}

export default function TuiMenu({ menuId, activeGuideId, onRunCmd, onGuideSelect }: TuiMenuProps) {
  const rows = menuId === 'catalog' ? catalogRows() : guideRows(activeGuideId);
  const title = menuId === 'catalog' ? 'ВИДЫ РАСКЛАДОВ' : 'ПРОВОДНИКИ';
  const hint =
    menuId === 'catalog'
      ? '// тапни по строке, чтобы выбрать'
      : '// каждый проводник читает карты по-своему';

  const handleSelect = (row: Row) => {
    if (row.guideId) {
      if (row.guideId !== activeGuideId) onGuideSelect(row.guideId);
      return;
    }
    if (row.cmd) onRunCmd(row.cmd);
  };

  return (
    <div className="tui-menu">
      <div className="tui-head">
        <span className="tl tl-bright tl-semibold">{title}</span>
        <span className="tl tl-faint">── {rows.length} доступно ──</span>
      </div>

      <div className="menu-box">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className={`menu-row ${row.active ? 'menu-row--active' : ''}`}
            onClick={() => handleSelect(row)}
          >
            <span className={`mr-marker ${row.active ? 'mr-marker--on' : ''}`}>{row.marker}</span>
            <span className="mr-body">
              <span className="mr-label">{row.label}</span>
              <span className="mr-desc">{row.desc}</span>
            </span>
            <span className="mr-right">
              <span className="mr-chev">▸</span> {row.right}
            </span>
          </button>
        ))}
      </div>

      <div className="tl tl-comment">{hint}</div>
    </div>
  );
}
