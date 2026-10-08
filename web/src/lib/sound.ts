// ─────────────────────────────────────────────────────────────
// sound.ts — звуковой движок ARCANUM v2 «Cathode Séance».
// WebAudio-синтез: тёмный сабовый дрон, релейные щелчки,
// колокола с ингармоничными партиалами, гул ЭЛТ, мотивы
// проводников. Ноль внешних файлов. Контекст просыпается первым
// жестом пользователя (autoplay policy).
// ─────────────────────────────────────────────────────────────
import { getGuide } from '@/lib/guides';
import { moonPhase } from '@/lib/moon';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null;      //compressor-шина
let droneNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let lastKeyAt = 0;
let lastTypeAt = 0;
let lastCellTickAt = 0;
let lastPageTurnAt = 0;

function semitone(root: number, steps: number): number {
  return root * Math.pow(2, steps / 12);
}

function ensure(): boolean {
  if (typeof window === 'undefined') return false;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return false;
    let c: AudioContext;
    try {
      c = new AC();
    } catch {
      return false;
    }
    ctx = c;

    // мастер-шина: гейн → мягкий компенсатор → выход
    // 0.35 = -30% к прежним 0.5 — по запросу оператора тише
    master = c.createGain();
    master.gain.value = 0.35;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    bus = c.createGain();
    master.connect(comp);
    comp.connect(bus);
    bus.connect(c.destination);

    // общий буфер шума
    const len = Math.floor(c.sampleRate * 1.2);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // разблокировка первым жестом
    const unlock = () => { c.resume().catch(() => {}); };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    window.addEventListener('touchstart', unlock, { once: true, capture: true });
  }
  if (ctx!.state === 'suspended') ctx!.resume().catch(() => {});
  return true;
}

function ok(): { c: AudioContext; m: GainNode } | null {
  if (!enabled) return null;
  if (!ensure() || !ctx || !master) return null;
  if (ctx.state !== 'running') return null;
  return { c: ctx, m: master };
}

// ── настройки ──
export function setSoundEnabled(v: boolean): void {
  enabled = v;
  if (v) {
    ensure();
    startDrone(getCurrentGuideId());
  } else {
    stopDrone();
  }
}
export function isSoundEnabled(): boolean {
  return enabled;
}
export function loadSoundPref(): boolean {
  try {
    const v = localStorage.getItem('taro_sound');
    if (v != null) enabled = v === '1';
  } catch {}
  return enabled;
}
export function saveSoundPref(v: boolean): void {
  try {
    localStorage.setItem('taro_sound', v ? '1' : '0');
  } catch {}
}

// трекинг текущего проводника для тональности дрона/колоколов
let currentGuideId = 'shadow_walker';
export function setCurrentGuideSound(id: string): void {
  currentGuideId = id;
  if (droneNodes) retuneDrone();
}
function getCurrentGuideId(): string {
  return currentGuideId;
}

// ── примитивы ──
function env(
  g: GainNode, t0: number,
  attack: number, peak: number, decay: number, sustainLevel?: number,
) {
  const p = Math.max(peak, 0.0002);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(p, t0 + attack);
  if (sustainLevel != null) {
    g.gain.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0002), t0 + attack + decay);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }
}

function noise(c: AudioContext): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuf!;
  src.loop = true;
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  return src;
}

function killAt(src: AudioScheduledSourceNode, t: number) {
  try { src.stop(t); } catch {}
}

// ═══════════════════════════════════════════════════════════
// ДРОН-ПОСТЕЛЬ: два расстроенных саб-осциллятора + воздушный
// шум. Живёт пока жив терминал; приседает при печати.
// ═══════════════════════════════════════════════════════════
let droneDuckTimer: ReturnType<typeof setTimeout> | null = null;

export function startDrone(guideId: string): void {
  if (!ok() || droneNodes) return;
  const { c, m } = { c: ctx!, m: master! };
  const root = getGuide(guideId).toneRoot;
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.055, c.currentTime + 2.2);

  // медленное дыхание громкости
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain);
  lfoGain.connect(g.gain);
  lfo.start();

  const mk = (freq: number, type: OscillatorType): OscillatorNode => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    o.start();
    return o;
  };
  const osc = [
    mk(root / 2, 'sine'),
    mk((root / 2) * 1.007, 'sine'),           // биения
    mk(root, 'triangle'),                      // тонкая обертоника
  ];
  {
    const og = c.createGain();
    og.gain.value = 0.016;
    osc[2].disconnect();
    osc[2].connect(og);
    og.connect(g);
  }

  // воздушный слой: шум через резонансный фильтр
  const air = noise(c);
  const airF = c.createBiquadFilter();
  airF.type = 'bandpass';
  airF.frequency.value = 320;
  airF.Q.value = 0.8;
  const airG = c.createGain();
  airG.gain.value = 0.006;
  air.connect(airF);
  airF.connect(airG);
  airG.connect(g);
  air.start();

  g.connect(m);
  droneNodes = { osc: [...osc, air as unknown as OscillatorNode, lfo], gain: g };
}

