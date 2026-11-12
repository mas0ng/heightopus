// Heightopus pixel ocean. Everything is drawn procedurally at a low internal
// resolution and scaled up with `image-rendering: pixelated`.
import { rng } from './scoring.js';

const PX = 0.5;        // internal pixels per metre of depth
const SURF = 10;       // depth 0 sits this many px below the waterline
const CH = 96;         // chunk height (cached world tiles)

const H2A = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;
function hash(x, y) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export const ZONES = [
  { from: 0,     name: 'Sunlit Shallows',     sub: 'Warm, bright water and curious little fish.', w: ['#46c3dd', '#2c9fc6'], rock: ['#e3c48a', '#c9a86a', '#9c7c45'], decor: 'shallow', fish: 0.75, fishC: ['#ffd166', '#ff9f1c', '#ff6b6b', '#ffffff'] },
  { from: 150,   name: 'Kelp Forest',         sub: 'Swaying golden-green towers of kelp.', w: ['#2c9fc6', '#1f84ad'], rock: ['#7d8f52', '#5f7140', '#41502b'], decor: 'kelp', fish: 0.6, fishC: ['#f4a261', '#e9c46a', '#cfe8ef'] },
  { from: 600,   name: 'Coral Drop-off',      sub: 'The reef tumbles away into deep blue.', w: ['#1f84ad', '#196694'], rock: ['#9a6585', '#7a4c69', '#55334a'], decor: 'coral', fish: 0.75, fishC: ['#ffd166', '#06d6a0', '#ff70a6', '#70d6ff'] },
  { from: 1500,  name: 'Shipwreck Graveyard', sub: 'Old hulls rest where the light fades.', w: ['#196694', '#134e76'], rock: ['#62627a', '#4b4b62', '#34344a'], decor: 'wreck', fish: 0.4, fishC: ['#a8b5c4', '#c9d6df', '#8da9c4'] },
  { from: 2600,  name: 'Twilight Zone',       sub: 'The last of the sunlight gives out here.', w: ['#134e76', '#0c3556'], rock: ['#3e4f6a', '#2f3d56', '#212c41'], decor: 'twilight', fish: 0.3, jelly: 0.25, fishC: ['#bde0fe', '#a2d2ff'], glow: true, dark: 0.15 },
  { from: 4000,  name: 'Midnight Zone',       sub: 'Down here, only things that glow can be seen.', w: ['#0c3556', '#08213b'], rock: ['#25334e', '#1a263c', '#111a2c'], decor: 'midnight', fish: 0.22, jelly: 0.25, angler: 0.14, fishC: ['#7cf5ff', '#9bffb0'], glow: true, dark: 0.5 },
  { from: 6500,  name: 'The Abyss',           sub: 'Cold, crushing and very, very quiet.', w: ['#08213b', '#051529'], rock: ['#1c253b', '#131b2d', '#0c121f'], decor: 'abyss', fish: 0.12, jelly: 0.16, angler: 0.18, fishC: ['#7cf5ff', '#ff9bf5'], glow: true, dark: 0.66 },
  { from: 9000,  name: 'Hadal Trench',        sub: 'The deepest cracks in the whole planet.', w: ['#051529', '#030c1b'], rock: ['#171d30', '#0f1422', '#080c17'], decor: 'trench', fish: 0.06, jelly: 0.16, angler: 0.1, fishC: ['#7cf5ff'], glow: true, dark: 0.74 },
  { from: 11000, name: 'The Unknown',         sub: 'Nobody has ever been this deep. Except you.', w: ['#030c1b', '#0b0522'], rock: ['#1d1235', '#140b28', '#0b051a'], decor: 'unknown', fish: 0.1, jelly: 0.3, fishC: ['#d0a2ff', '#7cf5ff'], glow: true, dark: 0.74 },
].map((z) => ({ ...z, wA: z.w.map(H2A), rA: z.rock.map(H2A), fishA: z.fishC.map(H2A), dark: z.dark || 0 }));

export const LANDMARKS = [
  { m: 332, label: 'Deepest scuba dive' },
  { m: 2250, label: 'Sperm whale dive' },
  { m: 3688, label: 'Average ocean depth' },
  { m: 3800, label: 'Titanic wreck' },
  { m: 8336, label: 'Deepest fish filmed' },
  { m: 10935, label: 'Challenger Deep' },
];

export function zoneIndex(depth) {
  let i = 0;
  while (i + 1 < ZONES.length && depth >= ZONES[i + 1].from) i++;
  return i;
}
export const zoneAt = (d) => ZONES[zoneIndex(d)];

