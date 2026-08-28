'use client';

// MotdBlock — message of the day: ASCII-логотип + тапабельные команды.
// Тап по строке = выполнить команду: меню тут не нужны.
import type { Cmd } from '@/lib/commands';

interface MotdBlockProps {
  onRunCmd: (cmd: string) => void;
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

export default function MotdBlock({ onRunCmd }: MotdBlockProps) {
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
            <span className="mc-text">{c.cmd}</span>
            <span className="mc-desc">{c.desc}</span>
          </button>
        ))}
      </div>

      <div className="tl tl-comment" style={{ marginTop: 10 }}>
        {'# вопрос можно задать сразу:\n# taro ask стоит ли открывать своё дело'}
      </div>
    </div>
  );
}
