'use client';

// CommandBar — живая командная строка шелла:
//   shadow@taro:~$ ▊   ← настоящий input
//   + чипы быстрых команд (тап = выполнить)
// В режиме вопроса промпт меняется на «вопрос ▸».
import { useEffect, useRef, useState } from 'react';
import { shellUser } from '@/lib/commands';

interface CommandBarProps {
  characterId: string;
  busy: boolean;
  pendingQuestion: boolean;
  pendingCards: 1 | 3;
  onSubmit: (value: string) => void;
  onCancelPending: () => void;
}

const QUICK_CHIPS = [
  'taro daily',
  'taro ask',
  'taro catalog',
  'taro guides',
  'taro history',
  'help',
];

export default function CommandBar({
  characterId,
  busy,
  pendingQuestion,
  pendingCards,
  onSubmit,
  onCancelPending,
}: CommandBarProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // очистка после отправки — родитель управляет жизненным циклом значения
  useEffect(() => {
    if (!busy) return;
  }, [busy]);

  const handleSubmit = () => {
    const v = value;
    setValue('');
    onSubmit(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && pendingQuestion) {
      e.preventDefault();
      onCancelPending();
    }
  };

  const runChip = (chip: string) => {
    if (busy) return;
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
        </div>
      )}
    </div>
  );
}
