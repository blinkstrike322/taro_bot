'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import Button from './Button';
import { getGuide } from '@/lib/guides';

interface CardData {
  id?: string;
  name?: string;
  is_reversed?: boolean;
  orientation?: string;
}

interface ReadingEntry {
  id: number;
  type: string;
  question: string | null;
  created_at: string;
  cards_data: any;
  interpretation: any;
  character_id: string;
}

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  initData: string;
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAY_HEADERS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

const TYPE_LABELS: Record<string, string> = {
  daily: 'Расклад дня',
  spread_1: 'Одна карта',
  spread_3: 'Три карты',
};

const TYPE_GLYPHS: Record<string, string> = {
  daily: '☀',
  spread_1: '✦',
  spread_3: '☾',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

// Parse cards_data — handles multiple shapes:
// - { cards: [...], spread_type, ... }  (new format)
// - [ {id, name, ...}, ... ]            (array)
// - { id, name, ... }                    (single card)
// - { chosen_index, chosen_card }        (legacy daily)
function parseCards(cardsData: any): CardData[] {
  if (!cardsData) return [];
  try {
    if (Array.isArray(cardsData)) {
      return cardsData.filter((c: any) => c && (c.name || c.id));
    }
    if (typeof cardsData === 'object') {
      if (Array.isArray(cardsData.cards)) {
        return cardsData.cards.filter((c: any) => c && (c.name || c.id));
      }
      if (cardsData.name || cardsData.id) {
        return [cardsData];
      }
      if (cardsData.chosen_card && (cardsData.chosen_card.name || cardsData.chosen_card.id)) {
        return [cardsData.chosen_card];
      }
    }
  } catch {}
  return [];
}

// Позиции для подписей (день = энергия/вызов/совет; 3 карты = прошлое/настоящее/будущее)
const POSITION_HINTS: Record<string, string[]> = {
  daily: ['энергия', 'вызов', 'совет'],
  spread_3: ['прошлое', 'настоящее', 'будущее'],
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function getDayFromIso(iso: string): number | null {
  try {
    return new Date(iso).getDate();
  } catch {
    return null;
  }
}

export default function CalendarModal({ isOpen, onClose, initData }: CalendarModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [readings, setReadings] = useState<ReadingEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedReading, setSelectedReading] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const readingsByDay = new Map<number, ReadingEntry[]>();
  readings.forEach((r) => {
    const day = getDayFromIso(r.created_at);
    if (day === null) return;
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
    setSelectedReading(null);
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0; }
      return m + 1;
    });
    setSelectedDay(null);
    setSelectedReading(null);
  }, []);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedReading !== null) setSelectedReading(null);
        else if (selectedDay !== null) setSelectedDay(null);
        else onClose();
      }
    },
    [onClose, selectedDay, selectedReading],
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
  const activeReading = selectedReading !== null
    ? selectedReadings.find((r) => r.id === selectedReading)
    : null;

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <div className="modal-overlay transition-opacity duration-200" onClick={onClose}>
      <div
        className="w-full max-w-[440px] m-3 relative modal-frame"
        style={{
          background: 'var(--paper-bright)',
          borderRadius: 5,
          border: '1px solid var(--line-strong)',
          maxHeight: '86dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* шапка */}
        <div className="sticky top-0 z-20 px-5 pt-4 pb-3" style={{ background: 'var(--paper-bright)', borderBottom: '1px solid var(--line-strong)' }}>
          <div className="flex items-center justify-between">
            <div className="display-xl !text-[30px]">история</div>
            <button
              type="button"
              className="btn p-1.5"
              onClick={onClose}
              aria-label="Закрыть"
              style={{ color: 'var(--ink-soft)' }}
            >
              <X size={17} strokeWidth={1.75} />
            </button>
          </div>
          <div className="font-serif italic text-[14px] mt-1 text-[color:var(--ink-soft)]">
            каждый день оставил след. выбери дату, чтобы вернуться.
          </div>
        </div>

        {/* ─── VIEW 1: календарь ─── */}
        {selectedDay === null && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn nav-word !text-[13px]"
                onClick={handlePrevMonth}
                aria-label="Предыдущий месяц"
              >
                <ArrowLeft size={13} strokeWidth={1.75} />назад
              </button>
              <div className="font-serif text-[20px] font-semibold text-[color:var(--ink)] text-center leading-tight">
                {MONTH_NAMES[month].toLowerCase()}<br />
                <span className="tech-label">{year}</span>
              </div>
              <button
                type="button"
                className="btn nav-word !text-[13px]"
                onClick={handleNextMonth}
                aria-label="Следующий месяц"
              >
                вперёд<ArrowRight size={13} strokeWidth={1.75} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1.5">
              {WEEKDAY_HEADERS.map((wd) => (
                <div
                  key={wd}
                  className="font-pixel text-[9px] text-[color:var(--ink-faint)] text-center tracking-wider"
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
                const dayReadings = readingsByDay.get(day) || [];
                const hasReadings = dayReadings.length > 0;
                const isToday = isCurrentMonth && day === todayDate;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`btn flex flex-col items-center justify-center aspect-square font-sans text-[13px] font-semibold relative ${isToday ? 'text-[color:var(--ink)]' : hasReadings ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-faint)]'}`}
                    style={{
                      borderRadius: 2,
                      background: isToday
                        ? 'rgba(207, 201, 221, 0.45)'
                        : hasReadings
                        ? 'rgba(217, 223, 234, 0.3)'
                        : 'transparent',
                      border: `1px solid ${isToday ? '#8D89C0' : hasReadings ? 'rgba(141,137,192,0.35)' : 'var(--line)'}`,
                    }}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span>{day}</span>
                    {hasReadings && (
                      <span className="flex gap-0.5 mt-0.5">
                        {dayReadings.slice(0, 3).map((r, ri) => {
                          const g = getGuide(r.character_id);
                          return (
                            <span
                              key={ri}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: g.accent }}
                            />
                          );
                        })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="font-pixel text-[10px] text-[color:var(--ink-faint)] text-center mt-3 tracking-wide blink">
                листаю страницы...
              </div>
            )}

            {readings.length > 0 && (
              <div className="mt-3 pt-2 flex justify-between font-pixel text-[9px] text-[color:var(--ink-faint)] tracking-wider uppercase">
                <span>раскладов: {readings.length}</span>
                <span>дней: {readingsByDay.size}</span>
              </div>
            )}
          </div>
        )}

        {/* ─── VIEW 2: расклады выбранного дня ─── */}
        {selectedDay !== null && selectedReading === null && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="btn nav-word !text-[12px]"
                onClick={() => setSelectedDay(null)}
              >
                <ArrowLeft size={13} strokeWidth={1.75} />назад
              </button>
              <div className="font-serif text-[17px] font-semibold text-[color:var(--ink)] text-right leading-tight">
                {selectedDay} {MONTH_NAMES[month].toLowerCase()}<br />
                <span className="font-pixel text-[9px] tracking-[0.2em] text-[color:var(--ink-faint)]">{year}</span>
              </div>
            </div>

            <div className="font-serif italic text-[14px] text-[color:var(--ink-soft)] leading-snug mb-3">
              {selectedReadings.length === 1
                ? 'в этот день был сделан один расклад:'
                : `в этот день было сделано ${selectedReadings.length} раскладов:`}
            </div>

            <div className="flex flex-col gap-2.5">
              {selectedReadings.map((r) => {
                const cards = parseCards(r.cards_data);
                const typeLabel = TYPE_LABELS[r.type] || r.type;
                const typeGlyph = TYPE_GLYPHS[r.type] || '◇';
                const guide = getGuide(r.character_id);
                const hints = POSITION_HINTS[r.type] || [];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReading(r.id)}
                    className="btn px-4 py-3 text-left relative"
                    style={{
                      borderRadius: 18,
                      border: '1.5px solid var(--line)',
                      background: 'var(--paper)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="flex items-center justify-center w-6 h-6 rounded-full font-serif text-[13px]"
                          style={{ background: guide.accentSoft, color: guide.accentDeep }}
                        >
                          {typeGlyph}
                        </span>
                        <span className="font-sans text-[13px] font-bold text-[color:var(--ink)]">
                          {typeLabel}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: guide.accent }}
                          aria-hidden="true"
                        />
                        <span className="font-pixel text-[9px] text-[color:var(--ink-faint)] tracking-wider">
                          {formatTime(r.created_at)}
                        </span>
                      </span>
                    </div>

                    {r.question && (
                      <div className="font-serif italic text-[14px] text-[color:var(--ink-soft)] mb-1 leading-snug pl-8 truncate">
                        «{r.question}»
                      </div>
                    )}

                    <div className="font-sans text-[12.5px] font-semibold text-[color:var(--ink)] leading-snug pl-8">
                      {cards.map((c, i) => (
                        <span key={i}>
                          {c.name}{c.is_reversed || c.orientation === 'reversed' ? ' ⇅' : ''}
                          {hints[i] ? ` · ${hints[i]}` : ''}
                          {i < cards.length - 1 ? ' — ' : ''}
                        </span>
                      ))}
                    </div>

                    <div className="font-pixel text-[8px] text-[color:var(--ink-faint)] mt-2 tracking-[0.15em] uppercase text-right">
                      ▸ открыть
                    </div>
                  </button>
                );
              })}
              {selectedReadings.length === 0 && (
                <div className="font-serif italic text-[15px] text-[color:var(--ink-faint)] text-center py-6">
                  · в этот день карты молчали ·
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── VIEW 3: полный расклад ─── */}
        {selectedDay !== null && selectedReading !== null && activeReading && (
          <ReadingDetail
            reading={activeReading}
            onBack={() => setSelectedReading(null)}
          />
        )}

        <div className="flex justify-center p-4 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Полный расклад: карты + толкование ──
function ReadingDetail({ reading, onBack }: { reading: ReadingEntry; onBack: () => void }) {
  const cards = parseCards(reading.cards_data);
  const guide = getGuide(reading.character_id);
  const interp = reading.interpretation || {};
  const typeLabel = TYPE_LABELS[reading.type] || reading.type;
  const typeGlyph = TYPE_GLYPHS[reading.type] || '◇';
  const hints = POSITION_HINTS[reading.type] || [];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="btn nav-word !text-[12px]"
          onClick={onBack}
        >
          <ArrowLeft size={13} strokeWidth={1.75} />назад
        </button>
        <div className="font-pixel text-[9px] text-[color:var(--ink-soft)] tracking-wide text-right leading-tight">
          {typeGlyph} {typeLabel}<br />
          <span className="text-[color:var(--ink-faint)]">{formatTime(reading.created_at)}</span>
        </div>
      </div>

      {/* подпись проводницы */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 mb-3"
        style={{
          borderRadius: 16,
          borderLeft: `3px solid ${guide.accent}`,
          background: `linear-gradient(90deg, ${guide.accentSoft} 0%, transparent 80%)`,
        }}
      >
        <div className="w-8 h-8 guide-portrait-frame flex-shrink-0" style={{ borderRadius: 10 }}>
          <img
            src={guide.portrait}
            alt={guide.name}
            className="w-full h-full object-cover guide-portrait-scan"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        <span className="font-serif text-[16px] font-semibold text-[color:var(--ink)]">
          {guide.name}
        </span>
        <span
          className="font-pixel text-[7px] tracking-[0.18em] uppercase ml-auto"
          style={{ color: guide.accent }}
        >
          {guide.tag}
        </span>
      </div>

      {/* вопрос */}
      {reading.question && (
        <div className="mb-3 px-4 py-2.5 soft-card" style={{ borderRadius: 14 }}>
          <div className="font-pixel text-[8px] text-[color:var(--ink-faint)] tracking-[0.15em] uppercase mb-1">
            ▸ вопрос
          </div>
          <div className="font-serif italic text-[15.5px] text-[color:var(--ink)] leading-snug">
            «{reading.question}»
          </div>
        </div>
      )}

      {/* карты */}
      <div className="mb-3">
        <div className="font-pixel text-[8px] text-[color:var(--ink-faint)] tracking-[0.15em] uppercase mb-2">
          ▸ карты
        </div>
        <div className="flex justify-center gap-2.5 flex-wrap">
          {cards.map((c, i) => {
            const isReversed = c.is_reversed || c.orientation === 'reversed';
            const cardId = c.id || '';
            const imgSrc = cardId ? `/cards/${cardId}.webp` : '';
            return (
              <div
                key={i}
                className="flex flex-col items-center"
                style={{ width: cards.length > 1 ? '31%' : '50%', maxWidth: cards.length > 1 ? '118px' : '156px' }}
              >
                <div
                  className="card-frame relative overflow-hidden"
                  style={{ aspectRatio: '2/3', width: '100%' }}
                >
                  {imgSrc && (
                    <img
                      src={imgSrc}
                      alt={c.name || ''}
                      loading="lazy"
                      className={`dither-img w-full h-full object-contain ${isReversed ? 'rotate-180' : ''}`}
                      style={{ imageRendering: 'auto' }}
                    />
                  )}
                  {isReversed && (
                    <span className="absolute top-1.5 left-1.5 rev-chip" aria-hidden="true">
                      ⇅ ПЕР.
                    </span>
                  )}
                </div>
                <div className="font-sans text-[11px] font-semibold text-[color:var(--ink)] text-center mt-1.5 leading-tight">
                  {c.name}
                </div>
                {hints[i] && (
                  <div className="font-pixel text-[8px] text-[color:var(--ink-faint)] tracking-wide">
                    {hints[i]}
                  </div>
                )}
              </div>
            );
          })}
          {cards.length === 0 && (
            <div className="font-serif italic text-[14px] text-[color:var(--ink-faint)] py-4">
              · карты не сохранены ·
            </div>
          )}
        </div>
      </div>

      {/* толкование */}
      <div
        className="relative reading-card noise-bg p-4"
        style={{
          '--guide-accent': guide.accent,
          '--guide-accent-deep': guide.accentDeep,
          '--guide-accent-dim': guide.accentDim,
        } as React.CSSProperties}
      >
        {interp.intro && (
          <p className="font-serif italic text-[18px] leading-snug relative z-10 mb-2.5" style={{ color: guide.accentDeep }}>
            {interp.intro}
          </p>
        )}

        {interp.short_answer && (
          <p className="font-sans text-[13.5px] leading-relaxed text-[color:var(--ink)] relative z-10">
            {interp.short_answer}
          </p>
        )}

        {interp.card_meaning && (
          (Array.isArray(interp.card_meaning) ? interp.card_meaning.length > 0 : interp.card_meaning) && (
            <div className="mt-2.5 space-y-2 relative z-10">
              {(Array.isArray(interp.card_meaning) ? interp.card_meaning : [interp.card_meaning]).map((meaning: string, i: number) => (
                <p key={i} className="font-sans text-[12.5px] leading-relaxed text-[color:var(--ink)] opacity-90">
                  {meaning}
                </p>
              ))}
            </div>
          )
        )}

        {interp.advice && (
          <div
            className="mt-3 p-3 relative z-10"
            style={{
              background: guide.accentSoft,
              borderRadius: 14,
              border: `1px dashed ${guide.accentDim}`,
            }}
          >
            <div className="font-pixel text-[8px] tracking-[0.2em] uppercase mb-1" style={{ color: guide.accentDeep }}>
              ✦ совет
            </div>
            <p className="font-serif text-[16px] font-semibold leading-snug text-[color:var(--ink)]">
              {interp.advice}
            </p>
          </div>
        )}

        {!interp.intro && !interp.short_answer && !interp.card_meaning && !interp.advice && (
          <p className="font-serif italic text-[14px] text-[color:var(--ink-faint)] py-2 relative z-10">
            · толкование не сохранено ·
          </p>
        )}
      </div>
    </div>
  );
}
