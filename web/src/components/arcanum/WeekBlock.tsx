'use client';

// ─────────────────────────────────────────────────────────────
// WeekBlock — «дайджест недели»: что говорили карты за последние
// 7 дней. Числа + бары (детерминированные) + LLM-рефлексия
// голосом активного проводника. Данные тянет сама — запись в
// транскрипте view-only, ничего не хранит.
// ─────────────────────────────────────────────────────────────
import { ScrollText, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as API from '@/lib/api';
import type { HistoryRow } from '@/lib/transcript';
import { buildWeekDigest, WEEK_TOP_CARDS, type WeekDigest } from '@/lib/week';
import { buildWeekScrollText, type ScrollExport } from '@/lib/scroll';
import { PendingLine } from '@/components/arcanum/ProgressLine';
import ProseType from '@/components/arcanum/ProseType';
import { sMenu, sSeal, haptic } from '@/lib/sound';
import deckJson from '@/lib/tarot-deck.json';

/** сегментов в полосе недели — на два короче статистики */
const BAR_SEGMENTS = 10;

interface DeckEntry {
  name: string;
  filename: string;
}
const DECK: DeckEntry[] = deckJson as DeckEntry[];

/** арт карты по имени — filename из колоды */
function cardArtByName(name: string): string | null {
  const hit = DECK.find((c) => c.name === name);
  return hit ? `/cards/${hit.filename}` : null;
}

/** склонение: 1 чтение · 2 чтения · 5 чтений */
function readingsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'чтение';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'чтения';
  return 'чтений';
}

/** склонение: 1 день · 2 дня · 5 дней */
function daysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

/** склонение: 1 раз · 2 раза · 5 раз */
function timesWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'раз';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'раза';
  return 'раз';
}

/** сколько сегментов залить: доля от максимума, минимум один */
function filledSegs(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.round((BAR_SEGMENTS * count) / max));
}

/** ASCII-полоса ▰▱ — визуальный язык статистики, 10 сегментов */
function WeekBar({ filled, label, count, max }: { filled: number; label: string; count: number; max: number }) {
  return (
    <span className="stats-bar" role="img" aria-label={`${label}: ${count} из ${max}`}>
      {Array.from({ length: BAR_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`stats-seg${i < filled ? ' stats-seg--on' : ' stats-seg--off'}`}
          style={{ animationDelay: `${i * 55}ms` }}
        >
          {i < filled ? '▰' : '▱'}
        </span>
      ))}
    </span>
  );
}

interface WeekBlockProps {
  /** активный проводник — его голос рефлексирует неделю */
  characterId: string;
  onRunCmd: (cmd: string) => void;
  /** экспорт свитка недели (буфер + файл) */
  onExportScroll?: (scroll: ScrollExport) => void;
}

