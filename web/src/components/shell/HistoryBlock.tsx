'use client';

// HistoryBlock — журнал сеансов в стиле tail:
//   #1  день      10 авг · 12:00
//   #2  1 карта   «стоит ли менять работу?»  11 авг · 09:14
// Тап по строке разворачивает полный сеанс — тот же рендер, что был изначально.
import type { HistoryRow } from '@/lib/transcript';
import { formatDateTime } from '@/lib/transcript';

interface HistoryBlockProps {
  rows: HistoryRow[];
  onSelect: (row: HistoryRow) => void;
}

const TYPE_LABEL: Record<string, string> = {
  daily: 'день',
  '1': '1 карта',
  '3': '3 карты',
};

export default function HistoryBlock({ rows, onSelect }: HistoryBlockProps) {
  if (!rows.length) {
    return (
      <div className="history-block">
        <div className="tl tl-dim">журнал пуст · канал недоступен</div>
        <div className="tl tl-comment">{'# сеансы появятся здесь после первых раскладов'}</div>
      </div>
    );
  }

  return (
    <div className="history-block">
      <div className="tl tl-faint">{'id │ тип      │ вопрос / дата'}</div>
      <div className="tl tl-faint">{'───┼──────────┼───────────────────────────'}</div>
      {rows.map((r) => {
        const type = TYPE_LABEL[r.type] ?? r.type;
        const date = formatDateTime(r.created_at);
        const expandable = Boolean(r.cards_data && r.interpretation);
        return (
          <button
            key={r.id}
            type="button"
            className={`tl history-row${expandable ? ' history-row--open' : ''}`}
            onClick={() => expandable && onSelect(r)}
            title={expandable ? 'развернуть сеанс' : undefined}
          >
            <span className="hr-id">#{r.id}</span>{' '}
            <span className="hr-type">{type.padEnd(9, '\u00A0')}</span>{' '}
            {r.question ? (
              <>
                <span className="hr-q">«{r.question}»</span>
                <span className="hr-date"> {date}</span>
              </>
            ) : (
              <span className="hr-date">{date}</span>
            )}
            {expandable && <span className="hr-arrow"> ⏎</span>}
          </button>
        );
      })}
      <div className="tl tl-comment" style={{ marginTop: 6 }}>
        {`tail: показано ${rows.length} записей · тапни — сеанс развернётся`}
      </div>
    </div>
  );
}
