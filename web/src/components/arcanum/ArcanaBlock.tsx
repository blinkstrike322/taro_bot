'use client';

// ─────────────────────────────────────────────────────────────
// ArcanaBlock — «личный аркан»: нумерологическое ядро даты
// рождения → старший аркан. Терминал любит видимую математику:
// цепочка редукции печатается целиком, итог подсвечен акцентом.
// Ниже — большой арт, имя аркана громко, обе грани значений и
// шёпот проводника (приходит асинхронно через /api/ask).
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import type { Entry } from '@/lib/transcript';
import { computeArcana } from '@/lib/arcana';
import { PendingLine } from '@/components/arcanum/ProgressLine';
import ProseType from '@/components/arcanum/ProseType';

export type ArcanaEntry = Extract<Entry, { kind: 'arcana' }>;

interface ArcanaBlockProps {
  entry: ArcanaEntry;
  onRunCmd: (cmd: string) => void;
}

export default function ArcanaBlock({ entry, onRunCmd }: ArcanaBlockProps) {
  // цепочка пересчитывается на лету: чисто и дешевле хранения
  const res = useMemo(() => computeArcana(entry.dateStr), [entry.dateStr]);

  if (!res) {
    return (
      <div className="entry-pad">
        <div className="err-block">
          <div className="tl tl-err">дата не разобрана · формат дд.мм.гггг</div>
        </div>
      </div>
    );
  }

  const { card, steps } = res;
  const lastIdx = steps.length - 1;

  // сегменты цепочки: дата → выражение = сумма → выражение = итог
  const segs: { text: string; cls: string }[] = [
    { text: entry.dateStr, cls: 'arc-chain-date' },
  ];
  steps.forEach((st, i) => {
    const final = i === lastIdx;
    segs.push({ text: '→', cls: 'arc-chain-op' });
    segs.push({ text: st.expr, cls: 'arc-chain-expr' });
    segs.push({ text: '=', cls: 'arc-chain-op' });
    segs.push({
      text: String(st.sum),
      cls: final ? 'arc-chain-final' : 'arc-chain-num',
    });
  });

  return (
    <section className="arc-block frame-ritual" aria-label="личный аркан">
      <span className="corner corner-tl" aria-hidden="true">╔</span>
      <span className="corner corner-tr" aria-hidden="true">┐</span>
      <span className="corner corner-bl" aria-hidden="true">└</span>
      <span className="corner corner-br" aria-hidden="true">╝</span>

      {/* повторный показ: дата из памяти терминала */}
      {entry.fromMemory && (
        <button
          type="button"
          className="arc-memory tl tl-faint"
          onClick={() => onRunCmd('taro arcana --new')}
          aria-label="пересчитать личный аркан — забыть сохранённую дату"
          title="заново спросить дату рождения"
        >
          {'// из памяти терминала · taro arcana --new — пересчитать'}
        </button>
      )}

      {/* шапка */}
      <header className="arc-head">
        <span className="tl tl-bright tl-semibold arc-title">ЛИЧНЫЙ АРКАН</span>
        <span className="tl tl-faint arc-sub">нумерологическое ядро даты рождения</span>
      </header>

      {/* цепочка вычисления: видимая математика */}
      <div className="arc-chain" aria-label={`цепочка редукции: ${segs.map((s) => s.text).join(' ')}`}>
        {segs.map((s, i) => (
          <span
            key={i}
            className={`arc-chain-seg ${s.cls}`}
            style={{ animationDelay: `${120 + i * 60}ms` }}
          >
            {s.text}
          </span>
        ))}
      </div>

      {/* карта: арт + имя */}
      <div className="arc-cardrow">
        <div className="arc-art">
          <img src={`/cards/${card.filename}`} alt={`${card.name} — личный аркан`} />
        </div>
        <div className="arc-cardinfo">
          <div className="arc-name">{card.name}</div>
          <div className="arc-meta tl tl-faint">старший аркан · №{card.number}</div>
        </div>
      </div>

      {/* значения: прямая | перевёрнутая */}
      <div className="arc-meanings">
        <div className="arc-meaning">
          <div className="lib-meaning-label tl tl-comment">{'// прямая'}</div>
          <div className="tl tl-plain">{card.upright}</div>
        </div>
        <div className="arc-meaning">
          <div className="lib-meaning-label tl tl-comment">{'// перевёрнутая'}</div>
          <div className="tl tl-dim">{card.reversed}</div>
        </div>
      </div>

      {/* шёпот проводника: LLM-ответ или ожидание */}
      {entry.whisper ? (
        <div className="arc-whisper">
          <ProseType text={entry.whisper} className="arc-whisper-answer" />
        </div>
      ) : entry.askWhisper ? (
        <div className="arc-whisper-zone">
          <PendingLine label="шёпот личности" />
        </div>
      ) : null}
    </section>
  );
}
