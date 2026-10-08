'use client';

// ─────────────────────────────────────────────────────────────
// StatsBlock — статистика оператора: серия дней, всего чтений,
// расклады и голоса проводников ASCII-барами ▰▱. Данные тянет
// сама — запись в транскрипте view-only.
// ─────────────────────────────────────────────────────────────
import { Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as API from '@/lib/api';
import { getGuide } from '@/lib/guides';
import { spreadLabelFromType } from '@/lib/transcript';
import { sMenu, haptic } from '@/lib/sound';

/** сегментов в полосе — шире лорометра (там 5, тут 12) */
const BAR_SEGMENTS = 12;
/** сколько строк показывать целиком; больше — только топ */
const MAX_ROWS_ALL = 6;
const TOP_ROWS = 3;

interface StatsRow {
  key: string;
  label: string;
  count: number;
}

/** склонение: 1 день · 2 дня · 5 дней */
function daysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

/** склонение: 1 чтение · 2 чтения · 5 чтений */
function readingsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'чтение';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'чтения';
  return 'чтений';
}

/** сколько сегментов залить: доля от максимума, минимум один */
function filledSegs(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.round((BAR_SEGMENTS * count) / max));
}

/** ASCII-полоса ▰▱ с каскадной заливкой */
function StatsBar({ filled, label, count, max }: { filled: number; label: string; count: number; max: number }) {
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

interface StatsBlockProps {
  onRunCmd: (cmd: string) => void;
}

export default function StatsBlock({ onRunCmd }: StatsBlockProps) {
  const [stats, setStats] = useState<API.OperatorStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    API.getStats()
      .then((s) => {
        if (!alive) return;
        if (s) setStats(s);
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // расклады: сырые типы → русские имена, сортировка по убыванию
  const spreadRows: StatsRow[] = stats?.spreadCounts
    ? Object.entries(stats.spreadCounts)
        .filter(([, n]) => n > 0)
        .map(([type, n]) => ({ key: type, label: spreadLabelFromType(type), count: n }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
    : [];

  // голоса проводников: id → имя, сортировка по убыванию
  const guideRows: StatsRow[] = stats?.guideReadings
    ? Object.entries(stats.guideReadings)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ key: id, label: getGuide(id).name, count: n }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
    : [];

  const spreadMax = spreadRows.length ? spreadRows[0].count : 0;
  const guideMax = guideRows.length ? guideRows[0].count : 0;

  return (
    <div className="stats-block">
      <div className="tui-head">
        <span className="tl tl-bright tl-semibold">СТАТИСТИКА ОПЕРАТОРА</span>
        <span className="tl tl-faint">── сеансы · расклады · голоса ──</span>
      </div>

      {failed && <div className="tl tl-faint stats-pending">статистика недоступна · попробуй ещё раз</div>}
      {!failed && !stats && <div className="tl tl-faint stats-pending">считаю черепа…</div>}

      {stats && stats.totalReadings === 0 && (
        <div className="stats-empty">
          <div className="tl tl-comment">щёлкни первую карту — статистика родится</div>
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
      )}

      {stats && stats.totalReadings > 0 && (
        <>
          {/* крупные числа: серия дней + рассветы + всего чтений */}
          <div className="stats-hero">
            <div className="stats-hero-cell" aria-label="серия дней">
              <span className="stats-num" style={{ animationDelay: '0ms' }}>
                {stats.streakDays}
              </span>
              <span className="stats-hero-caption">
                {stats.streakDays > 0
                  ? `${daysWord(stats.streakDays)} подряд с картой дня`
                  : 'нить не начата'}
              </span>
            </div>
            <div className="stats-hero-cell" aria-label="серия рассветов">
              <span className="stats-num stats-num--dawn" style={{ animationDelay: '90ms' }}>
                {stats.morningStreak ?? 0}
              </span>
              <span className="stats-hero-caption">
                {(stats.morningStreak ?? 0) > 0
                  ? `☀ рассвет${(stats.morningStreak ?? 0) === 1 ? '' : 'а'} до полудня подряд`
                  : '☀ рассветы пока спят'}
              </span>
            </div>
            <div className="stats-hero-cell" aria-label="всего чтений">
              <span className="stats-num" style={{ animationDelay: '180ms' }}>
                {stats.totalReadings}
              </span>
              <span className="stats-hero-caption">
                {readingsWord(stats.totalReadings)} за всё время
              </span>
            </div>
          </div>

          {/* расклады по типам */}
          {spreadRows.length > 0 && (
            <section className="stats-section" aria-label="чтения по раскладам">
              <div className="tl tl-comment stats-section-title">{'// расклады'}</div>
              {(spreadRows.length > MAX_ROWS_ALL ? spreadRows.slice(0, TOP_ROWS) : spreadRows).map((r) => (
                <div key={r.key} className="stats-row">
                  <span className="stats-row-label" title={r.label}>{r.label}</span>
                  <StatsBar filled={filledSegs(r.count, spreadMax)} label={r.label} count={r.count} max={spreadMax} />
                  <span className="stats-count">{r.count}</span>
                </div>
              ))}
            </section>
          )}

          {/* голоса проводников */}
          {guideRows.length > 0 && (
            <section className="stats-section" aria-label="чтения по голосам проводников">
              <div className="tl tl-comment stats-section-title">{'// голоса проводников'}</div>
              {guideRows.map((r) => (
                <div key={r.key} className="stats-row">
                  <span className="stats-row-label" title={r.label}>{r.label}</span>
                  <StatsBar filled={filledSegs(r.count, guideMax)} label={r.label} count={r.count} max={guideMax} />
                  <span className="stats-count">{r.count}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
