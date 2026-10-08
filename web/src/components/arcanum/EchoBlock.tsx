'use client';

// ─────────────────────────────────────────────────────────────
// EchoBlock — «отголосок журнала»: список прошлых чтений с
// общими картами. Карты повторяются — терминал помнит; тап по
// строке разворачивает то чтение целиком (instant).
// ─────────────────────────────────────────────────────────────
import type { Entry, EchoMatchItem } from '@/lib/transcript';
import { formatDateTime } from '@/lib/transcript';
import { sMenu, haptic } from '@/lib/sound';

export type EchoEntry = Extract<Entry, { kind: 'echo' }>;

interface EchoBlockProps {
  entry: EchoEntry;
  onSelect: (match: EchoMatchItem) => void;
}

/** склонение для подстроки шапки: 1 чтение · 2 чтения · 5 чтений */
function pluralReadings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'чтение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'чтения';
  return 'чтений';
}

export default function EchoBlock({ entry, onSelect }: EchoBlockProps) {
  const count = entry.matches.length;

  return (
    <div className="echo-block">
      {/* шапка: брат меню-заголовков, но с лунным глифом */}
      <div className="echo-head">
        <span className="echo-title">
          <span className="echo-title-glyph" aria-hidden="true">☾</span>
          ОТГОЛОСОК ЖУРНАЛА
        </span>
        <span className="echo-sub">эти карты уже выпадали · {count} {pluralReadings(count)}</span>
      </div>

      {/* строки-варианты: как журнал, но с серебристой луной слева */}
      <div className="echo-list">
        {entry.matches.map((m, i) => (
          <button
            key={m.dbId}
            type="button"
            className="echo-row"
            style={{ '--er-delay': `${i * 60}ms` } as React.CSSProperties}
            onClick={() => {
              sMenu();
              haptic('tick');
              onSelect(m);
            }}
            aria-label={`отголосок: ${m.spreadLabel} от ${formatDateTime(m.created_at)}, ${m.sharedCount} общих карт`}
            title={`развернуть чтение от ${formatDateTime(m.created_at)}`}
          >
            <span className="echo-moon" aria-hidden="true">☾</span>
            <span className="echo-body">
              <span className="echo-line1">
                <span className="echo-type">{m.spreadLabel}</span>
                <span className="echo-q">
                  {m.question ? ` — «${m.question.slice(0, 40)}»` : ' — без вопроса'}
                </span>
              </span>
              {/* общие карты — подсвечены, с глифом ✦ перед именем */}
              <span className="echo-shared">
                {m.sharedNames.map((name) => (
                  <span key={name} className="echo-card">
                    <span className="echo-card-glyph" aria-hidden="true">◇</span>
                    {name}
                  </span>
                ))}
              </span>
              <span className="echo-line2">
                <span className="echo-date">{formatDateTime(m.created_at)}</span>
                <span className="echo-count">{m.sharedCount} общих</span>
              </span>
            </span>
            <span className="echo-chev" aria-hidden="true">▸</span>
          </button>
        ))}
      </div>

      <div className="tl tl-comment echo-hint">{'// тапни — развернуть то чтение'}</div>
    </div>
  );
}
