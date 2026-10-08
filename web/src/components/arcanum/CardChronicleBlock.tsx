'use client';

// ─────────────────────────────────────────────────────────────
// CardChronicleBlock — «ХРОНИКА КАРТЫ»: вся история выпадений
// одного аркана в журнале оператора. Арт + две грани значений
// (reuse .arc-* классов), счётчик выпадений с расколом прямая/
// перевёрнутая, таймлайн событий (дата · расклад · ориентация ·
// вопрос). Блок сам тянет весь журнал (?all=1) — запись в
// транскрипте view-only, ничего не хранит.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import * as API from '@/lib/api';
import type { HistoryRow } from '@/lib/transcript';
import { spreadLabelFromType, type Entry } from '@/lib/transcript';
import {
  buildChronicle,
  chronicleDate,
  CHRONICLE_TIMELINE_LIMIT,
  type Chronicle,
} from '@/lib/chronicle';
import { getGuide } from '@/lib/guides';

interface CardChronicleBlockProps {
  entry: Extract<Entry, { kind: 'card' }>;
  characterId: string;
}

/** склонение: 1 раз · 2 раза · 5 раз */
function timesWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'раз';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'раза';
  return 'раз';
}

export default function CardChronicleBlock({ entry, characterId }: CardChronicleBlockProps) {
  const guide = getGuide(characterId);
  const [chronicle, setChronicle] = useState<Chronicle | null>(null);
  const [failed, setFailed] = useState(false);

  // весь журнал → события хроники (один раз при появлении записи)
  useEffect(() => {
    let alive = true;
    API.getAllReadings()
      .then((rows) => {
        if (!alive) return;
        setChronicle(buildChronicle(entry.cardName, rows as HistoryRow[], spreadLabelFromType));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [entry.cardName]);

  const suitLabel = entry.suit
    ? entry.suit === 'wands'
      ? 'жезлы'
      : entry.suit === 'cups'
        ? 'кубки'
        : entry.suit === 'swords'
          ? 'мечи'
          : 'пентакли'
    : 'старший аркан';

  const reversedShare =
    chronicle && chronicle.total > 0
      ? Math.round((chronicle.reversedCount / chronicle.total) * 100)
      : 0;

  return (
    <section className="cr-block frame-ritual" aria-label={`хроника карты ${entry.cardName}`}>
      <span className="corner corner-tl" aria-hidden="true">╔</span>
      <span className="corner corner-tr" aria-hidden="true">┐</span>
      <span className="corner corner-bl" aria-hidden="true">└</span>
      <span className="corner corner-br" aria-hidden="true">╝</span>

      {/* шапка */}
      <header className="cr-head">
        <span className="cr-title">ХРОНИКА КАРТЫ</span>
        <span className="cr-sub tl tl-faint">
          {suitLabel} · полная история выпадений
        </span>
      </header>

      {/* карта: арт + имя + грани */}
      <div className="arc-cardrow cr-cardrow">
        <div className="arc-art">
          <img src={entry.cardImage} alt={entry.cardName} />
        </div>
        <div className="arc-cardinfo">
          <div className="arc-name cr-name">{entry.cardName}</div>
          <div className="arc-meta tl tl-faint">
            {suitLabel}
            {entry.arcana === 'major' ? ` · аркан ${entry.number}` : ''}
          </div>

          {/* счётчик выпадений */}
          <div className="cr-count" aria-live="polite">
            {failed ? (
              <span className="tl tl-faint">журнал недоступен · попробуй ещё раз</span>
            ) : chronicle == null ? (
              <span className="tl tl-faint">листаю журнал…</span>
            ) : chronicle.total === 0 ? (
              <span className="cr-count-zero tl">
                ещё не выпадала · колода молчит
              </span>
            ) : (
              <>
                <span className="cr-count-num">{chronicle.total}</span>
                <span className="cr-count-word">
                  {timesWord(chronicle.total)} за всё время
                </span>
                {chronicle.firstAt && chronicle.firstAt !== chronicle.lastAt && (
                  <span className="cr-count-span tl tl-faint">
                    {' · с ' + chronicleDate(chronicle.firstAt)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* раскол ориентаций: прямая ↔ перевёрнутая */}
          {chronicle && chronicle.total > 0 && (
            <div
              className="cr-split"
              role="img"
              aria-label={`прямая: ${chronicle.total - chronicle.reversedCount}, перевёрнутая: ${chronicle.reversedCount}`}
            >
              <span className="cr-split-label tl">прямая</span>
              <span className="cr-split-track">
                <span
                  className="cr-split-fill"
                  style={{ width: `${100 - reversedShare}%` }}
                />
                <span
                  className="cr-split-fill cr-split-fill--rev"
                  style={{ width: `${reversedShare}%` }}
                />
              </span>
              <span className="cr-split-label tl">перевёрнутая</span>
            </div>
          )}

          {/* грани значений */}
          <div className="arc-meanings cr-meanings">
            <div className="arc-meaning">
              <span className="cr-face tl">{'// прямая'}</span>
              <span className="cr-face-text tl">{entry.upright}</span>
            </div>
            <div className="arc-meaning">
              <span className="cr-face tl">{'// перевёрнутая'}</span>
              <span className="cr-face-text tl">{entry.reversed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* таймлайн событий */}
      {chronicle && chronicle.total > 0 && (
        <div className="cr-timeline">
          <div className="tl tl-comment cr-timeline-title">{'// как выпадала'}</div>
          <ul className="cr-events">
            {chronicle.events.slice(0, CHRONICLE_TIMELINE_LIMIT).map((ev, i) => (
              <li
                key={`${ev.created_at}-${i}`}
                className="cr-event"
                style={{ animationDelay: `${260 + i * 80}ms` }}
              >
                <span className="cr-event-dot" aria-hidden="true">
                  {ev.reversed ? '☽' : '✦'}
                </span>
                <span className="cr-event-date tl">{chronicleDate(ev.created_at)}</span>
                <span className="cr-event-spread">{ev.spreadLabel}</span>
                {ev.question && (
                  <span className="cr-event-q tl tl-faint">«{ev.question}»</span>
                )}
              </li>
            ))}
          </ul>
          {chronicle.total > CHRONICLE_TIMELINE_LIMIT && (
            <div className="tl tl-faint cr-more">
              {'// …и ещё ' + (chronicle.total - CHRONICLE_TIMELINE_LIMIT) + ' ' +
                timesWord(chronicle.total - CHRONICLE_TIMELINE_LIMIT)}
            </div>
          )}
        </div>
      )}

      <div className="cr-foot tl tl-faint">
        {guide.tag} · taro library — вся колода под взглядом
      </div>
    </section>
  );
}
