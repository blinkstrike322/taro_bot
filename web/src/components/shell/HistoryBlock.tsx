'use client';

// HistoryBlock — журнал сеансов в стиле tail:
//   #1  день      10 авг · 12:00
//   #2  1 карта   «стоит ли менять работу?»  11 авг · 09:14
import type { HistoryRow } from '@/lib/transcript';
import { formatDateTime } from '@/lib/transcript';

interface HistoryBlockProps {
  rows: HistoryRow[];
}

const TYPE_LABEL: Record<string, string> = {
  daily: 'день',
  '1': '1 карта',
  '3': '3 карты',
};

export default function HistoryBlock({ rows }: HistoryBlockProps) {
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
        return (
          <div key={r.id} className="tl history-row">
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
          </div>
        );
      })}
      <div className="tl tl-comment" style={{ marginTop: 6 }}>
        {`tail: показано ${rows.length} записей`}
      </div>
    </div>
  );
}