function zoneT(depth) {
  const i = zoneIndex(depth);
  const z = ZONES[i], nx = ZONES[i + 1];
  const t = clamp((depth - z.from) / (nx ? nx.from - z.from : 4000), 0, 1);
  return { i, z, nx, t };
}
function waterAt(depth) {
  const { z, t } = zoneT(depth);
  return mixA(z.wA[0], z.wA[1], t);
}
function darkAt(depth) {
  const { z, nx, t } = zoneT(depth);
  return lerp(z.dark, nx ? nx.dark : z.dark, t);
}

// ---------------------------------------------------------------- octopus
const OCTO_HEAD = [
  '.....ooo', '...oohhb', '..ohhbbb', '.ohbbbbb', '.obbbbbb', 'obbbbbbb',
  'obbwwbbb', 'obbwkbbb', 'obcbbbbb', 'osbbbbbb', '.osbbbbb',
];
const OCTO_LEGS = [
  ['.obsobbs', 'obo.obbo', 'oo..obo.', '....oo..'],
  ['..osbbbs', '..obobbo', '.ob.obo.', '.o...o..'],
];
const mirror = (r) => r + r.split('').reverse().join('');
const OCTO_FRAMES = OCTO_LEGS.map((legs) => [...OCTO_HEAD, ...legs].map(mirror));

function shade(hex, f) {
  const c = H2A(hex);
  return css(f > 0 ? mixA(c, [255, 255, 255], f) : mixA(c, [10, 8, 30], -f));
}
const palCache = new Map();
function octoPal(color) {
  if (!palCache.has(color)) {
    palCache.set(color, {
      o: shade(color, -0.65), b: color, h: shade(color, 0.4), s: shade(color, -0.25),
      w: '#ffffff', k: '#1b1030', c: shade(color, 0.6),
    });
  }
  return palCache.get(color);
}
export function drawOcto(g, x, y, color, frame) {
  const p = octoPal(color);
  const rows = OCTO_FRAMES[frame];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      g.fillStyle = p[ch];
      g.fillRect(x + c, y + r, 1, 1);
    }
  }
}