function retuneDrone(): void {
  if (!droneNodes || !ctx) return;
  const root = getGuide(currentGuideId).toneRoot;
  const t = ctx.currentTime;
  const [a, b, cOsc] = droneNodes.osc;
  try {
    a.frequency.setTargetAtTime(root / 2, t, 0.8);
    b.frequency.setTargetAtTime((root / 2) * 1.007, t, 0.8);
    cOsc?.frequency?.setTargetAtTime?.(root, t, 0.8);
  } catch {}
}

function stopDrone(): void {
  if (!droneNodes || !ctx) return;
  const t = ctx.currentTime;
  droneNodes.gain.gain.cancelScheduledValues(t);
  droneNodes.gain.gain.setTargetAtTime(0.0001, t, 0.4);
  const nodes = droneNodes;
  setTimeout(() => {
    nodes.osc.forEach((o) => { try { (o as any).stop?.(); } catch {} });
    try { nodes.gain.disconnect(); } catch {}
  }, 1600);
  droneNodes = null;
}

/** печать пошла — дрон приседает, чтобы щелчки были слышны */
export function duckDrone(): void {
  if (!droneNodes || !ctx) return;
  droneNodes.gain.gain.setTargetAtTime(0.018, ctx.currentTime, 0.3);
  if (droneDuckTimer) clearTimeout(droneDuckTimer);
  droneDuckTimer = setTimeout(() => {
    if (droneNodes && ctx) {
      droneNodes.gain.gain.setTargetAtTime(0.055, ctx.currentTime, 1.2);
    }
  }, 2200);
}

// ═══════════════════════════════════════════════════════════
// ГОЛОСА СОБЫТИЙ
// ═══════════════════════════════════════════════════════════

/** клавиша: релейный щелчок + крошечный металлический обертон */
export function sKey(): void {
  const a = ok();
  if (!a) return;
  const now = performance.now();
  if (now - lastKeyAt < 40) return;
  lastKeyAt = now;
  const { c, m } = a;
  const t0 = c.currentTime;

  // механический тик
  const src = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800 + Math.random() * 900;
  const g = c.createGain();
  env(g, t0, 0.001, 0.07, 0.03);
  src.connect(hp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.05);

  // металлическая искра
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = 2200 + Math.random() * 1800;
  const g2 = c.createGain();
  env(g2, t0, 0.0005, 0.012, 0.012);
  o.connect(g2).connect(m);
  o.start(t0);
  killAt(o, t0 + 0.02);
}

/**
 * ховер ячейки библиотеки: почти неслышный тик «перебирания
 * страниц» — тот же релейный шелчок, что sKey, но −60% громкости,
 * короче (<60мс) и с микровариацией питча ±5%, чтобы быстрые
 * наведения не сливались в «пулемёт». Троттлинг 350мс внутри.
 */
export function sCellTick(): void {
  const a = ok();
  if (!a) return;
  const now = performance.now();
  if (now - lastCellTickAt < 350) return;
  lastCellTickAt = now;
  const { c, m } = a;
  const t0 = c.currentTime;
  const pitch = 1 + (Math.random() - 0.5) * 0.1; // ±5%

  // механический тик — вдвое тише и короче клавиши
  const src = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = (1500 + Math.random() * 800) * pitch;
  const g = c.createGain();
  env(g, t0, 0.001, 0.028, 0.02);
  src.connect(hp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.04);
}

/** печать вывода: тик телетайпа — ниже и мягче клавиши */
export function sType(pitch = 1): void {
  const a = ok();
  if (!a) return;
  const now = performance.now();
  if (now - lastTypeAt < 60) return;
  lastTypeAt = now;
  duckDrone();
  const { c, m } = a;
  const t0 = c.currentTime;
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (560 + Math.random() * 320) * pitch;
  bp.Q.value = 3.5;
  const g = c.createGain();
  env(g, t0, 0.002, 0.045, 0.05);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.08);
}

/** enter: подтверждение — квинта проводника, тёмный треугольник */
export function sEnter(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  [0, 7].forEach((semi, i) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = semitone(guide.toneRoot * 2, semi) * (1 + (Math.random() - 0.5) * 0.003);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = c.createGain();
    env(g, t0 + i * 0.045, 0.006, i === 0 ? 0.075 : 0.05, 0.16);
    o.connect(lp).connect(g).connect(m);
    o.start(t0 + i * 0.045);
    killAt(o, t0 + i * 0.045 + 0.22);
  });
}

