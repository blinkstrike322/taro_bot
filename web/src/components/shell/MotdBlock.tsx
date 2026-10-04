'use client';

// MotdBlock — message of the day: ASCII-логотип + тапабельные команды.
// Тап по строке = выполнить команду: меню тут не нужны.
// Описания — ПОД командой (стек): двух колонок не хватает на 390px.
import { useMemo } from 'react';
import type { Cmd } from '@/lib/commands';
import { randomWhisper } from '@/lib/transcript';

interface MotdBlockProps {
  onRunCmd: (cmd: string) => void;
  characterId: string;
}

const LOGO =
  '▄▀█ █▀█ █▀▀ ▄▀█ █▄░█ █░█ █▀▄▀█\n' +
  '█▀█ █▀▄ █▄▄ █▀█ █░▀█ █▄█ █░▀░█';

const COMMANDS: Array<{ cmd: string; desc: string }> = [
  { cmd: 'taro daily', desc: 'карта дня' },
  { cmd: 'taro ask', desc: 'три карты · с вопросом' },
  { cmd: 'taro catalog', desc: 'виды раскладов' },
  { cmd: 'taro guides', desc: 'сменить проводника' },
  { cmd: 'taro history', desc: 'журнал сеансов' },
  { cmd: 'help', desc: 'полная справка' },
];

export default function MotdBlock({ onRunCmd, characterId }: MotdBlockProps) {
  // шёпот в футере фиксируем на монтировании — не мигает при ре-рендерах шелла
  const footerWhisper = useMemo(() => randomWhisper(characterId), [characterId]);

  return (
    <div className="motd-block">
      <div className="motd-logo" aria-hidden="true">{LOGO}</div>
      <div className="tl tl-accent tl-semibold">ARCANUM · оккультный терминал · v3.0</div>
      <div className="tl tl-dim">сборка луны · 78 арканов · 3 проводника</div>
      <div className="motd-rule" aria-hidden="true">──────────────────────────────</div>
      <div className="tl">карты тасованы. тени на связи.</div>
      <div className="tl tl-dim" style={{ marginTop: 8 }}>введи команду или тапни по строке:</div>

      <div className="motd-cmds">
        {COMMANDS.map((c) => (
          <button
            key={c.cmd}
            type="button"
            className="motd-cmd"
            onClick={() => onRunCmd(c.cmd)}
          >
            <span className="mc-arrow">▸</span>
            <span className="mc-stack">
              <span className="mc-text">{c.cmd}</span>
              <span className="mc-desc">{c.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="tl tl-comment" style={{ marginTop: 10 }}>
        {'# вопрос можно задать сразу:\n# taro ask стоит ли открывать своё дело'}
      </div>
      <div className="tl tl-faint" style={{ marginTop: 8 }}>
        {'# тени слушают · ' + footerWhisper}
      </div>
    </div>
  );
}
