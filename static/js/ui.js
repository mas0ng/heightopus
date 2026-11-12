// Shared UI helpers for solo and party play.
import { BANDS } from './scoring.js';
import { sfx } from './sfx.js';
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

// ---------- storage
export function load(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ---------- viewport (keeps the answer bar above phone keyboards)
function syncViewport() {
  const vv = window.visualViewport;
  const r = document.documentElement.style;
  r.setProperty('--vvh', `${vv ? vv.height : window.innerHeight}px`);
  r.setProperty('--vvtop', `${vv ? vv.offsetTop : 0}px`);
}
syncViewport();
window.visualViewport?.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('scroll', syncViewport);
window.addEventListener('resize', syncViewport);

// ---------- toast / zone banner
let toastT;
export function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}
let zoneT;
export function showZone(z) {
  const el = $('#zone');
  el.querySelector('b').textContent = z.name;
  el.querySelector('span').textContent = z.sub;
  el.classList.add('show');
  clearTimeout(zoneT);
  zoneT = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- units & formatting
export const getUnit = () => load('ho_unit', 'm');
export const setUnit = (u) => save('ho_unit', u);
const FT = 3.28084;

function niceNum(v) {
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}
export function fmtH(m, unit = getUnit()) {
  if (m == null) return '—';
  if (unit === 'ft') return `${niceNum(m * FT)} ft`;
  if (m >= 10000) return `${niceNum(m / 1000)} km`;
  return `${niceNum(m)} m`;
}
export const fmtBoth = (m) => `${fmtH(m, 'm')} · ${fmtH(m, 'ft')}`;

export function parseGuess(raw, unit) {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase().replace(/[,\s_]/g, '');
  if (!s) return null;
  let u = unit;
  let mult = 1;
  const m = s.match(/(km|kilometers?|kilometres?|ft|feet|foot|'|m|meters?|metres?)$/);
  if (m) {
    s = s.slice(0, -m[1].length);
    u = /^k/.test(m[1]) ? 'km' : /^(ft|feet|foot|')$/.test(m[1]) ? 'ft' : 'm';
  }
  if (s.endsWith('k')) { mult = 1000; s = s.slice(0, -1); }
  const n = parseFloat(s) * mult;
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return null;
  if (u === 'ft') return n / FT;
  if (u === 'km') return n * 1000;
  return n;
}

export function offText(g, actual) {
  if (g == null) return 'No guess this time.';
  const d = (g - actual) / actual;
  if (Math.abs(d) < 0.005) return 'Exactly right!';
  const x = (r) => (r >= 10 ? Math.round(r).toLocaleString('en-US') : r.toFixed(1));
  if (g > actual) return g / actual >= 2 ? `${x(g / actual)}× too high` : `${Math.round(d * 100)}% too high`;
  return actual / g >= 2 ? `${x(actual / g)}× too low` : `${Math.round(-d * 100)}% too low`;
}

export const EMOJI = { bullseye: '🟨', spoton: '🟩', close: '🟦', ballpark: '🟪', wayoff: '🟫', lost: '⬛', pass: '⬜' };
export const bandByKey = (k) => BANDS.find((b) => b.key === k) || { key: 'pass', name: 'Passed', color: '#6b7a90', icon: '–', points: 0 };

export function squaresHTML(results, total, cur) {
  let h = '';
  for (let i = 0; i < total; i++) {
    const r = results[i];
    const style = r ? ` style="background:${bandByKey(r.band).color};border-color:${bandByKey(r.band).color}"` : '';
    h += `<i class="${i === cur && !r ? 'cur' : ''}"${style}></i>`;
  }
  return h;
}

// ---------- colours / names
export const COLORS = ['#ff7a6b', '#ffd166', '#56e0f0', '#9b8cff', '#7bd389', '#ff8fd0', '#ffa94d', '#e8eef5'];
export const myColor = () => load('ho_color', COLORS[0]);
const ADJ = ['Bubbly', 'Salty', 'Wobbly', 'Sleepy', 'Zippy', 'Glowy', 'Curious', 'Brave', 'Tiny', 'Giant', 'Sneaky', 'Jolly', 'Swirly', 'Inky', 'Snappy', 'Breezy'];
const NOUN = ['Squid', 'Octopus', 'Urchin', 'Seal', 'Puffin', 'Krab', 'Narwhal', 'Otter', 'Eel', 'Manta', 'Shrimp', 'Turtle', 'Walrus', 'Lobster', 'Clam', 'Dolphin'];
export const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
export function myName() {
  let n = load('ho_name', null);
  if (!n) { n = randomName(); save('ho_name', n); }
  return n;
}

// ---------- answer bar
const CIRC = 2 * Math.PI * 20;
export function createBar({ onSubmit, onPass, onTimeout, allowPass = true, placeholder = window.innerWidth < 480 ? 'e.g. 120' : 'How tall? e.g. 120' }) {
  const el = document.createElement('div');
  el.className = 'bar';
  el.innerHTML = `
    ${allowPass ? '<button class="btn ghost small" data-pass type="button">Pass</button>' : ''}
    <div class="timer"><svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="20"/><circle class="fg" cx="23" cy="23" r="20" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><b>30</b></div>
    <form class="guess" autocomplete="off">
      <input name="g" inputmode="decimal" enterkeyhint="go" placeholder="${esc(placeholder)}" aria-label="Your guess" />
      <div class="units" role="group" aria-label="Unit">
        <button type="button" data-u="m">m</button><button type="button" data-u="ft">ft</button>
      </div>
    </form>
    <button class="btn coral" data-dive type="button" aria-label="Lock in guess">Dive ${icon('down', 18)}</button>`;
  const input = el.querySelector('input');
  const form = el.querySelector('form');
  const ring = el.querySelector('.fg');
  const tnum = el.querySelector('.timer b');
  const timerEl = el.querySelector('.timer');
  const passBtn = el.querySelector('[data-pass]');
  let unit = getUnit();
  let iv = null, endsAt = 0, dur = 30000, locked = false, lastSec = -1, passArmed = false, passT;

  const paintUnits = () => el.querySelectorAll('[data-u]').forEach((b) => b.classList.toggle('on', b.dataset.u === unit));
  paintUnits();
  el.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
    unit = b.dataset.u; setUnit(unit); paintUnits(); sfx.click(); input.focus();
  }));

  const submit = () => {
    if (locked) return;
    const m = parseGuess(input.value, unit);
    if (m == null) {
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      toast(input.value ? "That doesn't look like a height" : 'Type a height first');
      input.focus();
      return;
    }
    onSubmit(m);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  el.querySelector('[data-dive]').addEventListener('click', submit);
  passBtn?.addEventListener('click', () => {
    if (locked) return;
    if (!passArmed) {
      passArmed = true; passBtn.textContent = 'Sure?';
      clearTimeout(passT);
      passT = setTimeout(() => { passArmed = false; passBtn.textContent = 'Pass'; }, 2500);
      return;
    }
    passArmed = false; passBtn.textContent = 'Pass';
    onPass?.();
  });

  const tick = () => {
    const left = Math.max(0, endsAt - Date.now());
    const sec = Math.ceil(left / 1000);
    tnum.textContent = sec;
    ring.style.strokeDashoffset = String(CIRC * (1 - left / dur));
    timerEl.classList.toggle('low', sec <= 5);
    if (sec !== lastSec && sec <= 5 && sec > 0) sfx.tick();
    lastSec = sec;
    if (left <= 0) {
      stop();
      if (!locked) onTimeout?.(parseGuess(input.value, unit));
    }
  };
  function start(ends, totalMs) {
    endsAt = ends; dur = totalMs || ends - Date.now(); lastSec = -1;
    stop(); tick(); iv = setInterval(tick, 200);
  }
  function stop() { clearInterval(iv); iv = null; }
  function lock(v = true) {
    locked = v;
    el.querySelectorAll('button,input').forEach((b) => (b.disabled = v));
    if (v) stop();
  }
  function reset(focus = true) {
    lock(false); input.value = '';
    passArmed = false; if (passBtn) passBtn.textContent = 'Pass';
    if (focus && !isTouch()) input.focus();
    else if (focus) setTimeout(() => input.focus(), 50);
  }
  return { el, start, stop, lock, reset, input, get unit() { return unit; } };
}
export const isTouch = () => matchMedia('(pointer: coarse)').matches;

// ---------- reveal card
export function revealHTML({ band, pts, mult, guess, actual, fact, footLeft, nextLabel = 'Next ' + icon('right', 18), showNext = true, extra = '' }) {
  const max = Math.max(guess || 0, actual);
  const pY = guess ? Math.max(2, (guess / max) * 100) : 0;
  const pA = Math.max(2, (actual / max) * 100);
  return `
  <div class="reveal card">
    <div class="band-head"><h2 style="color:${band.color}">${band.icon} ${esc(band.name)}</h2><div class="pts">+${pts}${mult > 1 ? ` <small class="muted">×${mult}</small>` : ''}</div></div>
    <div class="bands">${BANDS.map((b) => `<i style="background:${b.color}" class="${b.key === band.key ? 'on' : ''}" title="${b.name}"></i>`).join('')}</div>
    <div class="cmp">
      <div class="cmp-row"><span class="lbl">You</span><div class="track"><div class="fill" style="background:var(--coral)" data-w="${pY}"></div></div><span class="val">${fmtH(guess)}</span></div>
      <div class="cmp-row"><span class="lbl">Actual</span><div class="track"><div class="fill" style="background:var(--sun)" data-w="${pA}"></div></div><span class="val">${fmtH(actual)}</span></div>
    </div>
    <div class="muted" style="font-size:13px"><b style="color:var(--ink)">${offText(guess, actual)}</b> · Actual ${fmtBoth(actual)}</div>
    ${extra}
    ${fact ? `<div class="fact">${esc(fact)}</div>` : ''}
    <div class="reveal-foot"><span class="muted">${footLeft || ''}</span>${showNext ? `<button class="btn sun" data-next type="button">${nextLabel}</button>` : ''}</div>
  </div>`;
}
export function animateBars(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.fill[data-w]').forEach((f) => (f.style.width = `${f.dataset.w}%`));
  }));
}

