// Tiny synthesized sound effects (no audio files).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('ho_mute') === '1'; } catch {}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('ho_mute', m ? '1' : '0'); } catch {}
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = 'square', vol = 0.06, slide = 0) {
  const a = ac();
  if (!a || muted) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0, 0.05, 'square', 0.03),
  submit: () => { tone(440, 0, 0.08); tone(660, 0.06, 0.1); },
  tick: () => tone(1200, 0, 0.03, 'square', 0.025),
  bad: () => { tone(220, 0, 0.18, 'triangle', 0.08, -80); },
  ok: () => { tone(392, 0, 0.1, 'triangle', 0.07); tone(523, 0.09, 0.14, 'triangle', 0.07); },
  great: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.14, 'square', 0.05)),
  dive: () => tone(500, 0, 0.6, 'sine', 0.05, -320),
  zone: () => { tone(784, 0, 0.25, 'sine', 0.05); tone(1175, 0.12, 0.35, 'sine', 0.04); },
};
