'use client';

// ─────────────────────────────────────────────────────────────
// SplashIntro v3 — заставка открытия ARCANUM: каноническая печать
// (пентакль) + вордмарк. Премиальная хореография без рывков:
// всё рисуется, вспыхивает и СТРУИТСЯ — а в финале заставка не
// «переключается» на терминал, а ПЕРЕТЕКАЕТ в него:
//
//   · печать расширяется и гаснет ровно в то место, где её ждёт
//     ambient-сигил терминала (тот же глиф, тот же центр);
//   · вордмарк «АРКАНУМ» летит вверх и садится точно в заголовок
//     бут-записи (FLIP-измерение реального элемента);
//   · эстафета заканчивается событием «arcanum:word-land» —
//     настоящий заголовок вспыхивает на месте прилёта.
//
// Хронометраж:
//   0.00  прогрев трубки (#000 → #05040f), нить кинескопа
//   0.08  бисерная «звёздная карта» втекает по кругу
//   0.30  среднее кольцо с разрывами прочерчивается
//   0.43  внутреннее пунктирное кольцо; 0.50 риски
//   0.50  пунктирный спутник замка (встречный ход)
//   0.62  ПЕНТАГРАММА: один непрерывный штрих + комета-перо
//         с шёпотом блума (главный такт, 0.88 с)
//   1.42  круг-замок замыкает пентакль
//   1.50  печати стихий распускаются по вершинам (5 × 65 мс)
//   1.72  полумесяц Жрицы; 1.80 кардинальные звёзды, сердце-круг
//   1.93  сердце-искра вспыхивает АКЦЕНТОМ проводника + блум
//   2.05  «АРКАНУМ»: трекинг сходится, blur уходит
//   2.28  подзаголовок «— оккультный терминал —», линейки растут
//   2.65  ЭСТАФЕТА: терминал оживает под пеленой
//         · печать: 1.15 с expand+dim → место ambient-сигила
//         · вордмарк: ~1.05 с полёт → заголовок бут-записи
//         · пелена (фон/свет/горизонт/зерно/виньетка) тает 0.7 с,
//           дым — 1.25 с; пыль всплывает и разрежается 1.6 с
//           (уход — анимация, не срез: бесконечное мерцание жило
//           на opacity и перебивало transition, из-за этого пыль
//           раньше срезалась демонтажем заставки). Часть пылинок
//           остаётся в терминале — terminal-dust принимает эстафету
//   ~3.9  прилёт → crossfade на настоящий заголовок → demount
//
// Тап — доскок: проявления доскакивают до конца (1 мс), эстафета
// в быстром темпе (~0.7 с). prefers-reduced-motion — всё статично,
// эстафета мгновенная.
//
// ОПТИКА · фосфор: заставка включается в том же покрытии фосфора,
// что и терминал — ДВА пути, один фильтр: (1) первичный —
// блокирующий инлайн-скрипт layout'а (PHOSPHOR_BOOT) ставит
// data-splash-theme на <html> ДО первой краски (anti-FOUC,
// паттерн next-themes) — фиолетовой вспышки окна SSR→гидрация
// нет; (2) дублирующий — класс theme-* на корне .splash из
// rAF-дефера React (тот же state, что у .crt).
//
// ОПТИКА · проводник: его палитру (--guide-accent/-dim/-glow)
// тоже ставит PHOSPHOR_BOOT — на <html> до первой краски, из
// taro_character. Сердце-искра, ореол, дым света и шёпот
// вордмарка берут цвет СОХРАНЁННОГО проводника с первого кадра;
// здесь инлайновых вар-оверрайдов НЕТ — иначе React-стейт
// (до rAF-дефера — дефолтная Странница) перекрыл бы правильные
// значения корня лавандой, а смена characterId в середине
// анимации перекрашивала бы сцену на лету. Акцент проходит
// сквозь фильтр фосфора — вариации под серебро/костёр/пепел
// получаются автоматически, как в терминале.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSigilGlyph } from '@/components/arcanum/sigilGlyph';
import { haptic } from '@/lib/sound';

interface SplashIntroProps {
  /** проводник: его акцент красит сердце-искру и ореол */
  characterId: string;
  /** покрытие фосфора: заставка включается в той же оптике,
   *  что и терминал (classic = без фильтра) */
  themeId?: string;
  /** терминал может начинать бут под пеленой */
  onReveal: () => void;
  /** эстафета завершена — размонтировать */
  onVanish: () => void;
}

