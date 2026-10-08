'use client';

// ─────────────────────────────────────────────────────────────
// MonthBlock — «месяц в картах»: дайджест текущего календарного
// месяца. От недели отличается двумя секциями: полоса дней
// (клетка на каждый день месяца — плотность ритуала видна
// глазом) и баланс аркан (старшие против мастей). Рефлексия —
// голосом активного проводника, свиток — четвёртый тип экспорта.
// Данные тянет сама (окно 62 дня), запись в транскрипте
// view-only, ничего не хранит.
// ─────────────────────────────────────────────────────────────
import { ScrollText, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as API from '@/lib/api';
import type { HistoryRow } from '@/lib/transcript';
import { buildMonthDigest, MONTH_WINDOW_DAYS, MONTH_TOP_CARDS, type MonthDigest } from '@/lib/month';
import { buildMonthScrollText, type ScrollExport } from '@/lib/scroll';
import { PendingLine } from '@/components/arcanum/ProgressLine';
import ProseType from '@/components/arcanum/ProseType';
import { sMenu, sSeal, haptic } from '@/lib/sound';
import deckJson from '@/lib/tarot-deck.json';

/** сегментов в полосе расклада месяца — как у недели */
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

/** ASCII-полоса ▰▱ — единый визуальный язык статистики */
function MonthBar({ filled, label, count, max }: { filled: number; label: string; count: number; max: number }) {
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

interface MonthBlockProps {
  /** активный проводник — его голос рефлексирует месяц */
  characterId: string;
  onRunCmd: (cmd: string) => void;
  /** экспорт свитка месяца (буфер + файл) */
  onExportScroll?: (scroll: ScrollExport) => void;
}

export default function MonthBlock({ characterId, onRunCmd, onExportScroll }: MonthBlockProps) {
  const [digest, setDigest] = useState<MonthDigest | null>(null);
  const [failed, setFailed] = useState(false);
  // LLM-рефлексия: null — ждём, строка — готова
  const [reflection, setReflection] = useState<string | null>(null);
  // рефлексия собрана локально, без LLM
  const [reflexFallback, setReflexFallback] = useState(false);

  // загрузка журнала за 62 дня + фильтр по календарю + рефлексия
  useEffect(() => {
    let alive = true;
    API.getReadingsDays(MONTH_WINDOW_DAYS)
      .then((rows: API.ReadingEntry[]) => {
        if (!alive) return;
        const d = buildMonthDigest(rows as HistoryRow[]);
        setDigest(d);
        // есть что рефлексировать — спрашиваем сразу, фоном
        if (d.total > 0) {
          API.askMonth(
            {
              total: d.total,
              days_active: d.days_active,
              days_in_month: d.days_in_month,
              month_name: d.month_name,
              year: d.year,
              spread_counts: d.spread_counts,
              card_counts: d.card_counts,
              guide_counts: d.guide_counts,
              majors: d.majors,
              suit_counts: d.suit_counts,
              days: d.days,
              questions: d.questions,
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
              // рефлексия не дошла — месяц говорит числами
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

  // пустое состояние: тишина месяца — не ошибка
  if (!failed && digest && digest.total === 0) {
    return (
      <section className="month-block" aria-label="дайджест месяца">
        <div className="tui-head">
          <span className="tl tl-bright tl-semibold month-title">
            <span className="month-title-glyph" aria-hidden="true">✧</span>
            {digest.month_name.toUpperCase()} В КАРТАХ
          </span>
          <span className="tl tl-faint month-sub">{digest.year} · тишина</span>
        </div>
        <div className="stats-empty">
          <div className="tl tl-comment">в {digest.month_name} карты ещё молчали</div>
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
  const secDelay = (i: number) => ({ '--mo-delay': `${140 + i * 100}ms` } as React.CSSProperties);

  // сегодня — какая клетка полосы месяца подсвечена рамкой
  const today = new Date().getDate();

  return (
    <section className="month-block" aria-label="дайджест месяца">
      <div className="tui-head">
        <span className="tl tl-bright tl-semibold month-title">
          <span className="month-title-glyph" aria-hidden="true">✧</span>
          {digest ? `${digest.month_name.toUpperCase()} В КАРТАХ` : 'МЕСЯЦ В КАРТАХ'}
        </span>
        <span className="tl tl-faint month-sub">
          {digest
            ? `${digest.year} · ${digest.total} ${readingsWord(digest.total)}`
            : 'текущий календарный месяц'}
        </span>
      </div>

      {failed && <div className="tl tl-faint stats-pending">журнал месяца недоступен · попробуй ещё раз</div>}
      {!failed && !digest && <div className="tl tl-faint stats-pending">листаю месяц…</div>}

      {digest && digest.total > 0 && (
        <>
          {/* крупные числа: чтения + дни с картами */}
          <div className="stats-hero" style={secDelay(0)}>
            <div className="stats-hero-cell" aria-label="чтений за месяц">
              <span className="stats-num">{digest.total}</span>
              <span className="stats-hero-caption">{readingsWord(digest.total)} за месяц</span>
            </div>
            <div className="stats-hero-cell" aria-label="дней с картами">
              <span className="stats-num">{digest.days_active}</span>
              <span className="stats-hero-caption">{daysWord(digest.days_active)} из {digest.days_in_month} с картами</span>
            </div>
          </div>

          {/* полоса дней: клетка на каждый день месяца */}
          <section className="month-sec" style={secDelay(1)} aria-label="дни месяца">
            <div className="tl tl-comment stats-section-title">{'// дни'}</div>
            <div
              className="mo-strip"
              role="img"
              aria-label={`плотность чтений по дням: ${digest.days_active} из ${digest.days_in_month} дней с картами`}
            >
              {digest.days.map((d) => (
                <span
                  key={d.day}
                  className={[
                    'mo-cell',
                    d.count > 0 ? 'mo-cell--on' : 'mo-cell--off',
                    d.count > 3 ? 'mo-cell--loud' : '',
                    d.day === today ? 'mo-cell--today' : '',
                  ].join(' ')}
                  style={{ animationDelay: `${d.day * 14}ms` }}
                  title={d.count > 0 ? `${d.day} — ${d.count} ${readingsWord(d.count)}` : `${d.day} — тишина`}
                >
                  {d.count > 3 ? '◆' : d.count > 0 ? '▪' : '·'}
                </span>
              ))}
            </div>
            <div className="tl tl-faint mo-strip-note">
              {digest.days_in_month} дней · ▪ чтение было · ◆ день был густым
            </div>
          </section>

          {/* баланс аркан: старшие против мастей */}
          {(digest.majors > 0 || Object.keys(digest.suit_counts).length > 0) && (
            <section className="month-sec" style={secDelay(2)} aria-label="баланс аркан">
              <div className="tl tl-comment stats-section-title">{'// баланс аркан'}</div>
              <div className="mo-arcana">
                <span className="mo-arcana-major">
                  <span className="mo-arcana-num">{digest.majors}</span>
                  <span className="mo-arcana-word">старших</span>
                </span>
                <span className="mo-arcana-sep" aria-hidden="true">·</span>
                {Object.entries(digest.suit_counts).map(([suit, n]) => (
                  <span key={suit} className="mo-arcana-suit">
                    <span className="mo-arcana-num">{n}</span>
                    <span className="mo-arcana-word">{suit}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* расклады: бары от максимума */}
          {Object.keys(digest.spread_counts).length > 0 && (
            <section className="month-sec" style={secDelay(3)} aria-label="чтения месяца по раскладам">
              <div className="tl tl-comment stats-section-title">{'// расклады'}</div>
              {(() => {
                const entries = Object.entries(digest.spread_counts);
                const max = entries[0][1];
                return entries.map(([label, n]) => (
                  <div key={label} className="stats-row">
                    <span className="stats-row-label" title={label}>{label}</span>
                    <MonthBar filled={filledSegs(n, max)} label={label} count={n} max={max} />
                    <span className="stats-count">{n}</span>
                  </div>
                ));
              })()}
            </section>
          )}

          {/* карта месяца: топ-1 — арт с рамкой */}
          {Object.keys(digest.card_counts).length > 0 && (
            <section className="month-sec" style={secDelay(4)} aria-label="карта месяца">
              <div className="tl tl-comment stats-section-title">{'// карта месяца'}</div>
              {(() => {
                const entries = Object.entries(digest.card_counts);
                const [topName, topN] = entries[0];
                const rest = entries.slice(1, MONTH_TOP_CARDS);
                const art = cardArtByName(topName);
                return (
                  <>
                    <div className="week-cardrow">
                      {art && (
                        <div className="week-art" role="img" aria-label={`${topName} — карта месяца`}>
                          <img src={art} alt={`${topName} — карта месяца`} />
                        </div>
                      )}
                      <div className="week-cardinfo">
                        <div className="week-cardname">{topName}</div>
                        <div className="tl tl-faint week-cardmeta">
                          {topN} {timesWord(topN)} за месяц
                        </div>
                      </div>
                    </div>
                    {rest.length > 0 && (
                      <ul className="week-rest" aria-label="частые карты месяца">
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
            <section className="month-sec" style={secDelay(5)} aria-label="голоса проводников за месяц">
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
          <section className="month-sec week-reflex" style={secDelay(6)} aria-label="рефлексия месяца">
            <div className="tl tl-comment stats-section-title">{'// рефлексия'}</div>
            {reflection == null ? (
              <div className="week-reflex-zone">
                <PendingLine label="месяц говорит" />
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

          {/* свиток месяца: забрать дайджест с собой */}
          {onExportScroll && (
            <div className="week-fu" style={secDelay(7)}>
              <button
                type="button"
                className="chip reading-fu-chip reading-fu-chip--scroll"
                onClick={() => {
                  sSeal();
                  haptic('tick');
                  onExportScroll(
                    buildMonthScrollText({
                      digest,
                      reflection,
                      characterId,
                    }),
                  );
                }}
                title="дайджест месяца — в буфер обмена и файлом"
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