// ---------- modal
export function modal(html, { onClose } = {}) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'modal';
  bg.innerHTML = `<div class="modal card" role="dialog" aria-modal="true">${html}<button class="btn ghost" data-close type="button">Close</button></div>`;
  const close = () => { bg.remove(); onClose?.(); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(bg);
  bg.querySelector('[data-close]').focus();
  return close;
}
export function closeModal() { document.getElementById('modal')?.remove(); }

export const CREDIT = `<div class="credit">Made by <a href="https://mas0ng.com/?from=project_footer&amp;project=heightopus" target="_blank" rel="noopener">mas0ng.com</a> · <a href="/privacy/">Privacy</a></div>`;

export function helpModal() {
  modal(`
    <h2>How to play</h2>
    <ol>
      <li>Each question asks how tall (or high) something is.</li>
      <li>Type your best guess in metres or feet. You have 30 seconds.</li>
      <li>The closer you are, the more points you score, and the deeper your octopus dives.</li>
      <li>Later questions count more: ×1, ×1, ×2, ×2, ×2, ×3, ×3, ×3, ×4, ×4.</li>
      <li>A perfect daily (2,500 pts) reaches Challenger Deep, 10,935m down.</li>
    </ol>
    <div class="band-table">
      ${BANDS.map((b) => `<div><span style="color:${b.color};font-weight:800">${b.icon} ${b.name}</span><span class="muted">${b.max === Infinity ? 'more than 2× off' : b.max >= 2 ? 'up to 2× off' : `within ${Math.round((b.max - 1) * 100)}%`} · ${b.points} pts</span></div>`).join('')}
    </div>
    <p class="muted" style="margin:0;font-size:14px">Tip: you can type units like <b>1.2k</b>, <b>300ft</b> or <b>8.8km</b>. Everyone gets the same 10 questions each day.</p>
    ${CREDIT}
  `);
}
