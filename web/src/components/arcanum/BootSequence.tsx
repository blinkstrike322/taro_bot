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

  // эстафета с заставкой: вордмарк сплэша летит в заголовок — держим
  // его скрытым до прилёта (событие word-land) либо 2.4с страховки.
  // Hold включается только в эффекте при живом .splash — первый кадр
  // совпадает с SSR (гидрация сходится), повторный визит без сплэша
  // сразу показывает лого со штатным включением ЭЛТ.
  const [wordHold, setWordHold] = useState(false);
  // был ли сплэш: только тогда прилёт играет arrive-анимацией,
  // иначе — штатное включение ЭЛТ базовой анимацией
  const heldRef = useRef(false);
  useEffect(() => {
    if (!document.querySelector('.splash')) return;
    heldRef.current = true;
    setWordHold(true);
    const land = () => setWordHold(false);
    window.addEventListener('arcanum:word-land', land);
    const fallback = setTimeout(land, 2400);
    return () => {
      window.removeEventListener('arcanum:word-land', land);
      clearTimeout(fallback);
    };
  }, []);

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
      {/* знак мастера: тяжёлая гарнитура, включение ЭЛТ.
          Пока летит вордмарк заставки — заголовок на удержании */}
      <div
        className={`boot-logo${wordHold ? ' boot-logo--hold' : heldRef.current ? ' boot-logo--land' : ''}`}
        aria-label="АРКАНУМ"
      >
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