/** тасование: riffle — россыпь карточных щелчков по фильтру */
export function sShuffle(durMs = 900): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const n = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const at = t0 + (i / n) * (durMs / 1000) * (0.6 + Math.random() * 0.5);
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 2400;
    bp.Q.value = 2 + Math.random() * 3;
    const g = c.createGain();
    env(g, at, 0.002, 0.05 + Math.random() * 0.04, 0.04);
    src.connect(bp).connect(g).connect(m);
    src.start(at);
    killAt(src, at + 0.07);
  }
  // шорох веера — широкий свип
  const sweep = noise(c);
  const bp2 = c.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.Q.value = 1.2;
  bp2.frequency.setValueAtTime(700, t0);
  bp2.frequency.exponentialRampToValueAtTime(2600, t0 + durMs / 1000);
  const g2 = c.createGain();
  env(g2, t0, 0.1, 0.03, durMs / 1000);
  sweep.connect(bp2).connect(g2).connect(m);
  sweep.start(t0);
  killAt(sweep, t0 + durMs / 1000 + 0.1);
}

/**
 * перелистывание страницы: короткий riffle-шорох (шум через
 * bandpass ~1200-2400Гц, экспоненциальный спад ~180мс, тихий)
 * и в конце — мягкий щелчок-падения, как реле, но ниже: страница
 * легла. Короче и тише sShuffle — это одна страница, не колода.
 * quiet=true: −50% громкости и без щелчка — шелест прокрутки
 * длинной сетки, на грани слышимости.
 */
export function sPageTurn(quiet = false): void {
  const a = ok();
  if (!a) return;
  const now = performance.now();
  if (now - lastPageTurnAt < 120) return; // не накладывать шорохи
  lastPageTurnAt = now;
  const { c, m } = a;
  const t0 = c.currentTime;
  const vol = quiet ? 0.015 : 0.032;

  // riffle-шорох: бумага скользит по бумагу — короткий свип вверх
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1250 + Math.random() * 250, t0);
  bp.frequency.exponentialRampToValueAtTime(2150 + Math.random() * 250, t0 + 0.16);
  bp.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.22);

  // мягкий щелчок-падения в конце — только полный вариант
  if (!quiet) {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = 580 + Math.random() * 120; // ниже реле клавиши
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g2 = c.createGain();
    env(g2, t0 + 0.13, 0.001, 0.02, 0.03);
    o.connect(lp).connect(g2).connect(m);
    o.start(t0 + 0.13);
    killAt(o, t0 + 0.18);
  }
}

/** вскрытие карты: вуш (свип шума) + саб-удар */
export function sFlip(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;

  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(350, t0);
  bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.22);
  const g = c.createGain();
  env(g, t0, 0.015, 0.12, 0.22);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.3);

  // саб-удар под свипом
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t0);
  o.frequency.exponentialRampToValueAtTime(52, t0 + 0.18);
  const g2 = c.createGain();
  env(g2, t0, 0.004, 0.16, 0.2);
  o.connect(g2).connect(m);
  o.start(t0);
  killAt(o, t0 + 0.25);
}

/**
 * откровение: тёмный колокол — ингармоничные партиалы
 * (1, 2.76, 5.4 — как у колокола/тубафона), долгий хвост.
 * noteIdx сдвигает высоту по мотиву проводника.
 */
export function sReveal(noteIdx = 0): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const semi = guide.motif[noteIdx % guide.motif.length] ?? 0;
  const base = semitone(guide.toneRoot * 2, semi);

  const partials: [number, number, number][] = [
    [1.0, 0.09, 2.6],
    [2.76, 0.045, 1.9],
    [5.4, 0.02, 1.2],
    [0.5, 0.07, 3.0],
  ];
  partials.forEach(([ratio, vol, dur]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = c.createGain();
    env(g, t0, 0.008, vol, dur, 0.0001);
    o.connect(lp).connect(g).connect(m);
    o.start(t0);
    killAt(o, t0 + dur + 0.1);
  });

  // призрачный вторящий тон на квинту — «отклик из-за пелены»
  const o2 = c.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = semitone(guide.toneRoot * 2, semi + 7);
  const g2 = c.createGain();
  env(g2, t0 + 0.22, 0.05, 0.022, 1.4);
  o2.connect(g2).connect(m);
  o2.start(t0 + 0.22);
  killAt(o2, t0 + 1.9);
}

