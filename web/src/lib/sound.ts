// ─────────────────────────────────────────────────────────────
// sound.ts — синтезированный звук оккультного терминала.
// WebAudio, ноль внешних файлов: клавиши, вуш, перезвоны, гул ЭЛТ.
// AudioContext просыпается с первым жестом пользователя
// (autoplay policy), до этого — тишина, как и положено терминалу.
// ─────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let lastKeyAt = 0;
let lastTypeAt = 0;

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
    master = c.createGain();
    master.gain.value = 0.16; // мастер-громкость: тихо, по-домашнему
    master.connect(c.destination);

    // общий буфер шума на все звуки
    const len = Math.floor(c.sampleRate * 0.6);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // разблокировка контекста первым жестом
    const unlock = () => { c.resume().catch(() => {}); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }
  if (ctx!.state === 'suspended') ctx!.resume().catch(() => {});
  return true;
}

// контекст готов играть? (и звук вообще включён)
function ok(): { c: AudioContext; m: GainNode } | null {
  if (!enabled) return null;
  if (!ensure() || !ctx || !master) return null;
  if (ctx.state !== 'running') return null;
  return { c: ctx, m: master };
}

// ── настройки ──
export function setSoundEnabled(v: boolean): void {
  enabled = v;
  if (v) ensure();
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

// ── примитивы ──
function env(c: AudioContext, g: GainNode, t0: number, attack: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function noise(c: AudioContext): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuf!;
  src.loop = true;
  src.playbackRate.value = 0.9 + Math.random() * 0.25;
  return src;
}

// ── клавиша: сухой тик со случайным окрасом ──
export function sKey() {
  const a = ok();
  if (!a) return;
  const now = performance.now();
  if (now - lastKeyAt < 42) return; // троттлинг: не пулемёт
  lastKeyAt = now;
  const { c, m } = a;
  const t0 = c.currentTime;
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500 + Math.random() * 700;
  bp.Q.value = 7;
  const g = c.createGain();
  env(c, g, t0, 0.001, 0.10, 0.045);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  src.stop(t0 + 0.09);
}

// ── печать вывода: мягкий тик телетайпа — тише и ниже клавиши ──
export function sType() {
  const a = ok();
  if (!a) return;
  const now = performance.now();
  if (now - lastTypeAt < 64) return; // стрекота не будет — спокойный ритм
  lastTypeAt = now;
  const { c, m } = a;
  const t0 = c.currentTime;
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 640 + Math.random() * 380;
  bp.Q.value = 4.5;
  const g = c.createGain();
  env(c, g, t0, 0.002, 0.05, 0.05);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  src.stop(t0 + 0.09);
}

// ── enter: подтверждение, нотка вверх ──
export function sEnter() {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(620, t0);
  o.frequency.exponentialRampToValueAtTime(930, t0 + 0.07);
  const g = c.createGain();
  env(c, g, t0, 0.004, 0.09, 0.12);
  o.connect(g).connect(m);
  o.start(t0);
  o.stop(t0 + 0.16);
}

// ── вскрытие карты: вуш — свип шума вверх ──
export function sFlip() {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const src = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(280, t0);
  hp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.24);
  const g = c.createGain();
  env(c, g, t0, 0.02, 0.13, 0.24);
  src.connect(hp).connect(g).connect(m);
  src.start(t0);
  src.stop(t0 + 0.3);
}

// ── откровение: мистический перезвон (квинта + эхо) ──
export function sReveal() {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const tones = [523.25, 783.99, 1046.5]; // C5 · G5 · C6
  tones.forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002); // лёгкая расстройка
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = c.createGain();
    const st = t0 + i * 0.045;
    env(c, g, st, 0.012, 0.075 - i * 0.016, 0.9);
    o.connect(lp).connect(g).connect(m);
    o.start(st);
    o.stop(st + 1.0);
  });
  // мягкое эхо первой ноты
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = 523.25;
  const g2 = c.createGain();
  env(c, g2, t0 + 0.19, 0.012, 0.028, 0.8);
  o.connect(g2).connect(m);
  o.start(t0 + 0.19);
  o.stop(t0 + 1.1);
}

// ── ошибка: глухой низкий зум ──
export function sError() {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = 96;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = c.createGain();
  env(c, g, t0, 0.004, 0.09, 0.16);
  o.connect(lp).connect(g).connect(m);
  o.start(t0);
  o.stop(t0 + 0.2);
}

// ── шёпот: воздух сквозь фильтр ──
export function sWhisper() {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  const src = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900, t0);
  bp.frequency.linearRampToValueAtTime(1500, t0 + 0.5);
  bp.Q.value = 2.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
  src.connect(bp).connect(g).connect(m);
  src.start(t0);
  src.stop(t0 + 0.6);
}

// ── включение ЭЛТ: низкий гул с гармониками ──
export function sBoot() {
  const a = ok();
  if (!a) return;
  const { c, m } = a;
  const t0 = c.currentTime;
  [50, 100, 150].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = c.createGain();
    env(c, g, t0, 0.12 + i * 0.04, 0.07 - i * 0.018, 0.75);
    o.connect(g).connect(m);
    o.start(t0);
    o.stop(t0 + 1.0);
  });
}
