'use client';

// ─────────────────────────────────────────────────────────────
// BootSequence — загрузка терминала: POST-строки, дуги памяти,
// инициализация проводника. Затем callback на MOTD.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { getGuide } from '@/lib/guides';
import { sBoot, sType } from '@/lib/sound';
import { moonPhase } from '@/lib/moon';
import { typingActivity } from '@/lib/typingActivity';

interface BootSequenceProps {
  characterId: string;
  onDone: () => void;
}

interface BootLine {
  text: string;
  tone: 'plain' | 'ok' | 'dim' | 'accent' | 'err';
}

export default function BootSequence({ characterId, onDone }: BootSequenceProps) {
  const guide = getGuide(characterId);
  const [visible, setVisible] = useState(0);
  const doneRef = useRef(false);

  // строки открываются только после маунта (visible=0 при SSR) —
  // фаза луны здесь гидрационно безопасна
  const moon = moonPhase(new Date());

  const lines: BootLine[] = [
    { text: 'ARCANUM BIOS v3.7 · оккультный терминал', tone: 'dim' },
    { text: 'память: 78 арканов · 3 проводника · 8 раскладов', tone: 'plain' },
    { text: 'канал шёпота ................ установлен', tone: 'ok' },
    { text: 'талисман частоты ............ синхронизирован', tone: 'ok' },
    { text: `проводник .................... ${guide.name}`, tone: 'accent' },
    { text: 'пелена ....................... отведена', tone: 'ok' },
    // колбэк к старой шутке «луна вне досягаемости юрисдикции»:
    // теперь терминал знает луну (taro moon)
    {
      text: `луна ............... ${moon.phaseName}`,
      tone: 'ok',
    },
  ];

  useEffect(() => {
    sBoot();
    typingActivity.begin();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 260;
    lines.forEach((_, i) => {
      acc += 230 + Math.random() * 160;
      timers.push(
        setTimeout(() => {
          setVisible(i + 1);
          if (i % 2 === 0) sType(0.9);
        }, acc),
      );
    });
    acc += 420;
    timers.push(
      setTimeout(() => {
        typingActivity.end();
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }, acc),
    );
    return () => {
      typingActivity.end();
      timers.forEach(clearTimeout);
    };
     
  }, [characterId]);

  return (
    <div className="boot-block">
      {/* знак мастера: тяжёлая гарнитура, включение ЭЛТ */}
      <div className="boot-logo" aria-label="АРКАНУМ">
        <div className="boot-logo-word">АРКАНУМ</div>
        <div className="boot-logo-sub">
          <span className="boot-logo-rule" aria-hidden="true" />
          <span className="boot-logo-subtext">оккультный терминал</span>
          <span className="boot-logo-rule" aria-hidden="true" />
        </div>
      </div>
      {lines.slice(0, visible).map((l, i) => (
        <div key={i} className={`tl tl-${l.tone} boot-line`}>
          {l.tone === 'ok' && <span className="boot-ok">[ ok ] </span>}
          {l.text}
        </div>
      ))}
      {visible < lines.length && (
        <div className="tl tl-faint">
          <span className="blink">▊</span>
        </div>
      )}
    </div>
  );
}