/** ошибка: глухой зум с грязью (waveshaper) */
export function sError(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 62;
  const o2 = c.createOscillator();
  o2.type = 'square';
  o2.frequency.value = 63.7; // биения — диссонанс
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    const x = (i / 63) * 2 - 1;
    curve[i] = Math.tanh(x * 2.6);
  }
  shaper.curve = curve;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  const g = c.createGain();
  env(g, t0, 0.004, 0.11, 0.28);
  o.connect(shaper);
  o2.connect(shaper);
  shaper.connect(lp).connect(g).connect(m);
  o.start(t0); o2.start(t0);
  killAt(o, t0 + 0.32); killAt(o2, t0 + 0.32);
}

/** шёпот канала: дыхание сквозь резонанс — с тремоло */
export function sWhisper(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(680, t0);
  bp.frequency.linearRampToValueAtTime(1400, t0 + 0.7);
  bp.Q.value = 3.2;
  const trem = c.createGain();
  trem.gain.value = 1;
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 5.2;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.5;
  lfo.connect(lfoG);
  lfoG.connect(trem.gain);
  lfo.start(t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
  src.connect(bp).connect(trem).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.9);
  killAt(lfo, t0 + 0.9);
}

/** включение ЭЛТ: саб-удар + восходящий гул + тонкий свист развёртки */
export function sBoot(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;

  // удар включения
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(46, t0);
  o.frequency.exponentialRampToValueAtTime(28, t0 + 0.5);
  const g = c.createGain();
  env(g, t0, 0.01, 0.2, 0.8);
  o.connect(g).connect(m);
  o.start(t0);
  killAt(o, t0 + 0.9);

  // восходящий гул трансформатора
  const o2 = c.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.setValueAtTime(38, t0 + 0.1);
  o2.frequency.exponentialRampToValueAtTime(92, t0 + 0.55);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const g2 = c.createGain();
  env(g2, t0 + 0.1, 0.12, 0.075, 1.1);
  o2.connect(lp).connect(g2).connect(m);
  o2.start(t0 + 0.1);
  killAt(o2, t0 + 1.4);

  // свист строчной развёртки (15кГц зона, но тише и ниже — слышно на телефонах)
  const o3 = c.createOscillator();
  o3.type = 'sine';
  o3.frequency.setValueAtTime(1900, t0 + 0.3);
  o3.frequency.exponentialRampToValueAtTime(9200, t0 + 0.5);
  const g3 = c.createGain();
  env(g3, t0 + 0.3, 0.12, 0.008, 0.9);
  o3.connect(g3).connect(m);
  o3.start(t0 + 0.3);
  killAt(o3, t0 + 1.3);
}

/** смена проводника: её мотив — три ноты со смещением */
export function sGuide(guideId: string): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(guideId);
  const t0 = c.currentTime;
  guide.motif.forEach((semi, i) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = semitone(guide.toneRoot * 2, semi);
    const g = c.createGain();
    const at = t0 + i * 0.16;
    env(g, at, 0.02, 0.06 - i * 0.008, 0.5);
    o.connect(g).connect(m);
    o.start(at);
    killAt(o, at + 0.6);
  });
  // переходный шорох — «пелена сменяет голос»
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(500, t0);
  bp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.4);
  bp.Q.value = 2;
  const g = c.createGain();
  env(g, t0, 0.05, 0.04, 0.4);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.5);
}

/** выбор пункта меню: короткая искра на акценте */
export function sMenu(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(guide.toneRoot * 2, t0);
  o.frequency.exponentialRampToValueAtTime(guide.toneRoot * 3, t0 + 0.06);
  const g = c.createGain();
  env(g, t0, 0.003, 0.05, 0.1);
  o.connect(g).connect(m);
  o.start(t0);
  killAt(o, t0 + 0.14);
}

// ── мотивы follow-up: вход в вопрос, метки пары, парный ответ ──

/**
 * вход в режим вопроса (askMode/pairMode): короткий «вдох» —
 * восходящий тихий свип + мягкий щелчок реле: канал открыт.
 */
