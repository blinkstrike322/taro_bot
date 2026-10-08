'use client';

// ─────────────────────────────────────────────────────────────
// MotdBlock — сообщение дня: приветствие проводника + быстрые
// зацепки. Над чипами — ритуал дня: баннер-призыв, если карта
// дня ещё не вытянута, скромная строка, если свершён.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { BookOpen, LayoutGrid, Sun } from 'lucide-react';
import { getGuide } from '@/lib/guides';
import { sMenu, sRitual } from '@/lib/sound';
import Typewriter from '@/components/arcanum/Typewriter';

interface MotdBlockProps {
  characterId: string;
  onRunCmd: (cmd: string) => void;
  streak?: number;
  /** ритуал дня: true — карта дня уже вытянута сегодня, null — не знаем */
  dailyDone?: boolean | null;
  /** серия рассветов: карты дня до полудня, подряд */
  morningStreak?: number;
  /** сегодняшний ритуал был до полудня */
  morningToday?: boolean | null;
}

/** приглашение голосом проводника: карта дня ждёт */
const DAILY_INVITES: Record<string, string> = {
  shadow_walker: 'карта дня ещё спит в колоде — разбуди её',
  ruin_keeper: 'сегодняшний аркан не поднят из камня — подними',
  spark_of_chaos: 'карта дня скучает без тебя — так нечестно',
};
const INVITE_FALLBACK = 'карта дня ждёт первого взгляда';

export default function MotdBlock({ characterId, onRunCmd, streak, dailyDone, morningStreak, morningToday }: MotdBlockProps) {
  const guide = getGuide(characterId);
  const greeting = guide.greetings[Math.floor(Math.random() * guide.greetings.length)];
  const invite = DAILY_INVITES[characterId] ?? INVITE_FALLBACK;
  /** мини-игра «рассвет»: окно до полудня открыто прямо сейчас */
  const beforeNoon = new Date().getHours() < 12;

  // призыв ритуала: два тихих колокола, единожды при появлении баннера
  const ritualPlayedRef = useRef(false);
  useEffect(() => {
    if (dailyDone === false && !ritualPlayedRef.current) {
      ritualPlayedRef.current = true;
      sRitual();
    }
  }, [dailyDone]);

  const run = (cmd: string) => {
    sMenu();
    onRunCmd(cmd);
  };

  return (
    <div className="motd-block">
      <div className="motd-greet">
        <Typewriter text={greeting} className="tl tl-accent" sound />
      </div>
      <div className="motd-hint tl tl-faint">
        введи вопрос ниже · или тапни команду
      </div>

      {/* ритуал дня: null — молчим (не знаем — не врём) */}
      {dailyDone === false && (
        <div className="rit-banner" role="status" aria-label="сегодняшний ритуал не свершён">
          <span className="rit-glyph" aria-hidden="true">☀</span>
          <div className="rit-body">
            <div className="rit-title">сегодняшний ритуал не свершён</div>
            <div className="rit-invite">{invite}</div>
            {/* мини-игра «рассвет»: до полудня баннер подсказывает,
                что серия утренних ритуалов сейчас может вырасти */}
            {beforeNoon && (
              <div className="rit-dawn-hint tl tl-comment">
                ☀ до полудня — успей поймать рассвет
                {(morningStreak ?? 0) > 0 ? ` · серия ${morningStreak}` : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            className="rit-chip"
            onClick={() => run('taro daily')}
          >
            <Sun size={13} strokeWidth={1.75} aria-hidden="true" /> тянуть карту дня
          </button>
        </div>
      )}
      {dailyDone === true && (
        <div
          className={`rit-done tl tl-comment${morningToday ? ' rit-done--dawn' : ''}`}
          role="status"
        >
          ритуал дня свершён ☀
          {morningToday
            ? ` · рассвет пойман${(morningStreak ?? 0) > 1 ? ` · серия ${morningStreak}` : ''}`
            : (morningStreak ?? 0) > 0
              ? ` · полдень прошёл, серия рассветов замерла на ${morningStreak}`
              : ''}
        </div>
      )}

      <div className="motd-actions">
        <button type="button" className="motd-chip" onClick={() => run('taro daily')}>
          <Sun size={13} strokeWidth={1.75} aria-hidden="true" /> карта дня
        </button>
        <button type="button" className="motd-chip" onClick={() => run('taro catalog')}>
          <LayoutGrid size={13} strokeWidth={1.75} aria-hidden="true" /> расклады
        </button>
        <button type="button" className="motd-chip" onClick={() => run('taro library')}>
          <BookOpen size={13} strokeWidth={1.75} aria-hidden="true" /> библиотека
        </button>
        {streak != null && streak > 1 && (
          <span className="motd-streak tl tl-comment">нить дней: {streak}</span>
        )}
      </div>
    </div>
  );
}
