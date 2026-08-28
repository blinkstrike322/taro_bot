'use client';

// TuiMenu — ncurses-стиль выбора: каталог раскладов и проводники.
// Выбор пункта = выполнение команды (эхо + запуск), как в жизни.
import { GUIDES } from '@/lib/guides';

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

function catalogRows(): Row[] {
  return [
    { key: 'daily', marker: '1', label: 'карта дня', desc: 'без вопроса', right: '1 аркан', cmd: 'taro daily' },
    { key: 'one', marker: '2', label: 'одна карта', desc: 'с вопросом', right: '1 аркан', cmd: 'taro ask1' },
    { key: 'three', marker: '3', label: 'три карты', desc: 'прошлое · настоящее · будущее', right: '3 аркана', cmd: 'taro ask' },
  ];
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
            <span className="mr-right">{row.right}</span>
          </button>
        ))}
      </div>

      <div className="tl tl-comment">{hint}</div>
    </div>
  );
}
