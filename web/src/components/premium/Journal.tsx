"use client";
import { useEffect, useState } from "react";
import { getJournalMonth, type ReadingEntry } from "@/lib/api";
import {
  monthGrid,
  shiftMonth,
  localReadingDay,
  readingDate,
} from "@/lib/journalCalendar";
import { sessionFromHistory } from "@/lib/premium";
import { TarotArtwork } from "./TarotArtwork";
import { Divider, Icon } from "./Ornaments";
export function Journal({ onOpen }: { onOpen: (id: number) => void }) {
  const now = new Date();
  const [[year, month], setMonth] = useState<[number, number]>([
    now.getFullYear(),
    now.getMonth(),
  ]);
  const [day, setDay] = useState<number | null>(null),
    [rows, setRows] = useState<ReadingEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let stale = false;
    getJournalMonth(year, month)
      .then((all) => {
        if (!stale)
          setRows(
            all
              .filter((r) => {
                const d = readingDate(r.created_at);
                return d.getFullYear() === year && d.getMonth() === month;
              })
              .sort(
                (a, b) =>
                  readingDate(b.created_at).valueOf() -
                  readingDate(a.created_at).valueOf(),
              ),
          );
      })
      .catch(() => {
        if (!stale)
          setError("Не удалось загрузить журнал. Твои записи сохранены.");
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [year, month, revision]);
  const marked = new Set(
    rows.map((r) => Number(localReadingDay(r.created_at).slice(-2))),
  );
  const shown = day
    ? rows.filter(
        (r) => Number(localReadingDay(r.created_at).slice(-2)) === day,
      )
    : rows;
  const change = (delta: number) => {
    setLoading(true);
    setError("");
    setRows([]);
    setMonth(shiftMonth(year, month, delta));
    setDay(null);
  };
  return (
    <section className="journal-page content-page">
      <h1>Журнал</h1>
      <p className="subtle">То, к чему можно вернуться.</p>
      <Divider />
      <div className="month-heading">
        <button aria-label="Предыдущий месяц" onClick={() => change(-1)}>
          <Icon name="back" size={18} />
        </button>
        <span>
          {new Date(year, month, 1)
            .toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
            .replace(" г.", "")}
        </span>
        <button aria-label="Следующий месяц" onClick={() => change(1)}>
          <Icon name="arrow" size={18} />
        </button>
      </div>
      <div className="calendar" aria-label="Календарь раскладов">
        <div className="weekdays">
          {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="calendar-days">
          {monthGrid(year, month).map((d, i) =>
            d ? (
              <button
                key={i}
                disabled={loading || !!error}
                className={`${marked.has(d) ? "has-readings" : ""} ${day === d ? "selected" : ""} ${now.getFullYear() === year && now.getMonth() === month && now.getDate() === d ? "today" : ""}`}
                aria-pressed={day === d}
                aria-label={`${new Date(year, month, d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}${marked.has(d) ? ", есть расклады" : ""}`}
                onClick={() => setDay(day === d ? null : d)}
              >
                {d}
                <i />
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
      </div>
      <Divider />
      <div className="journal-list-heading">
        <h2>
          {day
            ? new Date(year, month, day).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
              })
            : "Расклады месяца"}
        </h2>
        {day && (
          <button className="quiet" onClick={() => setDay(null)}>
            Весь месяц
          </button>
        )}
      </div>
      {loading ? (
        <p className="status" role="status">
          Открываем твои записи…
        </p>
      ) : error ? (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="quiet" onClick={() => setRevision((v) => v + 1)}>
            Повторить соединение
          </button>
        </div>
      ) : !shown.length ? (
        <p className="empty-state">
          {day
            ? "В этот день записей нет."
            : "Здесь пока тихо. Расклады этого месяца появятся в журнале."}
        </p>
      ) : (
        <div className="journal-list">
          {shown.map((row) => {
            const saved = sessionFromHistory(row);
            return (
              <button
                className="journal-row"
                key={row.id}
                onClick={() => onOpen(Number(row.id))}
              >
                <span className="journal-thumbnail">
                  {saved.cards[0] && <TarotArtwork card={saved.cards[0]} />}
                </span>
                <span className="journal-row-copy">
                  <strong>{saved.spreadName}</strong>
                  <span>{row.question || "Что просит внимания сегодня?"}</span>
                  <small>
                    {readingDate(row.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