export function sAskOpen(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;

  // восходящий тихий свип — вдох канала
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(420, t0);
  bp.frequency.exponentialRampToValueAtTime(1900, t0 + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.038, t0 + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  killAt(src, t0 + 0.35);

  // мягкий щелчок реле в конце вдоха
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = 880;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const g2 = c.createGain();
  env(g2, t0 + 0.17, 0.001, 0.018, 0.03);
  o.connect(lp).connect(g2).connect(m);
  o.start(t0 + 0.17);
  killAt(o, t0 + 0.23);
}

/**
 * пометка карты при выборе в pair-режиме: короткая нота мотива
 * проводника; вторая карта — выше (две ступени: слышно «один» и «два»).
 */
export function sPairMark(n: 1 | 2): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const semi = n === 1 ? 0 : 5; // прима и чистая кварта — два разных голоса
  const base = semitone(guide.toneRoot * 2, semi);

  // короткая нота — тёмный треугольник
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = base;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = c.createGain();
  env(g, t0, 0.004, 0.06, 0.28);
  o.connect(lp).connect(g).connect(m);
  o.start(t0);
  killAt(o, t0 + 0.34);

  // крошка колокола — ингармоничный отклик (в тоне sReveal)
  const o2 = c.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = base * 2.76;
  const g2 = c.createGain();
  env(g2, t0 + 0.015, 0.005, 0.02, 0.2);
  o2.connect(g2).connect(m);
  o2.start(t0 + 0.015);
  killAt(o2, t0 + 0.26);
}

/**
 * парный ответ: два тёмных колокола — второй квинтой ниже и с
 * опозданием, «два голоса сшиваются»; дыхание между ними чуть
 * длиннее одиночного sWhisper.
 */
export function sPairWhisper(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const root = guide.toneRoot * 2;

  // два колокола: первый — в тон, второй — квинтой вниз, позже
  const bells: [number, number][] = [
    [0, 0],
    [0.3, -7],
  ];
  bells.forEach(([delay, semi], i) => {
    const base = semitone(root, semi);
    const partials: [number, number, number][] = [
      [1.0, 0.075 - i * 0.012, 2.2],
      [2.76, 0.035, 1.6],
      [5.4, 0.016, 1.1],
      [0.5, 0.055, 2.6],
    ];
    partials.forEach(([ratio, vol, dur]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      const g = c.createGain();
      env(g, t0 + delay, 0.01, vol, dur);
      o.connect(lp).connect(g).connect(m);
      o.start(t0 + delay);
      killAt(o, t0 + delay + dur + 0.1);
    });
  });

  // дыхание между колоколами — шёпот с тремоло, длиннее одиночного
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(620, t0 + 0.12);
  bp.frequency.linearRampToValueAtTime(1500, t0 + 1.3);
  bp.Q.value = 3;
  const trem = c.createGain();
  trem.gain.value = 1;
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 4.6;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.5;
  lfo.connect(lfoG);
  lfoG.connect(trem.gain);
  lfo.start(t0 + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0 + 0.12);
  g.gain.exponentialRampToValueAtTime(0.042, t0 + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
  src.connect(bp).connect(trem).connect(g).connect(m);
  src.start(t0 + 0.12);
  killAt(src, t0 + 1.55);
  killAt(lfo, t0 + 1.55);
}

/**
 * призыв ритуала дня: два медленных тёмных колокола — второй
 * ниже и с опозданием, «звон собирает внимание». Тихий, на грани
 * слышимости: терминал напоминает, но не кричит.
 */
export function sRitual(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const root = guide.toneRoot; // ниже, чем откровение — «призыв из глубины»

  const bells: [number, number][] = [
    [0.0, 0],    // первый — в тон проводника
    [0.85, -5],  // второй — кварта вниз, долгий выдох
  ];
  bells.forEach(([delay, semi], i) => {
    const base = semitone(root, semi);
    const partials: [number, number, number][] = [
      [1.0, 0.05 - i * 0.008, 3.4],
      [2.76, 0.022, 2.4],
      [5.4, 0.009, 1.5],
      [0.5, 0.038, 3.8],
    ];
    partials.forEach(([ratio, vol, dur]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const g = c.createGain();
      env(g, t0 + delay, 0.012, vol, dur);
      o.connect(lp).connect(g).connect(m);
      o.start(t0 + delay);
      killAt(o, t0 + delay + dur + 0.1);
    });
  });
}

/**
 * печать сургучом: короткий низкий тамп (осциллятор ~90 Гц,
 * экспоненциальный спад 150 мс) + сразу следом тихий высвист
 * (свип 1400→1900 Гц, 90 мс, ≈ −24 дБ) — «сургуч схватился».
 */
export function sSeal(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;

  // тамп: печать прижимается к свитку
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(94, t0);
  o.frequency.exponentialRampToValueAtTime(78, t0 + 0.13);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 300;
  const g = c.createGain();
  g.gain.setValueAtTime(0.15, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  o.connect(lp).connect(g).connect(m);
  o.start(t0);
  killAt(o, t0 + 0.18);

  // высвист пара сразу после тампа — 1400→1900 Гц, очень тихо
  const o2 = c.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(1400, t0 + 0.12);
  o2.frequency.exponentialRampToValueAtTime(1900, t0 + 0.21);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, t0 + 0.12);
  g2.gain.exponentialRampToValueAtTime(0.06, t0 + 0.14);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.23);
  o2.connect(g2).connect(m);
  o2.start(t0 + 0.12);
  killAt(o2, t0 + 0.25);
}