export default function WeekBlock({ characterId, onRunCmd, onExportScroll }: WeekBlockProps) {
  const [digest, setDigest] = useState<WeekDigest | null>(null);
  const [failed, setFailed] = useState(false);
  // LLM-рефлексия: null — ждём, строка — готова
  const [reflection, setReflection] = useState<string | null>(null);
  // рефлексия собрана локально, без LLM
  const [reflexFallback, setReflexFallback] = useState(false);

  // загрузка журнала за 7 дней + агрегация + фоновая рефлексия
  useEffect(() => {
    let alive = true;
    API.getReadingsDays(7)
      .then((rows: API.ReadingEntry[]) => {
        if (!alive) return;
        const d = buildWeekDigest(rows as HistoryRow[]);
        setDigest(d);
        // есть что рефлексировать — спрашиваем сразу, фоном
        if (d.total > 0) {
          API.askWeek(
            {
              total: d.total,
              days_active: d.days_active,
              spread_counts: d.spread_counts,
              card_counts: d.card_counts,
              guide_counts: d.guide_counts,
              questions: d.questions,
              date_from: d.date_from,
              date_to: d.date_to,
            },
            characterId,
          )
            .then((r) => {
              if (alive) {
                setReflection(r.answer);
                setReflexFallback(r.fallback === true);
              }
            })
            .catch(() => {
              // рефлексия не дошла — неделя говорит числами, не ошибка
              if (alive) {
                setReflection(null);
                setReflexFallback(false);
              }
            });
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // журнал грузится один раз при появлении записи; смена
    // проводника создаёт новый блок в транскрипте — этот не трогаем
  }, []);

  // пустое состояние: тишина недели — не ошибка
  if (!failed && digest && digest.total === 0) {
    return (
      <section className="week-block" aria-label="дайджест недели">
        <div className="tui-head">
          <span className="tl tl-bright tl-semibold week-title">
            <span className="week-title-glyph" aria-hidden="true">✦</span>
            НЕДЕЛЯ В КАРТАХ
          </span>
          <span className="tl tl-faint week-sub">{digest.date_from} — {digest.date_to} · тишина</span>
        </div>
        <div className="stats-empty">
          <div className="tl tl-comment">за последние 7 дней тишина · карты молчали</div>
          <button
            type="button"
            className="stats-chip"
            onClick={() => {
              sMenu();
              haptic('tick');
              onRunCmd('taro daily');
            }}
          >
            <Sun size={13} strokeWidth={1.75} aria-hidden="true" /> карта дня
          </button>
        </div>
      </section>
    );
  }

  // стаггер секций: каскад 100ms через css-переменную
  const secDelay = (i: number) => ({ '--wk-delay': `${140 + i * 100}ms` } as React.CSSProperties);

  return (
    <section className="week-block" aria-label="дайджест недели">
      <div className="tui-head">
        <span className="tl tl-bright tl-semibold week-title">
          <span className="week-title-glyph" aria-hidden="true">✦</span>
          НЕДЕЛЯ В КАРТАХ
        </span>
        <span className="tl tl-faint week-sub">
          {digest ? `${digest.date_from} — ${digest.date_to} · ${digest.total} ${readingsWord(digest.total)}` : 'последние 7 дней'}
        </span>
      </div>

      {failed && <div className="tl tl-faint stats-pending">журнал недели недоступен · попробуй ещё раз</div>}
      {!failed && !digest && <div className="tl tl-faint stats-pending">считаю карту недели…</div>}

      {digest && digest.total > 0 && (
        <>
          {/* крупные числа: чтения + дни с картами */}
          <div className="stats-hero" style={secDelay(0)}>
            <div className="stats-hero-cell" aria-label="чтений за неделю">
              <span className="stats-num">{digest.total}</span>
              <span className="stats-hero-caption">{readingsWord(digest.total)} за неделю</span>
            </div>
            <div className="stats-hero-cell" aria-label="дней с картами">
              <span className="stats-num">{digest.days_active}</span>
              <span className="stats-hero-caption">{daysWord(digest.days_active)} из 7 с картами</span>
            </div>
          </div>

          {/* расклады: бары от максимума */}
          {Object.keys(digest.spread_counts).length > 0 && (
            <section className="week-sec" style={secDelay(1)} aria-label="чтения недели по раскладам">
              <div className="tl tl-comment stats-section-title">{'// расклады'}</div>
              {(() => {
                // сборка lib-функции сортирует по убыванию — [0] это max
                const entries = Object.entries(digest.spread_counts);
                const max = entries[0][1];
                return entries.map(([label, n]) => (
                  <div key={label} className="stats-row">
                    <span className="stats-row-label" title={label}>{label}</span>
                    <WeekBar filled={filledSegs(n, max)} label={label} count={n} max={max} />
                    <span className="stats-count">{n}</span>
                  </div>
                ));
              })()}
            </section>
          )}

          {/* карта недели: топ-1 — арт с рамкой и свечением */}
          {Object.keys(digest.card_counts).length > 0 && (
            <section className="week-sec" style={secDelay(2)} aria-label="карта недели">
              <div className="tl tl-comment stats-section-title">{'// карта недели'}</div>
              {(() => {
                const entries = Object.entries(digest.card_counts);
                const [topName, topN] = entries[0];
                const rest = entries.slice(1, WEEK_TOP_CARDS);
                const art = cardArtByName(topName);
                return (
                  <>
                    <div className="week-cardrow">
                      {art && (
                        <div className="week-art" role="img" aria-label={`${topName} — карта недели`}>
                          <img src={art} alt={`${topName} — карта недели`} />
                        </div>
                      )}
                      <div className="week-cardinfo">
                        <div className="week-cardname">{topName}</div>
                        <div className="tl tl-faint week-cardmeta">
                          {topN} {timesWord(topN)} за неделю
                        </div>
                      </div>
                    </div>
                    {rest.length > 0 && (
                      <ul className="week-rest" aria-label="частые карты недели">
                        {rest.map(([name, n]) => (
                          <li key={name} className="week-rest-row">
                            <span className="week-rest-name">{name}</span>
                            <span className="week-rest-count" aria-label={`${name}: ${n}`}>{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </section>
          )}

          {/* голоса: маленькие строки */}
          {Object.keys(digest.guide_counts).length > 0 && (
            <section className="week-sec" style={secDelay(3)} aria-label="голоса проводников за неделю">
              <div className="tl tl-comment stats-section-title">{'// голоса'}</div>
              {Object.entries(digest.guide_counts).map(([name, n]) => (
                <div key={name} className="week-voice">
                  <span className="week-voice-name">{name}</span>
                  <span className="week-voice-count">{n} {readingsWord(n)}</span>
                </div>
              ))}
            </section>
          )}

          {/* рефлексия: LLM-абзац голосом проводника */}
          <section className="week-sec week-reflex" style={secDelay(4)} aria-label="рефлексия недели">
            <div className="tl tl-comment stats-section-title">{'// рефлексия'}</div>
            {reflection == null ? (
              <div className="week-reflex-zone">
                <PendingLine label="неделя говорит" />
              </div>
            ) : (
              <div className="week-reflex-answer">
                {reflexFallback && (
                  <div className="tl tl-faint week-reflex-fallback">
                    отражение от колоды (без связи с эфиром)
                  </div>
                )}
                <ProseType text={reflection} />
              </div>
            )}
          </section>

          {/* свиток недели: забрать дайджест с собой */}
          {onExportScroll && (
            <div className="week-fu" style={secDelay(5)}>
              <button
                type="button"
                className="chip reading-fu-chip reading-fu-chip--scroll"
                onClick={() => {
                  sSeal();
                  haptic('tick');
                  onExportScroll(
                    buildWeekScrollText({
                      digest,
                      reflection,
                      characterId,
                    }),
                  );
                }}
                title="дайджест недели — в буфер обмена и файлом"
              >
                <ScrollText size={13} strokeWidth={1.75} aria-hidden="true" />
                переписать в свиток
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