// ---------------------------------------------------------------- scene
export class Scene {
  constructor(canvas, overlay) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.ov = overlay;
    this.og = overlay.getContext('2d');
    this.dark = document.createElement('canvas');
    this.dg = this.dark.getContext('2d');
    this.chunks = new Map();
    this.divers = new Map();
    this.followId = null;
    this.showGauge = false;
    this.showLabels = false;
    this.onZone = null;
    this.lastZone = -1;
    this.bubbles = [];
    this.snow = Array.from({ length: 60 }, (_, i) => ({ x: hash(i, 1) * 400, y: hash(i, 2) * 400, s: 2 + hash(i, 3) * 4 }));
    this.t = 0;
    this.camY = 0;
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = Math.max(2, Math.round(Math.min(w, h) / 180));
    this.scale = scale;
    this.W = Math.ceil(w / scale);
    this.H = Math.ceil(h / scale);
    this.cv.width = this.W; this.cv.height = this.H;
    this.dark.width = this.W; this.dark.height = this.H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.cssW = w; this.cssH = h;
    this.ov.width = Math.round(w * dpr); this.ov.height = Math.round(h * dpr);
    this.wallBase = clamp(this.W * 0.07, 8, 28);
    this.chunks.clear();
  }

  // ---- divers
  setDivers(list, { instant = false } = {}) {
    const seen = new Set();
    list.forEach((d, i) => {
      seen.add(d.id);
      const cur = this.divers.get(d.id);
      if (cur) {
        cur.target = d.depth; cur.color = d.color; cur.name = d.name; cur.slot = i;
        if (instant) cur.depth = d.depth;
      } else {
        this.divers.set(d.id, { id: d.id, depth: instant ? d.depth : Math.min(d.depth, 0), target: d.depth, color: d.color, name: d.name, slot: i, phase: Math.random() * 6 });
      }
    });
    for (const id of [...this.divers.keys()]) if (!seen.has(id)) this.divers.delete(id);
    if (!this.followId || !this.divers.has(this.followId)) this.followId = list[0]?.id ?? null;
    if (instant) this.lastZone = -1;
  }
  follow(id) { this.followId = id; }
  get followed() { return this.divers.get(this.followId); }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---- world helpers
  wallW(wy, side) {
    const s = side ? 1777 : 0;
    const depth = wy / PX;
    const trench = 1 + clamp((depth - 8500) / 2000, 0, 1) * 1.1;
    const n = Math.sin((wy + s) * 0.045) * 5 + Math.sin((wy + s) * 0.11 + 1.3) * 3 + Math.sin((wy + s) * 0.27 + 2.1) * 1.5;
    return Math.max(3, Math.round(this.wallBase * trench + n));
  }
  rockAt(x, wy) {
    const depth = wy / PX;
    const i = zoneIndex(depth);
    const z = ZONES[i];
    if (i > 0 && depth - z.from < 60 && hash(x, wy) > (depth - z.from) / 60) return ZONES[i - 1].rA;
    return z.rA;
  }

  chunk(ci) {
    let c = this.chunks.get(ci);
    if (c) return c;
    if (this.chunks.size > 40) this.chunks.delete(this.chunks.keys().next().value);
    c = this.renderChunk(ci);
    this.chunks.set(ci, c);
    return c;
  }

  renderChunk(ci) {
    const { W } = this;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = CH;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, CH);
    const d = img.data;
    for (let r = 0; r < CH; r++) {
      const wy = ci * CH + r;
      const water = waterAt((Math.floor(wy / 4) * 4) / PX);
      const wl = this.wallW(wy, 0), wr = this.wallW(wy, 1);
      for (let x = 0; x < W; x++) {
        let col;
        if (x < wl || x >= W - wr) {
          const rk = this.rockAt(x, wy);
          const edge = (x >= wl - 2 && x < wl) || (x >= W - wr && x < W - wr + 2);
          const n = hash(x >> 1, wy >> 1);
          col = edge ? rk[0] : n < 0.2 ? rk[2] : n > 0.94 ? rk[0] : rk[1];
        } else {
          col = water;
          const n = hash(x, wy);
          if (n < 0.015) col = mixA(water, [255, 255, 255], 0.08);
        }
        const o = (r * W + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const glows = [];
    const rand = rng(ci * 7919 + 13);
    const depth = (ci * CH + CH / 2) / PX;
    const z = zoneAt(depth);
    if (z.decor === 'kelp') this.bgKelp(g, ci, rand);
    if (z.decor === 'wreck' && rand() < 0.35) this.bgHull(g, rand);
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const left = rand() < 0.5;
      const r = 8 + Math.floor(rand() * (CH - 12));
      const wy = ci * CH + r;
      const x = left ? this.wallW(wy, 0) : W - this.wallW(wy, 1) - 1;
      this.decor(g, z.decor, x, r, left ? 1 : -1, rand, glows);
    }
    return { cv, glows };
  }

  bgKelp(g, ci, rand) {
    const { W } = this;
    const m = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < m; k++) {
      const x0 = Math.floor(W * 0.25 + rand() * W * 0.5);
      const ph = rand() * 6;
      g.fillStyle = 'rgba(20,70,60,0.35)';
      for (let y = 0; y < CH; y++) {
        const x = x0 + Math.round(Math.sin((ci * CH + y) * 0.06 + ph) * 3);
        g.fillRect(x, y, 2, 1);
        if ((ci * CH + y) % 9 === 0) g.fillRect(x + 2, y, 3, 1);
        if ((ci * CH + y) % 9 === 4) g.fillRect(x - 3, y, 3, 1);
      }
    }
  }

  bgHull(g, rand) {
    const { W } = this;
    const w = Math.floor(W * 0.35 + rand() * W * 0.2);
    const x0 = rand() < 0.5 ? this.wallBase - 4 : W - this.wallBase - w + 4;
    const y0 = 20 + Math.floor(rand() * 40);
    const tilt = rand() < 0.5 ? 1 : -1;
    for (let i = 0; i < w; i++) {
      const y = y0 + Math.round((i / w) * 8 * tilt);
      const hgt = 16 - Math.round(Math.abs(i - w / 2) / (w / 2) * 6);
      g.fillStyle = 'rgba(40,30,30,0.55)';
      g.fillRect(x0 + i, y, 1, hgt);
      g.fillStyle = 'rgba(110,80,60,0.5)';
      if (i % 6 === 0) g.fillRect(x0 + i, y, 1, hgt);
      g.fillRect(x0 + i, y, 1, 1);
      if (i % 10 === 5) { g.fillStyle = 'rgba(160,190,200,0.35)'; g.fillRect(x0 + i, y + 5, 2, 2); }
    }
  }

  decor(g, type, x, y, dir, rand, glows) {
    const px = (dx, dy, c) => { g.fillStyle = c; g.fillRect(x + dx * dir, y + dy, 1, 1); };
    const pick = (a) => a[Math.floor(rand() * a.length)];
    switch (type) {
      case 'shallow': {
        if (rand() < 0.5) {
          const c = pick(['#3fa34d', '#6ab04c', '#2d8a4e']);
          for (let s = 0; s < 3; s++) for (let i = 0; i < 5 + s * 2; i++) px(1 + s * 2 + (i % 2), -i, c);
        } else {
          const c = pick(['#ff7f50', '#ffb347', '#ff6b81']);
          [[1, 0], [2, 0], [3, 0], [2, -1], [2, 1], [0, -1], [4, 1]].forEach(([a, b]) => px(a, b, c));
        }
        break;
      }
      case 'kelp': {
        const len = 25 + Math.floor(rand() * 35);
        const ph = rand() * 6;
        const cols = ['#c9a227', '#9aa83a', '#6b8f2e'];
        for (let i = 0; i < len; i++) {
          const dx = 2 + Math.round(Math.sin(i * 0.2 + ph) * 2) + Math.min(4, i >> 2);
          px(dx, -i, cols[i % 3 === 0 ? 0 : 1]);
          if (i % 5 === 2) { px(dx + 1, -i, cols[2]); px(dx + 2, -i - 1, cols[2]); }
          if (i % 7 === 4) { px(dx - 1, -i, cols[2]); px(dx - 2, -i - 1, cols[2]); }
        }
        break;
      }
      case 'coral': {
        const c = pick(['#ff6b8b', '#ff9f43', '#c56cf0', '#ffd166', '#48dbfb']);
        const k = rand();
        if (k < 0.45) {
          const h = 5 + Math.floor(rand() * 7);
          for (let i = 0; i < h; i++) px(1, -i, c);
          for (let i = 0; i < 4; i++) { px(1 + i, -h + 2 - i, c); px(1 - Math.min(i, 1), -h + 4 - i, c); }
          px(5, -h - 2, c);
        } else if (k < 0.75) {
          for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) if ((a - 2.5) ** 2 / 9 + (b - 1.5) ** 2 / 4 <= 1) px(1 + a, -b, (a + b) % 3 ? c : shade(c, -0.3));
        } else {
          for (let i = 0; i < 7; i++) for (let j = -i >> 1; j <= i >> 1; j++) if ((i + j) % 2 === 0) px(1 + i, j - i, c);
        }
        break;
      }
      case 'wreck': {
        const k = rand();
        if (k < 0.4) {
          const len = 10 + Math.floor(rand() * 14);
          for (let i = 0; i < len; i++) { px(1 + i, -Math.floor(i / 3), '#6b4f3a'); px(1 + i, -Math.floor(i / 3) + 1, '#4a3628'); }
        } else if (k < 0.7) {
          const c = '#7f8c8d';
          for (let i = 0; i < 8; i++) px(4, -i, c);
          [[2, -7], [3, -7], [5, -7], [6, -7], [1, -1], [2, 0], [3, 0], [5, 0], [6, 0], [7, -1]].forEach(([a, b]) => px(a, b, c));
          px(4, -9, c); px(3, -8, c); px(5, -8, c);
        } else {
          for (let a = 0; a < 7; a++) for (let b = 0; b < 5; b++) px(1 + a, -b, b === 4 || a === 0 || a === 6 ? '#5d4030' : '#8a5a36');
          px(4, -2, '#ffd166'); px(3, -4, '#ffe08a'); glows.push({ x: x + 4 * dir, y: y - 3, c: '#ffd166', r: 4 });
        }
        break;
      }
      case 'twilight': {
        const c = pick(['#f6d6ad', '#e8a0bf', '#c3aed6']);
        const h = 4 + Math.floor(rand() * 7);
        for (let i = 0; i < h; i++) { px(1, -i, c); px(2, -i, shade(c, -0.25)); }
        px(1, -h, '#fff');
        break;
      }
      case 'midnight':
      case 'unknown': {
        const c = type === 'unknown' ? pick(['#d0a2ff', '#ff9bf5']) : pick(['#7cf5ff', '#9bffb0', '#5ce1e6']);
        const m = 2 + Math.floor(rand() * 4);
        for (let i = 0; i < m; i++) glows.push({ x: x + (1 + Math.floor(rand() * 5)) * dir, y: y - Math.floor(rand() * 8), c, r: 3 });
        if (type === 'unknown') for (let i = 0; i < 6; i++) { px(1 + (i >> 1), -i, '#6a3fa0'); px(2 + (i >> 1), -i, '#a77bdb'); }
        break;
      }
      case 'abyss': {
        if (rand() < 0.5) {
          for (let w = 0; w < 3; w++) {
            const h = 5 + Math.floor(rand() * 6);
            for (let i = 0; i < h; i++) px(1 + w * 2, -i, '#d9d4c7');
            px(1 + w * 2, -h, '#ff4d4d'); glows.push({ x: x + (1 + w * 2) * dir, y: y - h, c: '#ff6b6b', r: 3 });
          }
        } else {
          for (let i = 0; i < 8; i++) { px(1, -i, '#3b3f4a'); px(2, -i, '#2b2e36'); px(3, -i, '#3b3f4a'); }
          glows.push({ x: x + 2 * dir, y: y - 9, c: '#ff9f43', r: 5 });
        }
        break;
      }
      case 'trench': {
        const c = '#5ce1e6';
        const h = 4 + Math.floor(rand() * 6);
        for (let i = 0; i < h; i++) { px(1 + (i >> 2), -i, c); if (i < h - 2) px(2 + (i >> 2), -i, '#2a8f95'); }
        glows.push({ x: x + 2 * dir, y: y - h + 1, c, r: 4 });
        break;
      }
    }
  }

  // ---- frame
  diverX(dv) {
    const n = this.divers.size;
    const f = this.followed;
    if (n <= 1) return this.W / 2;
    const spread = Math.min(22, (this.W - this.wallBase * 2 - 24) / Math.max(1, n - 1));
    const followSlot = f ? f.slot : 0;
    const offset = (dv.slot - followSlot) * spread;
    const mid = this.W / 2 - ((n - 1) / 2 - followSlot) * spread * 0;
    return clamp(mid + offset, this.wallBase + 10, this.W - this.wallBase - 10);
  }

  frame(dt) {
    this.t += dt;
    const { g, W, H, t } = this;

    for (const dv of this.divers.values()) {
      const diff = dv.target - dv.depth;
      const prev = dv.depth;
      if (Math.abs(diff) < 0.5) dv.depth = dv.target;
      else dv.depth += diff * Math.min(1, dt * 1.6) + Math.sign(diff) * Math.min(Math.abs(diff), 20 * dt);
      dv.moving = Math.abs(dv.depth - prev) > 3 * dt * 10;
      if (dv.moving && Math.random() < 0.6) this.bubbles.push({ x: this.diverX(dv) + (Math.random() * 10 - 5), wy: dv.depth * PX + SURF - 4, life: 2.5 });
    }
    const f = this.followed;
    const fd = f ? f.depth : 0;
    const targetCam = fd * PX + SURF - H * (this.anchor ?? 0.42);
    this.camY = targetCam;
    const camY = Math.round(this.camY);

    // zone change
    const zi = zoneIndex(Math.max(0, fd));
    if (zi !== this.lastZone) {
      if (this.lastZone !== -1 && this.onZone) this.onZone(ZONES[zi], zi > this.lastZone);
      this.lastZone = zi;
    }

    // sky
    if (camY < 0) {
      const sky0 = [126, 200, 255], sky1 = [214, 240, 255];
      for (let y = 0; y < Math.min(H, -camY); y += 2) {
        const wy = camY + y;
        g.fillStyle = css(mixA(sky0, sky1, clamp(1 + wy / 120, 0, 1)));
        g.fillRect(0, y, W, 2);
      }
      const sunY = Math.round(-camY * 0.35);
      g.fillStyle = '#fff6c9';
      for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) if (a * a + b * b <= 26) g.fillRect(W * 0.78 + a, sunY + b, 1, 1);
      for (let c = 0; c < 4; c++) {
        const cx = mod(c * 83 + t * (3 + c), W + 40) - 20;
        const cy = Math.round(-camY * (0.18 + c * 0.14));
        g.fillStyle = '#ffffff';
        g.fillRect(cx, cy, 16, 3); g.fillRect(cx + 3, cy - 2, 9, 2); g.fillRect(cx + 6, cy - 4, 4, 2);
      }
    }

    // world chunks
    const c0 = Math.floor(Math.max(0, camY) / CH), c1 = Math.floor((camY + H) / CH);
    const glows = [];
    for (let ci = c0; ci <= c1; ci++) {
      if ((ci + 1) * CH < 0) continue;
      const ch = this.chunk(ci);
      g.drawImage(ch.cv, 0, ci * CH - camY);
      for (const gl of ch.glows) glows.push({ x: gl.x, y: gl.y + ci * CH - camY, c: gl.c, r: gl.r, tw: true });
    }

    // waves at the surface
    if (camY < 4) {
      for (let x = 0; x < W; x++) {
        const y0 = Math.round(Math.sin(x * 0.3 + t * 1.8) + Math.sin(x * 0.13 - t) * 0.8) - camY;
        g.fillStyle = '#7fdcf0'; g.fillRect(x, y0, 1, 3);
        g.fillStyle = '#e9fbff'; g.fillRect(x, y0 - 1, 1, 1);
      }
    }

    // light rays
    const camDepth = (camY + H / 2) / PX;
    if (camDepth < 700) {
      const a = 0.16 * (1 - camDepth / 700);
      const top = Math.max(0, -camY);
      g.fillStyle = `rgba(255,255,240,${a})`;
      for (let i = 0; i < 4; i++) {
        const x0 = mod(i * 97 + t * 3, W + 80) - 40;
        g.beginPath();
        g.moveTo(x0, top); g.lineTo(x0 + 10, top); g.lineTo(x0 - 30, H); g.lineTo(x0 - 52, H);
        g.fill();
      }
    }

    // life
    const deferred = [];
    this.drawLife(g, camY, deferred, glows);

    // bubbles
    this.bubbles = this.bubbles.filter((b) => (b.life -= dt) > 0 && b.wy > 0);
    g.fillStyle = 'rgba(220,248,255,0.85)';
    for (const b of this.bubbles) {
      b.wy -= 18 * dt;
      const x = Math.round(b.x + Math.sin(b.wy * 0.3) * 1.2);
      g.fillRect(x, Math.round(b.wy - camY), 1, 1);
      if (b.life > 2) g.fillRect(x + 1, Math.round(b.wy - camY) - 1, 1, 1);
    }

    // divers
    const lights = [];
    for (const dv of this.divers.values()) {
      const x = Math.round(this.diverX(dv));
      const y = Math.round(dv.depth * PX + SURF - camY + Math.sin(t * 2 + dv.phase) * 1.5);
      const frame = dv.moving ? Math.floor(t * 8) % 2 : Math.floor(t * 1.4 + dv.phase) % 2;
      drawOcto(g, x - 8, y - 7, dv.color, frame);
      dv.sx = x; dv.sy = y;
      lights.push({ x, y, r: dv.id === this.followId ? 44 : 26 });
    }
    if (!this.divers.size && Math.random() < 0.02) this.bubbles.push({ x: W / 2, wy: camY + H * 0.6, life: 3 });

    // darkness
    const dk = darkAt(Math.max(0, camDepth));
    if (dk > 0.01) {
      const dg = this.dg;
      dg.globalCompositeOperation = 'source-over';
      dg.globalAlpha = 1;
      dg.clearRect(0, 0, W, H);
      dg.fillStyle = `rgba(1,4,14,${dk})`;
      dg.fillRect(0, 0, W, H);
      dg.globalCompositeOperation = 'destination-out';
      for (const L of lights.concat(deferred.filter((d) => d.light).map((d) => d.light))) {
        for (const [k, a] of [[1, 0.25], [0.72, 0.35], [0.45, 0.6]]) {
          dg.globalAlpha = a;
          dg.beginPath(); dg.arc(L.x, L.y, L.r * k, 0, Math.PI * 2); dg.fill();
        }
      }
      dg.globalAlpha = 1;
      g.drawImage(this.dark, 0, 0);
    }

    // glowing things on top of the dark
    for (const d of deferred) d.draw && d.draw(g);
    for (const gl of glows) {
      const tw = gl.tw ? 0.6 + 0.4 * Math.sin(t * 2 + gl.x * 0.7 + gl.y) : 1;
      g.fillStyle = gl.c;
      g.globalAlpha = 0.18 * tw;
      g.beginPath(); g.arc(gl.x, gl.y, gl.r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.9 * tw;
      g.fillRect(Math.round(gl.x), Math.round(gl.y), 1, 1);
      g.globalAlpha = 1;
    }

    // marine snow
    const snowA = clamp((camDepth - 900) / 2500, 0, 0.7);
    if (snowA > 0) {
      g.fillStyle = `rgba(210,232,255,${snowA})`;
      for (const s of this.snow) {
        s.y += s.s * dt; s.x += Math.sin(t + s.y) * 0.05;
        g.fillRect(Math.round(mod(s.x, W)), Math.round(mod(s.y, H)), 1, 1);
      }
    }

    this.drawOverlay(camY);
  }

  drawLife(g, camY, deferred, glows) {
    const { W, H, t } = this;
    const BAND = 56;
    const b0 = Math.floor(camY / BAND) - 1, b1 = Math.floor((camY + H) / BAND) + 1;
    for (let b = Math.max(0, b0); b <= b1; b++) {
      const r = rng(b * 9973 + 17);
      const depth = (b * BAND) / PX;
      const z = zoneAt(depth);
      const k = r();
      const baseY = b * BAND + 8 + r() * (BAND - 16) - camY;
      if (k < (z.fish || 0)) {
        const n = 3 + Math.floor(r() * 5);
        const dir = r() < 0.5 ? -1 : 1;
        const spd = 5 + r() * 12;
        const ph = r() * 500;
        const col = z.fishA[Math.floor(r() * z.fishA.length)];
        const span = W + 30;
        for (let i = 0; i < n; i++) {
          const x = Math.round(mod(ph + t * spd * dir + i * 7, span) - 15);
          const y = Math.round(baseY + (i % 3) * 3 - 3 + Math.sin(t * 2 + i));
          const draw = (gg) => {
            gg.fillStyle = css(col);
            const d = dir;
            gg.fillRect(Math.min(x, x + 2 * d), y, 3, 1);
            gg.fillRect(x + d, y - 1, 1, 1); gg.fillRect(x + d, y + 1, 1, 1);
            gg.fillRect(x - d, y - 1, 1, 1); gg.fillRect(x - d, y + 1, 1, 1);
            gg.fillStyle = '#0b1a2a'; gg.fillRect(x + 2 * d, y, 1, 1);
          };
          if (z.glow) { deferred.push({ draw }); glows.push({ x, y, c: css(col), r: 3 }); }
          else draw(g);
        }
      } else if (k < (z.fish || 0) + (z.jelly || 0)) {
        const x = Math.round(this.wallBase + 10 + r() * (W - this.wallBase * 2 - 20));
        const ph = r() * 6;
        const y = Math.round(baseY + Math.sin(t * 1.1 + ph) * 4);
        const c = r() < 0.5 ? '#ff9bf5' : '#9be7ff';
        const draw = (gg) => {
          gg.fillStyle = c;
          gg.globalAlpha = 0.85;
          gg.fillRect(x - 2, y - 3, 5, 1); gg.fillRect(x - 3, y - 2, 7, 2);
          gg.globalAlpha = 0.6;
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4 + (i % 2) * 2; j++) gg.fillRect(x - 3 + i * 2 + Math.round(Math.sin(t * 3 + j + i) * 0.6), y + j, 1, 1);
          gg.globalAlpha = 1;
        };
        deferred.push({ draw, light: z.glow ? { x, y, r: 8 } : null });
        if (z.glow) glows.push({ x, y: y - 1, c, r: 6 });
      } else if (k < (z.fish || 0) + (z.jelly || 0) + (z.angler || 0)) {
        const dir = r() < 0.5 ? -1 : 1;
        const ph = r() * 400;
        const x = Math.round(mod(ph + t * 3 * dir, W + 40) - 20);
        const y = Math.round(baseY);
        const draw = (gg) => {
          const p = (a, b, c) => { gg.fillStyle = c; gg.fillRect(x + a * dir, y + b, 1, 1); };
          for (let a = -5; a <= 4; a++) for (let b = -3; b <= 3; b++) if ((a * a) / 25 + (b * b) / 10 <= 1) p(a, b, '#34304a');
          p(-6, -2, '#34304a'); p(-6, 2, '#34304a'); p(-7, -3, '#34304a'); p(-7, 3, '#34304a');
          p(2, -1, '#ffffff'); p(2, -2, '#ff5e5e');
          [3, 4].forEach((a) => { p(a, 1, '#f1f1f1'); }); p(4, 2, '#f1f1f1');
          p(1, -4, '#4a4466'); p(2, -5, '#4a4466'); p(3, -6, '#4a4466'); p(4, -6, '#4a4466');
        };
        deferred.push({ draw, light: { x: x + 5 * dir, y: y - 7, r: 10 } });
        glows.push({ x: x + 5 * dir, y: y - 7, c: '#fff3a3', r: 6 });
      }
    }
    // sperm whale near its record depth
    const wy = 2250 * PX + SURF - camY;
    if (wy > -20 && wy < H + 20) {
      const x = Math.round(mod(this.t * 5, W + 140) - 70);
      g.fillStyle = '#123b5c';
      for (let a = 0; a < 46; a++) {
        const h = a < 30 ? 12 : Math.max(2, 12 - (a - 30));
        g.fillRect(x + a, Math.round(wy - h / 2), 1, h);
      }
      g.fillRect(x + 46, Math.round(wy) - 5, 2, 10); g.fillRect(x + 48, Math.round(wy) - 7, 2, 4); g.fillRect(x + 48, Math.round(wy) + 3, 2, 4);
      g.fillStyle = '#0a2033'; g.fillRect(x + 5, Math.round(wy) - 2, 1, 1);
    }
  }

  drawOverlay(camY) {
    const o = this.og, s = this.scale, dpr = this.dpr;
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.clearRect(0, 0, this.cssW, this.cssH);
    const yOf = (m) => (m * PX + SURF - camY) * s;

    if (this.showLabels) {
      o.font = '700 11px "DM Sans", system-ui, sans-serif';
      o.textAlign = 'center';
      for (const dv of this.divers.values()) {
        if (dv.sx == null) continue;
        const x = dv.sx * s, y = (dv.sy - 10) * s;
        const label = dv.id === this.followId ? 'You' : dv.name || '';
        const w = o.measureText(label).width + 10;
        o.fillStyle = 'rgba(8,20,36,0.8)';
        roundRect(o, x - w / 2, y - 16, w, 16, 5); o.fill();
        o.fillStyle = dv.color;
        o.fillText(label, x, y - 4);
      }
    }

    if (!this.showGauge) return;
    const gw = Math.min(64, Math.max(48, this.cssW * 0.06));
    const gx = this.cssW - gw;
    const surfY = Math.max(0, yOf(0));
    o.fillStyle = 'rgba(4,14,28,0.32)';
    o.fillRect(gx, surfY, gw, this.cssH - surfY);
    const pxPerM = PX * s;
    const step = [5, 10, 25, 50, 100, 250, 500, 1000, 2500].find((st) => st * pxPerM >= 36) || 5000;
    const top = Math.max(0, (camY - SURF) / PX), bot = (camY + this.H) / PX;
    const f = this.followed;
    const markY = f ? yOf(f.depth) : -999;
    o.font = '600 10px "DM Sans", system-ui, sans-serif';
    o.textAlign = 'right';
    for (let m = Math.ceil(top / step) * step; m <= bot; m += step) {
      const y = yOf(m);
      o.fillStyle = 'rgba(230,245,255,0.55)';
      o.fillRect(gx, Math.round(y), m % (step * 2) === 0 ? 10 : 6, 1);
      if (Math.abs(y - markY) > 14) {
        o.fillStyle = 'rgba(230,245,255,0.8)';
        o.fillText(fmtM(m), this.cssW - 6, y + 3.5);
      }
    }
    // other players (party): pills beside the gauge, pinned to the edge when off-screen
    const pillYs = [];
    if (this.showLabels && this.divers.size > 1) {
      const top = 82, bottom = this.cssH - 14, gap = 22;
      const items = [];
      for (const dv of this.divers.values()) {
        if (dv.id === this.followId) continue;
        const real = yOf(Math.max(0, dv.depth));
        const dir = real < top ? -1 : real > bottom ? 1 : 0;
        items.push({ dv, dotY: clamp(real, top, bottom), y: clamp(real, top, bottom), dir });
      }
      items.sort((a, b) => a.y - b.y);
      for (let k = 1; k < items.length; k++) if (items[k].y - items[k - 1].y < gap) items[k].y = items[k - 1].y + gap;
      for (let k = items.length - 1; k >= 0; k--) {
        const max = k === items.length - 1 ? bottom : items[k + 1].y - gap;
        if (items[k].y > max) items[k].y = max;
      }
      o.font = '700 11px "DM Sans", system-ui, sans-serif';
      o.textAlign = 'right';
      for (const it of items) {
        const { dv } = it;
        const name = (dv.name || 'Diver').length > 12 ? `${dv.name.slice(0, 11)}…` : dv.name || 'Diver';
        const txt = `${it.dir < 0 ? '▲ ' : it.dir > 0 ? '▼ ' : ''}${name} · ${fmtM(Math.max(0, Math.round(dv.depth)))}`;
        const w = o.measureText(txt).width + 18;
        const x0 = gx - w - 8;
        o.strokeStyle = dv.color;
        o.lineWidth = 1.5;
        o.beginPath(); o.moveTo(gx - 8, it.y); o.lineTo(gx + 4, it.dotY); o.stroke();
        o.fillStyle = dv.color;
        o.beginPath(); o.arc(gx + 6, it.dotY, 4, 0, Math.PI * 2); o.fill();
        o.fillStyle = 'rgba(8,20,36,0.9)';
        roundRect(o, x0, it.y - 10, w, 20, 7); o.fill();
        o.fillStyle = dv.color;
        roundRect(o, x0 + 4, it.y - 5, 4, 10, 2); o.fill();
        o.fillStyle = '#f3efe0';
        o.fillText(txt, gx - 12, it.y + 4);
        pillYs.push(it.y);
      }
    }

    // landmarks (label hidden if it would sit on a player's pill)
    for (const L of LANDMARKS) {
      const y = yOf(L.m);
      if (y < 64 || y > this.cssH + 10) continue;
      o.fillStyle = '#ffd166';
      o.fillRect(gx - 6, Math.round(y), gw + 6, 1);
      if (pillYs.some((py) => Math.abs(py - y) < 22)) continue;
      o.font = '700 10px "DM Sans", system-ui, sans-serif';
      o.textAlign = 'right';
      const txt = `${L.label} · ${fmtM(L.m)}`;
      const w = o.measureText(txt).width + 10;
      o.fillStyle = 'rgba(8,20,36,0.85)';
      roundRect(o, gx - w - 8, y - 9, w, 18, 6); o.fill();
      o.fillStyle = '#ffd166';
      o.fillText(txt, gx - 13, y + 3.5);
    }

    if (f) {
      o.fillStyle = '#ff7a6b';
      roundRect(o, gx + 3, markY - 10, gw - 6, 20, 7); o.fill();
      o.fillStyle = '#1b0f1f';
      o.font = '800 11px "DM Sans", system-ui, sans-serif';
      o.textAlign = 'center';
      o.fillText(fmtM(Math.max(0, Math.round(f.depth))), gx + gw / 2, markY + 4);
    }
  }
}

function roundRect(o, x, y, w, h, r) {
  o.beginPath();
  o.moveTo(x + r, y); o.arcTo(x + w, y, x + w, y + h, r); o.arcTo(x + w, y + h, x, y + h, r);
  o.arcTo(x, y + h, x, y, r); o.arcTo(x, y, x + w, y, r); o.closePath();
}
export function fmtM(m) { return `${Math.round(m).toLocaleString('en-US')}m`; }