/**
 * личный аркан: три восходящих тихих тона (прима · терция ·
 * квинта — «до-ми-соль» от тона проводника), тёмный тембр
 * с ингармоничными партиалами как у sReveal. Личность
 * проявляется — короткая приподнятая арка ~0.6с.
 */
export function sArcana(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;

  // приподнятое трезвучие: восходящая тройка нот
  const notes: [number, number][] = [
    [0.0, 0],   // прима — в тон проводника
    [0.13, 4],  // большая терция
    [0.26, 7],  // чистая квинта
  ];
  notes.forEach(([delay, semi], i) => {
    const base = semitone(guide.toneRoot * 2, semi);
    const partials: [number, number, number][] = [
      [1.0, 0.05 - i * 0.006, 0.34],
      [2.76, 0.02, 0.24],
      [5.4, 0.008, 0.16],
    ];
    partials.forEach(([ratio, vol, dur]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      const g = c.createGain();
      env(g, t0 + delay, 0.01, vol, dur);
      o.connect(lp).connect(g).connect(m);
      o.start(t0 + delay);
      killAt(o, t0 + delay + dur + 0.05);
    });
  });
}

/** легкий haptic-отклик, где поддерживается */
export function haptic(pattern: 'tick' | 'tap' | 'warn' = 'tap'): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern === 'tick' ? 8 : pattern === 'tap' ? 16 : [24, 40, 24]);
    }
  } catch {}
}

/**
 * луна: один чистый высокий колокол (~0.6с) — стеклянный,
 * тоньше и короче шёпота. Полнолуние и новолуние — событие:
 * второй удар через 0.42с, квартой ниже.
 */
export function sMoon(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const root = guide.toneRoot * 4; // две октавы вверх — «стекло»

  // полнолуние/новолуние — двойной удар
  const phaseIdx = moonPhase(new Date()).phaseIndex;
  const strikes: [number, number][] =
    phaseIdx === 0 || phaseIdx === 4
      ? [[0.0, 0], [0.42, -5]] // второй — кварта вниз, эхо события
      : [[0.0, 0]];

  strikes.forEach(([delay, semi], i) => {
    const base = semitone(root, semi);
    // партиалы колокола: тоньше, чем у sRitual — прозрачнее
    const partials: [number, number, number][] = [
      [1.0, 0.05 - i * 0.009, 0.62],
      [2.76, 0.02, 0.44],
      [5.4, 0.008, 0.28],
      [8.9, 0.004, 0.18], // верхний обертон — «звёздная пыль»
    ];
    partials.forEach(([ratio, vol, dur]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      const g = c.createGain();
      env(g, t0 + delay, 0.008, vol, dur);
      o.connect(lp).connect(g).connect(m);
      o.start(t0 + delay);
      killAt(o, t0 + delay + dur + 0.06);
    });
  });
}

/**
 * глиф-кнопки: тонкий стеклянный пинг — октавой выше sMoon,
 * короче (~0.25с) и на треть тише. Наведение на луну в
 * статус-лайне: палец коснулся стекла, не удара.
 */
export function sGlyph(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  const base = guide.toneRoot * 8; // ещё октава вверх от sMoon — «стекло»

  const partials: [number, number, number][] = [
    [1.0, 0.035, 0.22],
    [2.76, 0.013, 0.14],
    [5.4, 0.005, 0.08], // звёздная пыль, но совсем крошка
  ];
  partials.forEach(([ratio, vol, dur]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6800;
    const g = c.createGain();
    env(g, t0, 0.005, vol, dur);
    o.connect(lp).connect(g).connect(m);
    o.start(t0);
    killAt(o, t0 + dur + 0.04);
  });
}

/**
 * отголосок журнала: далёкий колокол с эхом — один удар ~600 Гц
 * и два затухающих повтора, каждый тише и ниже предыдущего
 * (~1.2с). Память отзывается из глубины: lowpass глушит верха,
 * повторы сползают по высоте — «голос из другого дня».
 */
export function sEcho(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const base = 600; // дальний колокол — фиксированный, вне тона проводника

  // удар + два эха: задержка, полутон вниз, громкость
  const strikes: [number, number, number][] = [
    [0.0, 0, 1.0],   // сам удар — слышно, но глухо (lowpass ниже)
    [0.38, -2, 0.45], // первое эхо — тише, чуть ниже
    [0.72, -4, 0.2],  // второе эхо — почти шёпот
  ];
  strikes.forEach(([delay, semi, vel]) => {
    const b = semitone(base, semi);
    const partials: [number, number, number][] = [
      [1.0, 0.055 * vel, 0.5],
      [2.76, 0.02 * vel, 0.34],
      [5.4, 0.007 * vel, 0.22],
    ];
    partials.forEach(([ratio, vol, dur]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = b * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400; // дальность: верха не доходят
      const g = c.createGain();
      env(g, t0 + delay, 0.01, vol, dur);
      o.connect(lp).connect(g).connect(m);
      o.start(t0 + delay);
      killAt(o, t0 + delay + dur + 0.08);
    });
  });
}

