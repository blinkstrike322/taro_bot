'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from './Button';

interface ReadingEntry {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
  cards_data: string;
}

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  initData: string;
}

const MONTH_NAMES = [
  'ЯНВАРЬ','ФЕВРАЛЬ','МАРТ','АПРЕЛЬ','МАЙ','ИЮНЬ',
  'ИЮЛЬ','АВГУСТ','СЕНТЯБРЬ','OКТЯБРЬ','НOЯБРЬ','ДЕКАБРЬ',
];

const WEEKDAY_HEADERS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

const TYPE_LABELS: Record<string, string> = {
  daily: 'КАРТА ДНЯ',
  spread_1: '1 КАРТА',
  spread_3: '3 КАРТЫ',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function parseCardsData(cardsData: string): string[] {
  try {
    const parsed = JSON.parse(cardsData);
    if (Array.isArray(parsed)) return parsed.map((c: any) => c.name || String(c));
    if (parsed?.cards && Array.isArray(parsed.cards)) return parsed.cards.map((c: any) => c.name || String(c));
    if (parsed?.name) return [parsed.name];
    return [];
  } catch {
    return [];
  }
}

export default function CalendarModal({ isOpen, onClose, initData }: CalendarModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [readings, setReadings] = useState<ReadingEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const readingsByDay = new Map<number, ReadingEntry[]>();
  readings.forEach((r) => {
    const day = new Date(r.created_at).getDate();
    const list = readingsByDay.get(day) || [];
    list.push(r);
    readingsByDay.set(day, list);
  });

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/readings?init_data=${encodeURIComponent(initData)}&year=${year}&month=${String(month + 1).padStart(2, '0')}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setReadings(data.readings || []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setReadings([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [isOpen, initData, year, month]);

  const handlePrevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11; }
      return m - 1;
    });
    setSelectedDay(null);
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0; }
      return m + 1;
    });
    setSelectedDay(null);
  }, []);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDay !== null) setSelectedDay(null);
        else onClose();
      }
    },
    [onClose, selectedDay],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  const selectedReadings = selectedDay !== null ? (readingsByDay.get(selectedDay) || []) : [];

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] m-2 border-4 border-white bg-black relative max-h-[70dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between bg-black text-white font-pixel text-[13px] leading-none px-2 py-2 border-b-2 border-white tracking-tight">
          <span>{'>> CALENDAR.LOG'}</span>
          <span className="blink">█</span>
        </div>

        {selectedDay === null ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                className="btn font-pixel text-[13px] text-white px-2 py-1 border border-white/30 hover:border-white"
                onClick={handlePrevMonth}
              >
                &lt;
              </button>
              <span className="font-pixel text-[13px] text-white tracking-wide">
                {MONTH_NAMES[month]} {year}
              </span>
              <button
                type="button"
                className="btn font-pixel text-[13px] text-white px-2 py-1 border border-white/30 hover:border-white"
                onClick={handleNextMonth}
              >
                &gt;
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_HEADERS.map((wd) => (
                <div
                  key={wd}
                  className="font-pixel text-[10px] text-white/40 text-center tracking-wider"
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} />;
                }
                const hasReadings = readingsByDay.has(day);
                const isToday = isCurrentMonth && day === todayDate;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`btn flex flex-col items-center justify-center aspect-square font-pixel text-[11px] text-white relative ${
                      isToday ? 'border-2 border-white' : 'border border-white/10'
                    } hover:bg-white/10 cursor-pointer ${hasReadings ? '' : 'opacity-60'}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    {day}
                    {hasReadings && (
                      <span className="w-1 h-1 bg-white rounded-full mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="font-mono-crt text-sm text-white/40 text-center mt-3">
                ЗАГРУЗКА...
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <button
              type="button"
              className="btn font-pixel text-[11px] text-white/55 px-2 py-1 border border-white/30 mb-3 hover:border-white"
              onClick={() => setSelectedDay(null)}
            >
              &lt; НАЗАД
            </button>

            <div className="font-pixel text-[13px] text-white tracking-wide mb-3">
              {selectedDay} {MONTH_NAMES[month]} {year}
            </div>

            <div className="flex flex-col gap-2">
              {selectedReadings.map((r) => {
                const cards = parseCardsData(r.cards_data);
                return (
                  <div
                    key={r.id}
                    className="border border-white/30 px-3 py-2"
                  >
                    <span className="font-pixel text-[11px] text-white/70 tracking-wide">
                      {TYPE_LABELS[r.type] || r.type.toUpperCase()}
                    </span>
                    {r.question && (
                      <div className="font-mono-crt text-sm text-white/55 mt-1">
                        {r.question}
                      </div>
                    )}
                    <div className="font-mono-crt text-sm text-white mt-1">
                      {cards.join(' · ')}
                    </div>
                  </div>
                );
              })}
              {selectedReadings.length === 0 && (
                <div className="font-mono-crt text-sm text-white/40 text-center py-4">
                  НЕТ РАСКЛАДОВ
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-center p-4">
          <Button variant="secondary" onClick={onClose}>
            ЗАКРЫТЬ
          </Button>
        </div>
      </div>
    </div>
  );
}
