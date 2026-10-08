'use client';

// ─────────────────────────────────────────────────────────────
// ThemeBlock — «ПОКРЫТИЕ ФОСФОРА»: список тем терминала.
// Активная тема — live-состояние (не в записи): блок всегда
// рендерит текущую. Каждая строка — кнопка-переключатель с
// живым свотчем (как лягут тона), глифом и алхимической
// стадией. Каскад входа строк — как у луны: шапка → строки.
// ─────────────────────────────────────────────────────────────
import { THEMES } from '@/lib/themes';
import { sMenu } from '@/lib/sound';

interface ThemeBlockProps {
  /** активная тема — live, не из записи */
  activeId: string;
  /** выбор темы: id новой */
  onSelect: (id: string) => void;
}

export default function ThemeBlock({ activeId, onSelect }: ThemeBlockProps) {
  return (
    <section className="theme-block frame-ritual" aria-label="темы терминала">
      <span className="corner corner-tl" aria-hidden="true">╔</span>
      <span className="corner corner-tr" aria-hidden="true">┐</span>
      <span className="corner corner-bl" aria-hidden="true">└</span>
      <span className="corner corner-br" aria-hidden="true">╝</span>

      <header className="theme-head">
        <span className="theme-title">ПОКРЫТИЕ ФОСФОРА</span>
        <span className="theme-sub tl tl-faint">четыре темперамента одной трубки</span>
      </header>

      <ul className="theme-list">
        {THEMES.map((t, i) => {
          const active = t.id === activeId;
          return (
            <li
              key={t.id}
              className="theme-row-wrap"
              style={{ animationDelay: `${180 + i * 90}ms` }}
            >
              <button
                type="button"
                className={`theme-row${active ? ' theme-row--active' : ''}`}
                onClick={() => {
                  if (active) {
                    sMenu();
                    return;
                  }
                  onSelect(t.id);
                }}
                aria-current={active ? 'true' : undefined}
                title={
                  active
                    ? 'покрытие уже нанесено'
                    : `сменить покрытие: ${t.name} (${t.stage})`
                }
              >
                <span className="theme-glyph" aria-hidden="true">{t.glyph}</span>
                <span className="theme-name">{t.name}</span>
                <span
                  className={`th-swatch th-swatch--${t.id}`}
                  aria-hidden="true"
                >
                  <span /><span /><span />
                </span>
                <span className="theme-note tl tl-faint">
                  <span className="theme-stage">{t.stage}</span>
                  {' — '}
                  {t.note}
                </span>
                {active && (
                  <span className="theme-on" aria-hidden="true">● активна</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="theme-foot tl tl-faint">
        {'// клик — сменить покрытие · у каждого свой дегаусс · терминал помнит выбор'}
      </div>
    </section>
  );
}