/**
 * дайджест недели: листание журнала — быстрый триплет тихих
 * щелчков-страниц (как печать, но ниже и три подряд, ~0.3с),
 * в конце мягкий колокол в тоне проводника: неделя сложена.
 */
export function sWeek(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  duckDrone();

  // триплет страниц: полосовой щелчок ниже печатного (~380 Гц),
  // интервал 0.1с — слитное «флип-флип-флип»
  for (let i = 0; i < 3; i++) {
    const at = t0 + i * 0.1;
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 330 + Math.random() * 90; // страница ниже клавиши
    bp.Q.value = 2.6;
    const g = c.createGain();
    env(g, at, 0.003, 0.05, 0.07);
    src.connect(bp).connect(g).connect(m);
    src.start(at);
    killAt(src, at + 0.09);
  }

  // мягкий колокол: две октавы выше тоники, приглушённый
  const bell = semitone(guide.toneRoot * 4, 0);
  const partials: [number, number, number][] = [
    [1.0, 0.04, 0.5],
    [2.76, 0.014, 0.34],
    [5.4, 0.005, 0.2],
  ];
  partials.forEach(([ratio, vol, dur]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = bell * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = c.createGain();
    env(g, t0 + 0.3, 0.012, vol, dur);
    o.connect(lp).connect(g).connect(m);
    o.start(t0 + 0.3);
    killAt(o, t0 + 0.3 + dur + 0.08);
  });
}

/**
 * отправка в телеграм: свиток улетает — короткий воздушный
 * свип вверх (шёпот крыла) + далёкий подтверждающий тик
 * relay (эхо доставки). Тихий, ~0.45с.
 */
export function sSent(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;

  // свип: полосовой шум с поднимающейся частотой — «улетел»
  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.3), c.sampleRate);
  const ch = noiseSrc.buffer.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(700, t0);
  bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.24);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  noiseSrc.connect(bp).connect(g).connect(m);
  noiseSrc.start(t0);
  killAt(noiseSrc, t0 + 0.32);

  // relay-тик в конце: «доставлено»
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(1560, t0 + 0.28);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, t0 + 0.28);
  g2.gain.exponentialRampToValueAtTime(0.035, t0 + 0.3);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
  o.connect(g2).connect(m);
  o.start(t0 + 0.28);
  killAt(o, t0 + 0.44);
}

/**
 * дайджест месяца: журнала больше — пять страниц подряд с
 * замедлением (месяц длиннее недели, листается неспешно),
 * затем глубокий колокол на две октавы НИЖЕ недельного:
 * месяц сложен, печать тяжелее. ~0.7с.
 */
export function sMonth(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  duckDrone();

  // пять страниц: интервалы растут 0.09→0.14 — неспешное
  // пролистывание, частота щелчка чуть ниже недельного
  const gaps = [0, 0.09, 0.19, 0.31, 0.45];
  for (let i = 0; i < gaps.length; i++) {
    const at = t0 + gaps[i];
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 290 + Math.random() * 70; // страница глубже
    bp.Q.value = 2.4;
    const g = c.createGain();
    env(g, at, 0.003, 0.045, 0.08);
    src.connect(bp).connect(g).connect(m);
    src.start(at);
    killAt(src, at + 0.1);
  }

  // глубокий колокол: одна октава над тоникой — печать месяца
  const bell = semitone(guide.toneRoot * 2, 0);
  const partialsM: [number, number, number][] = [
    [1.0, 0.05, 0.85],
    [2.76, 0.016, 0.5],
    [5.4, 0.005, 0.28],
  ];
  partialsM.forEach(([ratio, vol, dur]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = bell * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = c.createGain();
    env(g, t0 + 0.6, 0.016, vol, dur);
    o.connect(lp).connect(g).connect(m);
    o.start(t0 + 0.6);
    killAt(o, t0 + 0.6 + dur + 0.1);
  });
}

