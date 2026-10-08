'use client';

// ─────────────────────────────────────────────────────────────
// HoroscopeBlock — «ПРОГНОЗ ДНЯ»: план дня, выведенный из карты
// дня. Лозунг крупно, три времени суток, фокус, три шкалы ▰▱
// (тонус/удача/общение) и «глоток» — маленький поступок. Пока
// прогноз собирается — шёпот-ожидание с нитью. Каскад секций,
// как у чтения; арт карты — миниатюрой в шапке.
// ─────────────────────────────────────────────────────────────
import { ScrollText } from 'lucide-react';
import type { Entry } from '@/lib/transcript';
import { getGuide } from '@/lib/guides';
import { buildForecastScrollText, type ScrollExport } from '@/lib/scroll';
import { sSeal, haptic } from '@/lib/sound';

interface HoroscopeBlockProps {
  entry: Extract<Entry, { kind: 'forecast' }>;
  characterId: string;
  /** экспорт свитка прогноза (буфер + файл) */
  onExportScroll?: (scroll: ScrollExport) => void;
}

/** строка-шкала: ▰▱ + число (каскад сегментов, как статистика) */
function Scale({ label, value, delay }: { label: string; value: number; delay: number }) {
  return (
    <div className="fc-scale" role="img" aria-label={`${label}: ${value} из 10`}>
      <span className="fc-scale-label tl">{label}</span>
      <span className="stats-bar">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`stats-seg${i < value ? ' stats-seg--on' : ' stats-seg--off'}`}
            style={{ animationDelay: `${delay + i * 45}ms` }}
          >
            {i < value ? '▰' : '▱'}
          </span>
        ))}
      </span>
      <span className="fc-scale-val tl">{value}</span>
    </div>
  );
}

export default function HoroscopeBlock({ entry, characterId, onExportScroll }: HoroscopeBlockProps) {
  const guide = getGuide(characterId);
  const f = entry.forecast;
  // якорь дня: «07 окт · среда» — прогноз привязан к сегодняшнему
  const dayStamp = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  });

  // прогноз ещё в полёте: шёпот-нить ожидания
  if (!f) {
    return (
      <section className="forecast-block frame-ritual" aria-label="прогноз дня — собирается">
        <span className="corner corner-tl" aria-hidden="true">╔</span>
        <span className="corner corner-tr" aria-hidden="true">┐</span>
        <span className="corner corner-bl" aria-hidden="true">└</span>
        <span className="corner corner-br" aria-hidden="true">╝</span>
        <header className="fc-head">
          <span className="fc-title">ПРОГНОЗ ДНЯ</span>
          <span className="fc-sub tl tl-faint">{dayStamp} · по карте «{entry.cardName}»</span>
        </header>
        <div className="fc-pending" aria-live="polite">
          {entry.failed ? (
            <>
              <span className="fc-pending-glyph tl tl-err" aria-hidden="true">✕</span>
              <span className="tl tl-faint">
                прогноз не собрался · канал был занят — чип на чтении попробует снова
              </span>
            </>
          ) : (
            <>
              <span className="fc-pending-spin" aria-hidden="true">◌</span>
              <span className="tl tl-faint">день выведывается из карты…</span>
            </>
          )}
        </div>
      </section>
    );
  }

  const times: Array<[string, string]> = [
    ['утро', f.утро],
    ['день', f.день],
    ['вечер', f.вечер],
  ];

  return (
    <section className="forecast-block frame-ritual" aria-label="прогноз дня">
      <span className="corner corner-tl" aria-hidden="true">╔</span>
      <span className="corner corner-tr" aria-hidden="true">┐</span>
      <span className="corner corner-bl" aria-hidden="true">└</span>
      <span className="corner corner-br" aria-hidden="true">╝</span>

      <header className="fc-head">
        <span className="fc-title">☀ ПРОГНОЗ ДНЯ</span>
        <span className="fc-sub tl tl-faint">
          {dayStamp} · по карте «{entry.cardName}»{entry.reversed ? ' · перевёрнутой' : ''}
        </span>
      </header>

      {/* лозунг дня — крупно, серифом, с дыханием */}
      <div className="fc-slogan">
        <span className="fc-slogan-quote" aria-hidden="true">«</span>
        {f.лозунг}
        <span className="fc-slogan-quote" aria-hidden="true">»</span>
      </div>

      {/* мини-арт карты дня */}
      {entry.cardImage && (
        <div className="fc-art">
          <img
            src={entry.cardImage}
            alt={entry.cardName}
            className={`fc-art-img${entry.reversed ? ' fc-art-img--rev' : ''}`}
            loading="lazy"
          />
        </div>
      )}

      {/* три времени суток */}
      <ul className="fc-times">
        {times.map(([label, text], i) => (
          <li key={label} className="fc-time" style={{ animationDelay: `${260 + i * 140}ms` }}>
            <span className="fc-time-label">{label}</span>
            <span className="fc-time-text tl">{text}</span>
          </li>
        ))}
      </ul>

      {/* фокус дня */}
      <div className="fc-focus" style={{ animationDelay: '700ms' }}>
        <span className="fc-focus-label">фокус</span>
        <span className="fc-focus-text">{f.фокус}</span>
      </div>

      {/* шкалы дня */}
      <div className="fc-scales">
        <Scale label="тонус" value={f.тонус} delay={820} />
        <Scale label="удача" value={f.удача} delay={900} />
        <Scale label="общение" value={f.общение} delay={980} />
      </div>

      {/* глоток: маленький конкретный поступок */}
      <div className="fc-sip" style={{ animationDelay: '1080ms' }}>
        <span className="fc-sip-label">{'// глоток дня'}</span>
        <span className="fc-sip-text">{f.глоток}</span>
      </div>

      {entry.fallback && (
        <div className="fc-fallback tl tl-faint">
          {'// отражение от колоды (без связи с эфиром)'}
        </div>
      )}

      {/* свиток прогноза: забрать план дня с собой */}
      {onExportScroll && (
        <div className="fc-fu">
          <button
            type="button"
            className="chip reading-fu-chip reading-fu-chip--scroll"
            onClick={() => {
              sSeal();
              haptic('tick');
              onExportScroll(
                buildForecastScrollText({
                  cardName: entry.cardName,
                  reversed: entry.reversed,
                  forecast: f,
                  fallback: entry.fallback,
                  characterId,
                }),
              );
            }}
            title="план дня — в буфер обмена и файлом"
          >
            <ScrollText size={13} strokeWidth={1.75} aria-hidden="true" />
            переписать в свиток
          </button>
        </div>
      )}

      <div className="fc-foot tl tl-faint">
        {guide.tag} · {guide.name}
      </div>
    </section>
  );
}
