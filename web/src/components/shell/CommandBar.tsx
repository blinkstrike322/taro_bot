'use client';

// CommandBar — живая командная строка шелла:
//   shadow@taro:~$ ▊   ← настоящий input
//   + чипы быстрых команд (тап = выполнить)
// В режиме вопроса промпт меняется на «вопрос ▸».
import { useEffect, useRef, useState } from 'react';
import { shellUser } from '@/lib/commands';
import { sEnter, sKey } from '@/lib/sound';

interface CommandBarProps {
  characterId: string;
  busy: boolean;
  pendingQuestion: boolean;
  pendingCards: 1 | 3;
  soundOn: boolean;
  onSubmit: (value: string) => void;
  onCancelPending: () => void;
}

/** основные команды терминала */
const QUICK_CHIPS = [
  'taro daily',
  'taro ask',
  'taro catalog',
  'taro guides',
  'taro history',
];

/** системные — глушше, без стрелки, с пиктограммами */
const SYS_CHIPS = ['taro sound', 'clear', 'help'] as const;

/** пиктограмма для системного чипа (звук — живая, зависит от состояния) */
function sysIcon(chip: string, soundOn: boolean): string {
  if (chip === 'taro sound') return soundOn ? '♪' : '♩';
  if (chip === 'clear') return '⌫';
  if (chip === 'help') return '?';
  return '·';
}

export default function CommandBar({
  characterId,
  busy,
  pendingQuestion,
  pendingCards,
  soundOn,
  onSubmit,
  onCancelPending,
}: CommandBarProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // очистка после отправки — родитель управляет жизненным циклом значения
  useEffect(() => {
    if (!busy) return;
  }, [busy]);

  // вход в режим вопроса — сразу фокусим ввод, чтобы не кликать повторно
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
      handleSubmit();
    } else if (e.key === 'Escape' && pendingQuestion) {
      e.preventDefault();
      onCancelPending();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      sKey();
    }
  };

  const runChip = (chip: string) => {
    if (busy) return;
    sEnter();
    onSubmit(chip);
  };

  const user = shellUser(characterId);

  return (
    <div className="cmdbar">
      {/* строка ввода */}
      <div className="cmdline">
        {pendingQuestion ? (
          <>
            <span className="cd-question">вопрос ▸</span>
            <span className="cd-cards">--cards {pendingCards}</span>
          </>
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
          placeholder={pendingQuestion ? 'что хочешь узнать? ↵ — отправить' : ''}
        />
        {busy && <span className="cd-spinner" aria-hidden="true">⠋</span>}
        {!busy && !value && <span className="cd-cursor blink" aria-hidden="true">▊</span>}
      </div>

      {/* чипы / режим вопроса */}
      {pendingQuestion ? (
        <div className="chips-row">
          <button type="button" className="chip chip--cancel" onClick={onCancelPending}>
            ✕ отмена · esc
          </button>
          <span className="chip-hint">введи вопрос и нажми ↵ · пустая строка — без вопроса</span>
        </div>
      ) : (
        <div className="chips-row">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="chip"
              onClick={() => runChip(chip)}
              disabled={busy}
            >
              <span className="chip-arrow">▸</span> {chip}
            </button>
          ))}
          <span className="chips-sep" aria-hidden="true">│</span>
          {SYS_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`chip chip--sys${chip === 'taro sound' && !soundOn ? ' chip--muted' : ''}`}
              onClick={() => runChip(chip)}
              disabled={busy}
              aria-label={chip}
            >
              <span className="chip-icon">{sysIcon(chip, soundOn)}</span> {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