/**
 * смена покрытия фосфора: «перекалибровка трубки» — дегauss.
 * Глухой тамп катушки (70 Гц, быстрый спад) + вибрирующий
 * глиссандо-вой (треугольная волна 960→320 Гц за полсекунды,
 * LFO-дрожь на частоте) + едва слышный свист высокого фильтра
 * вверх. Вибро — фирменный признак дегаусса старых мониторов.
 * У каждого покрытия — свой характер перекалибровки: серебро
 * стекляннее и выше, костёр ниже и мягче, пепел — мёртвая
 * моно-перекалибровка без вибро и свиста.
 */
interface ThemeDegauss {
  thump: [number, number];
  wobble: [number, number, number, number]; // от, до, Гц LFO, глубина
  whistle: [number, number, number] | null; // от, до, громкость
}

const THEME_DEGAUSS: Record<string, ThemeDegauss> = {
  // пергамент: исходный характер — земле и вибро
  classic: {
    thump: [76, 54],
    wobble: [940, 310, 11, 38],
    whistle: [420, 1750, 0.03],
  },
  // серебро: стеклянная лунность — выше, звонче, дрожь быстрее
  silver: {
    thump: [92, 68],
    wobble: [1240, 480, 14, 30],
    whistle: [700, 2600, 0.035],
  },
  // костёр: угли — ниже, мягче, дрожь медленная как жар
  ember: {
    thump: [62, 44],
    wobble: [680, 220, 8, 44],
    whistle: [300, 1100, 0.024],
  },
  // пепел: мёртвый моно — плоский вой без вибро, без свиста
  ash: {
    thump: [70, 50],
    wobble: [800, 300, 0, 0],
    whistle: null,
  },
};

export function sTheme(themeId?: string): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  duckDrone();
  const d = THEME_DEGAUSS[themeId ?? 'classic'] ?? THEME_DEGAUSS.classic;

  // тамп катушки: глухой удар в землю, 0.3с
  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(d.thump[0], t0);
  thump.frequency.exponentialRampToValueAtTime(d.thump[1], t0 + 0.22);
  const tg = c.createGain();
  env(tg, t0, 0.006, 0.11, 0.28);
  thump.connect(tg).connect(m);
  thump.start(t0);
  killAt(thump, t0 + 0.4);

  // дегauss-вой: глиссандо вниз; вибро — если тема живая
  const wob = c.createOscillator();
  wob.type = 'triangle';
  wob.frequency.setValueAtTime(d.wobble[0], t0 + 0.05);
  wob.frequency.exponentialRampToValueAtTime(d.wobble[1], t0 + 0.55);
  let lfo: OscillatorNode | null = null;
  if (d.wobble[3] > 0) {
    lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = d.wobble[2];
    const lfoGain = c.createGain();
    lfoGain.gain.value = d.wobble[3];
    lfo.connect(lfoGain).connect(wob.frequency);
  }
  const wg = c.createGain();
  env(wg, t0 + 0.05, 0.02, 0.035, 0.5);
  wob.connect(wg).connect(m);
  wob.start(t0 + 0.05);
  lfo?.start(t0 + 0.05);
  killAt(wob, t0 + 0.68);
  if (lfo) killAt(lfo, t0 + 0.68);

  // свист фильтра: полосовой шум уезжает вверх — «прогрев»;
  // пепел молчит — старой трубке уже нечем светить
  if (d.whistle) {
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(d.whistle[0], t0 + 0.08);
    bp.frequency.exponentialRampToValueAtTime(d.whistle[1], t0 + 0.5);
    const sg = c.createGain();
    env(sg, t0 + 0.08, 0.04, d.whistle[2], 0.42);
    src.connect(bp).connect(sg).connect(m);
    src.start(t0 + 0.08);
    killAt(src, t0 + 0.6);
  }
}

/**
 * рассвет пойман: мини-игра «до полудня» — три восходящих
 * мягких колокола (утро = подъём), каждый выше и тише, как
 * свет, набирающий высоту. Тон проводника, +5/+12 полутонов.
 */
export function sDawn(): void {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const guide = getGuide(currentGuideId);
  const t0 = c.currentTime;
  duckDrone();

  // три восходящих удара: 0 / 0.16 / 0.34с, полутоновая лестница
  const steps = [0, 5, 12];
  steps.forEach((semi, i) => {
    const base = semitone(guide.toneRoot * 4, semi);
    const at = t0 + i * 0.17;
    const partialsD: [number, number, number][] = [
      [1.0, 0.038 - i * 0.007, 0.55],
      [2.76, 0.012, 0.3],
      [5.4, 0.004, 0.16],
    ];
    partialsD.forEach(([ratio, vol, dur]) => {
      if (vol <= 0) return;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.002);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3400;
      const g = c.createGain();
      env(g, at, 0.01, vol, dur);
      o.connect(lp).connect(g).connect(m);
      o.start(at);
      killAt(o, at + dur + 0.08);
    });
  });
}