/** буст яркости: ambient-прозрачности 0.04–0.10 здесь ×7 */
const SPLASH_BOOST = 7;
/** старт эстафеты, мс */
const HANDOFF_AT = 2650;
/** полёт вордмарка к заголовку, мс (быстрый — после тапа) */
const TRAVEL = 1050;
const TRAVEL_FAST = 520;
/** посадка печати в ambient-слой, мс */
const SETTLE = 1150;
const SETTLE_FAST = 640;

/** порядок проявления штрихов печати: k → [задержка, длительность] */
const REVEAL: Record<string, [number, number]> = {
  beads: [80, 700],
  'ring-outer': [300, 560],
  'ring-inner': [430, 640],
  'ring-seal-dash': [500, 620],
  ticks: [520, 380],
  penta: [620, 880],
  'ring-seal': [1420, 380],
  crescent: [1720, 300],
  'star-h': [1800, 280],
  'star-v': [1800, 280],
  'core-ring': [1810, 260],
};
/** печати стихий: база + шаг × номер вершины */
const VERTEX_BASE = 1500;
const VERTEX_STEP = 65;

export default function SplashIntro({ characterId, themeId, onReveal, onVanish }: SplashIntroProps) {
  const glyph = useMemo(() => buildSigilGlyph(`splash·${characterId}`), [characterId]);
  const pentaPath = useMemo(
    () => glyph.strokes.find((s) => s.k === 'penta')?.d ?? '',
    [glyph],
  );

  const [handoff, setHandoff] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [landed, setLanded] = useState(false);
  const [flipVars, setFlipVars] = useState<Record<string, string>>({});
  const phaseRef = useRef<'play' | 'out'>('play');
  const landedRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const revealedRef = useRef(false);
  const sigilRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /** посадка вордмарка: событие для бут-заголовка + само-растворение.
   *  реф-гард: страховочный таймер не продублирует animationend */
  const landWord = useCallback(() => {
    if (landedRef.current) return;
    landedRef.current = true;
    setLanded(true);
    window.dispatchEvent(new CustomEvent('arcanum:word-land'));
    later(onVanish, 360);
  }, [onVanish]);

  /** ── эстафета: терминал оживает, печать и слово перетекают ── */
  const beginHandoff = useCallback(
    (fast: boolean) => {
      if (phaseRef.current !== 'play') return;
      phaseRef.current = 'out';
      if (!revealedRef.current) {
        revealedRef.current = true;
        onReveal(); // бут-запись + ambient-сигил монтируются под пеленой
      }
      haptic('tick');

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        // без движения: показать терминал сразу, слово не летит
        later(landWord, 120);
        later(onVanish, 420);
        setHandoff(true);
        return;
      }

      // два кадра — React уже закоммитил бут-запись, меряем цели
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (phaseRef.current !== 'out') return;
          const vars: Record<string, string> = {};

          // вордмарк → заголовок бут-записи (FLIP)
          const target = document.querySelector<HTMLElement>('.boot-logo-word');
          const word = wordRef.current;
          if (target && word) {
            const a = word.getBoundingClientRect();
            const b = target.getBoundingClientRect();
            vars['--wx'] = `${(b.left + b.width / 2 - (a.left + a.width / 2)).toFixed(1)}px`;
            vars['--wy'] = `${(b.top + b.height / 2 - (a.top + a.height / 2)).toFixed(1)}px`;
            vars['--ws'] = (b.height / Math.max(1, a.height)).toFixed(4);
          } else {
            vars['--wx'] = '0px';
            vars['--wy'] = `${(-window.innerHeight * 0.28).toFixed(0)}px`;
            vars['--ws'] = '0.92';
          }

          // печать → центр трубки, размер ambient-сигила
          const sig = sigilRef.current;
          const ambient = Math.min(640, window.innerWidth * 0.96);
          if (sig) {
            const r = sig.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            vars['--sx'] = `${(window.innerWidth / 2 - cx).toFixed(1)}px`;
            vars['--sy'] = `${(window.innerHeight / 2 - cy).toFixed(1)}px`;
            vars['--ss'] = (ambient / Math.max(1, r.width)).toFixed(4);
          } else {
            vars['--ss'] = '1.9';
          }

          setFlipVars(vars);
          setHandoff(true); // запускает CSS-перелёты

          // страховка: если animationend не случился (reduced и т.п.)
          const travel = fast ? TRAVEL_FAST : TRAVEL;
          later(landWord, travel + 420);
        }),
      );
    },
    [landWord, onReveal, onVanish],
  );

  /** доскок: проявления доскакивают, эстафета в быстром темпе */
  const skip = useCallback(() => {
    if (phaseRef.current !== 'play' || skipped) return;
    setSkipped(true);
    later(() => beginHandoff(true), 70);
  }, [beginHandoff, skipped]);

  useEffect(() => {
    later(() => beginHandoff(false), HANDOFF_AT);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  /** прилёт вордмарка — по окончании анимации полёта */
  const onWordFlyEnd = (e: React.AnimationEvent) => {
    if (e.animationName !== 'sp-word-fly') return;
    landWord();
  };

  // фосфор заставки — тот же класс, что и у .crt: одна оптика
  // на трубку и её рождение (classic = без фильтра, как в CrtOverlay)
  const themeClass = themeId && themeId !== 'classic' ? ` theme-${themeId}` : '';

  // ── рендер штрихов: класс проявления по типу хода ──
  const counters = new Map<string, number>();
  const revealOf = (k?: string): [number, number] => {
    if (k === 'vertex') {
      const n = counters.get('vertex') ?? 0;
      counters.set('vertex', n + 1);
      return [VERTEX_BASE + n * VERTEX_STEP, 240];
    }
    return REVEAL[k ?? ''] ?? [900, 400];
  };

  /** задержки считаются ОДИН раз — их использует и печать, и её
   *  световая копия (свет синхронен штрихам до миллисекунды) */
  const reveals = glyph.strokes.map((s) => revealOf(s.k));
  const revealAnim = (s: { dash?: string; k?: string }): string =>
    s.dash
      ? s.k === 'beads' ? 'sp-beadsin' : 'sp-dashin'
      : s.k === 'vertex'
        ? 'sp-pop'
        : 'sp-draw';

  return (
    <div
      className={
        `splash${themeClass}${handoff ? ' splash--out' : ''}${skipped ? ' splash--skip' : ''}` +
        `${landed ? ' splash--landed' : ''}`
      }
      style={{ ...flipVars } as React.CSSProperties}
      onClick={skip}
      role="presentation"
    >
      {/* дальний план: чернильная база + угловые смывы индио */}
      <div className="sp-bg" aria-hidden="true" />
      {/* вспышка включения — горизонтальная нить кинескопа */}
      <div className="sp-flash" aria-hidden="true" />
      {/* средний план: источник света за печатью — дышит (screen) */}
      <div className="sp-glow" aria-hidden="true" />
      {/* воздух камеры: туманность глубины (soft-light) */}
      <div className="sp-haze" aria-hidden="true" />
      {/* ближний план: серебряный горизонт в нижней трети */}
      <div className="sp-horizon" aria-hidden="true" />
      {/* пыль в луче света: объёмная среда за печатью */}
      <div className="sp-smoke" aria-hidden="true" />
      {/* пылинки в луче: мерцают за печатью */}
      <div className="sp-motes" aria-hidden="true" />

      {/* сцена: печать + вордмарк */}
      <div className="sp-stage">
        <div className="sp-sigil" ref={sigilRef} aria-hidden="true">
          <div className="sp-halo" />
          {/* вспышка блума в момент возжигания сердца-искры */}
          <div className="sp-haloflash" />

          {/* световой обхват: зеркальная копия печати — те же ходы,
              шире и приглушённее; геометрия СВЕТИТ воздух за собой,
              свет повторяет форму печати (та же хореография — свет
              появляется вместе со штрихом, а не после него) */}
          <svg viewBox="0 0 400 400" fill="none" className="sp-bloom" aria-hidden="true">
            {glyph.strokes.map((s, i) => {
              const [del, dur] = reveals[i];
              return (
                <path
                  key={`b${i}`}
                  d={s.d}
                  className={(s.ink === 'accent' ? 'sig-ink-accent' : 'sig-ink-pale') + ` ${revealAnim(s)}`}
                  strokeWidth={s.w * 2.6}
                  strokeOpacity={Math.min(1, s.o * SPLASH_BOOST * 0.5)}
                  strokeDasharray={s.dash ?? undefined}
                  strokeLinecap={s.cap ?? undefined}
                  pathLength={s.dash ? undefined : 1}
                  style={{ '--del': `${del}ms`, '--dur': `${dur}ms` } as React.CSSProperties}
                />
              );
            })}

            {pentaPath && (
              <path
                d={pentaPath}
                className="sig-ink-pale sp-draw"
                strokeWidth={12}
                strokeOpacity={0.5}
                pathLength={1}
                style={{ '--del': '620ms', '--dur': '880ms' } as React.CSSProperties}
              />
            )}

            {glyph.dots.map((d, i) => (
              <circle
                key={`bd${i}`}
                cx={d.x}
                cy={d.y}
                r={d.r * 1.9}
                className={`${d.ink === 'accent' ? 'sig-ink-accent-fill' : 'sig-ink-pale-fill'} sp-fade`}
                fillOpacity={Math.min(1, d.o * SPLASH_BOOST * 0.6)}
                stroke="none"
                style={{ '--del': `${1750 + (i % 2) * 90}ms`, '--dur': '320ms' } as React.CSSProperties}
              />
            ))}

            {glyph.shapes.map((s, i) => (
              <path
                key={`bs${i}`}
                d={s.d}
                className={`${s.ink === 'accent' ? 'sig-fill-accent' : 'sig-fill-pale'} sp-ignite`}
                fillOpacity={Math.min(1, s.o * SPLASH_BOOST * 0.55)}
                stroke="none"
                style={{ '--del': '1930ms', '--dur': '340ms' } as React.CSSProperties}
              />
            ))}
          </svg>

          <svg viewBox="0 0 400 400" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {glyph.strokes.map((s, i) => {
              const [del, dur] = reveals[i];
              const anim = revealAnim(s);
              return (
                <path
                  key={`p${i}`}
                  d={s.d}
                  className={(s.ink === 'accent' ? 'sig-ink-accent' : 'sig-ink-pale') + ` ${anim}`}
                  strokeWidth={s.w}
                  strokeOpacity={Math.min(1, s.o * SPLASH_BOOST)}
                  strokeDasharray={s.dash ?? undefined}
                  strokeLinecap={s.cap ?? undefined}
                  pathLength={s.dash ? undefined : 1}
                  style={{ '--del': `${del}ms`, '--dur': `${dur}ms` } as React.CSSProperties}
                />
              );
            })}

            {/* свечение-шлейф пентаграммы: тот же ход шире и мягче,
                рисуется синхронно со штрихом — перо светится */}
            {pentaPath && (
              <path
                d={pentaPath}
                className="sig-ink-pale sp-draw sp-penta-glow"
                strokeWidth={7}
                pathLength={1}
                style={{ '--del': '620ms', '--dur': '880ms' } as React.CSSProperties}
              />
            )}

            {/* комета-перо: искра бежит по ходу пентаграммы */}
            {pentaPath && (
              <circle
                r={3}
                className="sp-comet"
                style={
                  {
                    offsetPath: `path("${pentaPath}")`,
                    '--del': '620ms',
                    '--dur': '880ms',
                  } as React.CSSProperties
                }
              />
            )}

            {glyph.dots.map((d, i) => (
              <circle
                key={`d${i}`}
                cx={d.x}
                cy={d.y}
                r={d.r}
                className={`${d.ink === 'accent' ? 'sig-ink-accent-fill' : 'sig-ink-pale-fill'} sp-fade`}
                fillOpacity={Math.min(1, d.o * SPLASH_BOOST)}
                stroke="none"
                style={{ '--del': `${1750 + (i % 2) * 90}ms`, '--dur': '320ms' } as React.CSSProperties}
              />
            ))}

            {/* сердце-искра: звезда цветом проводника */}
            {glyph.shapes.map((s, i) => (
              <path
                key={`s${i}`}
                d={s.d}
                className={`${s.ink === 'accent' ? 'sig-fill-accent' : 'sig-fill-pale'} sp-ignite`}
                fillOpacity={Math.min(1, s.o * SPLASH_BOOST)}
                stroke="none"
                style={{ '--del': '1930ms', '--dur': '340ms' } as React.CSSProperties}
              />
            ))}
          </svg>
        </div>

        {/* вордмарк: гарнитура и стиль — 1:1 заголовок бут-записи */}
        <div className="sp-wordwrap" ref={wordRef} onAnimationEnd={onWordFlyEnd}>
          <div className="sp-word" aria-label="АРКАНУМ">АРКАНУМ</div>
        </div>
        <div className="sp-sub" aria-hidden="true">
          <span className="sp-rule" />
          <span className="sp-subtext">оккультный терминал</span>
          <span className="sp-rule" />
        </div>
      </div>

      {/* материя плёнки: зерно 35мм + виньетка глубокого индио */}
      <div className="sp-grain" aria-hidden="true" />
      <div className="sp-vignette" aria-hidden="true" />
    </div>
  );
}
