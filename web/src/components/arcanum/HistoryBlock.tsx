'use client';

// ─────────────────────────────────────────────────────────────
// HistoryBlock — журнал сеансов: строки-записи, тап разворачивает
// полный сеанс в транскрипте.
// ─────────────────────────────────────────────────────────────
import type { HistoryRow } from '@/lib/transcript';
import { formatDateTime, spreadLabelFromType } from '@/lib/transcript';
import { getGuide } from '@/lib/guides';
import { sMenu, haptic } from '@/lib/sound';

interface HistoryBlockProps {
  rows: HistoryRow[];
  onSelect: (row: HistoryRow) => void;
}

export default function HistoryBlock({ rows, onSelect }: HistoryBlockProps) {
  if (rows.length === 0) {
    return (
      <div className="history-block">
        <div className="tl tl-faint">журнал пуст · первые записи появятся после раскладов</div>
      </div>
    );
  }

  return (
    <div className="history-block">
      <div className="tl tl-faint hb-title">── сеансы этого месяца ──</div>
      <div className="hb-list">
        {rows.map((r) => {
          const guide = getGuide(r.character_id);
          const label = spreadLabelFromType(r.type);
          return (
            <button
              key={r.id}
              type="button"
              className="history-row"
              onClick={() => {
                sMenu();
                haptic('tick');
                onSelect(r);
              }}
            >
              <span className="hr-guide-glyph" style={{ color: guide.accent }} aria-hidden="true">
                {guide.cornerSymbols.tl}
              </span>
              <span className="hr-body">
                <span className="hr-line1">
                  <span className="hr-type">{label}</span>
                  {r.question && <span className="hr-q"> — «{r.question.slice(0, 40)}»</span>}
                </span>
                <span className="hr-line2">
                  <span className="hr-date">{formatDateTime(r.created_at)}</span>
                  <span className="hr-guide"> · {guide.tag}</span>
                </span>
              </span>
              <span className="hr-chev" aria-hidden="true">▸</span>
            </button>
          );
        })}
      </div>
      <div className="tl tl-comment hb-hint">{'// тапни — развернуть сеанс'}</div>
    </div>
  );
}
