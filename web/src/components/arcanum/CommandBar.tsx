'use client';

// ─────────────────────────────────────────────────────────────
// CommandBar — командная строка + чипы быстрых команд.
// Чипы сжаты до контента (flex: 0 0 auto) — уже прежних
// full-width плиток; иконки из открытого банка lucide.
// При нехватке — переносятся, не уезжают за край.
// min-height 42px — тач-таргеты. safe-area учтён.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { Drama, History, LayoutGrid, MessageCircleQuestion, Sun, Volume2, VolumeX, X } from 'lucide-react';
import { shellUser, COMMAND_HINTS } from '@/lib/commands';
import { sEnter, sKey, sMenu, haptic } from '@/lib/sound';

interface CommandBarProps {
  characterId: string;
  busy: boolean;
  pendingQuestion: boolean;
  pendingCards: 1 | 3;
  pendingLabel?: string | null;
  soundOn: boolean;
  onSubmit: (value: string) => void;
  onCancelPending: () => void;
  onToggleSound: () => void;
}

// иконки — lucide (открытый банк, MIT): солнце, вопрос,
// сетка раскладов, маски проводников, журнал-циферблат
const QUICK_CHIPS: { cmd: string; label: string; Icon: typeof Sun }[] = [
  { cmd: 'taro daily', label: 'день', Icon: Sun },
  { cmd: 'taro ask', label: 'спроси', Icon: MessageCircleQuestion },
  { cmd: 'taro catalog', label: 'расклады', Icon: LayoutGrid },
  { cmd: 'taro guides', label: 'проводники', Icon: Drama },
  { cmd: 'taro history', label: 'журнал', Icon: History },
];

export default function CommandBar({
  characterId,
  busy,
  pendingQuestion,
  pendingCards,
  pendingLabel,
  soundOn,
  onSubmit,
  onCancelPending,
  onToggleSound,
}: CommandBarProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // вход в режим вопроса — сразу фокус
  useEffect(() => {
    if (pendingQuestion && !busy) inputRef.current?.focus();
  }, [pendingQuestion, busy]);

  const handleSubmit = () => {
    const v = value;
    setValue('');
    onSubmit(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sEnter();
      haptic('tick');
      handleSubmit();
    } else if (e.key === 'Escape' && pendingQuestion) {
      e.preventDefault();
      onCancelPending();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      sKey();
    }
  };

  const runChip = (cmd: string) => {
    if (busy) return;
    sMenu();
    haptic('tick');
    setValue('');
    onSubmit(cmd);
  };

  const user = shellUser(characterId);

  // подсказки автокомплита по вводу
  const hints =
    !pendingQuestion && !busy && value.trim().length > 1
      ? COMMAND_HINTS.filter((h) => h.startsWith(value.trim().toLowerCase())).slice(0, 3)
      : [];

  return (
    <div className="cmdbar" role="form" aria-label="командная строка">
      {/* строка ввода */}
      <div className="cmdline">
        {pendingQuestion ? (
          pendingLabel ? (
            <span className="cd-question">{pendingLabel} ▸</span>
          ) : (
            <>
              <span className="cd-question">вопрос ▸</span>
              <span className="cd-cards">--cards {pendingCards}</span>
            </>
          )
        ) : (
          <>
            <span className="cd-user">{user}</span>
            <span className="cd-path">:~$</span>
          </>
        )}
        <input
          ref={inputRef}
          className="cmd-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="командная строка"
          placeholder={pendingQuestion ? 'что хочешь узнать? ↵' : 'твой вопрос или команда…'}
        />
        {busy && <span className="cd-spinner" aria-hidden="true">⠋</span>}
        {!busy && !value && <span className="cd-cursor blink" aria-hidden="true">▊</span>}
        {!busy && (
          <button
            type="button"
            className={`cmd-sound${soundOn ? '' : ' cmd-sound--off'}`}
            onClick={() => { onToggleSound(); haptic('tick'); }}
            aria-label={soundOn ? 'выключить звук' : 'включить звук'}
            title="звук терминала"
          >
            {soundOn ? <Volume2 size={14} strokeWidth={1.75} /> : <VolumeX size={14} strokeWidth={1.75} />}
          </button>
        )}
      </div>

      {/* подсказки автокомплита */}
      {hints.length > 0 && (
        <div className="cmd-hints" aria-hidden="true">
          {hints.map((h) => (
            <button key={h} type="button" className="cmd-hint" onClick={() => runChip(h)}>
              {h}
            </button>
          ))}
        </div>
      )}

      {/* чипы / режим вопроса */}
      {pendingQuestion ? (
        <div className="chips-row chips-row--pending">
          <button type="button" className="chip chip--cancel" onClick={onCancelPending}>
            <X size={13} strokeWidth={2} aria-hidden="true" />
            отмена · esc
          </button>
          <span className="chip-hint tl tl-faint">
            {pendingLabel ? '↵ — спросить · esc — отмена' : '↵ — отправить · пустая строка — без вопроса'}
          </span>
        </div>
      ) : (
        <div className="chips-row" role="toolbar" aria-label="быстрые команды">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.cmd}
              type="button"
              className="chip"
              onClick={() => runChip(chip.cmd)}
              disabled={busy}
            >
              <chip.Icon size={13} strokeWidth={1.75} className="chip-icon" aria-hidden="true" />
              <span className="chip-label">{chip.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
