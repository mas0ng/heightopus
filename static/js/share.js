// Result sharing: a pixel-art result card (PNG) plus a rich text version.
import { ZONES, zoneIndex, drawOcto, fmtM } from './scene.js';
import { bandByKey, EMOJI, esc, modal, toast, isTouch } from './ui.js';
import { sfx } from './sfx.js';
import { icon } from './icons.js';

const SITE = 'https://heightopus.com';
const ZONE_EMOJI = ['🌊', '🌿', '🪸', '⚓', '🌒', '🎐', '🦑', '🕳️', '✨'];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hash = (i, j) => {
  let n = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/**
 * d = { label, depth, pts, max, title, bands: ['bullseye', ...], pct?: {betterThan, players}, place?: '1st of 4', color }
 */
export function shareText(d) {
  const zi = zoneIndex(d.depth);
  const squares = d.bands.map((b) => EMOJI[b] || '⬜');
  const rows = [];
  for (let i = 0; i < squares.length; i += 5) rows.push(squares.slice(i, i + 5).join(''));
  const bulls = d.bands.filter((b) => b === 'bullseye').length;
  const lines = [
    `🐙 Heightopus ${d.label}`,
    `${ZONE_EMOJI[zi] || '🌊'} Dove ${fmtM(d.depth)} · ${ZONES[zi].name}`,
    `⭐ ${d.pts.toLocaleString('en-US')}/${d.max.toLocaleString('en-US')} pts · ${d.title}`,
    ...rows,
  ];
  const extra = [];
  if (d.place) extra.push(`🏆 ${d.place}`);
  if (bulls) extra.push(`🎯 ${bulls} Bullseye${bulls > 1 ? 's' : ''}`);
  if (d.pct && d.pct.players > 1) extra.push(`📈 Deeper than ${d.pct.betterThan}% of divers`);
  if (extra.length) lines.push(extra.join(' · '));
  lines.push('', `Can you dive deeper? ${SITE}`);
  return lines.join('\n');
}

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('700 140px "Pixelify Sans"'),
      document.fonts.load('800 40px "DM Sans"'),
      document.fonts.load('500 30px "DM Sans"'),
    ]);
  } catch { /* fall back to system fonts */ }
}

function outlined(g, text, x, y, fill, outline, w) {
  g.lineJoin = 'round';
  g.lineWidth = w;
  g.strokeStyle = outline;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export async function renderCard(d) {
  await fontsReady();
  const S = 1080;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const zi = zoneIndex(d.depth);
  const z = ZONES[zi];
  const next = ZONES[Math.min(zi + 1, ZONES.length - 1)];

  // water
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, rgb(z.wA[0]));
  grad.addColorStop(0.55, rgb(z.wA[1]));
  grad.addColorStop(1, rgb(next.wA[1].map((v) => v * 0.6)));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // pixel rock walls (24px "pixels")
  const P = 24;
  for (let row = 0; row < S / P; row++) {
    for (const side of [0, 1]) {
      const w = 2 + Math.round(1.6 + Math.sin(row * 0.55 + side * 3) * 1.3 + Math.sin(row * 1.7 + side) * 0.7);
      for (let k = 0; k < w; k++) {
        const n = hash(row * 7 + side, k);
        g.fillStyle = rgb(k === w - 1 ? z.rA[0] : n < 0.25 ? z.rA[2] : z.rA[1]);
        g.fillRect(side ? S - (k + 1) * P : k * P, row * P, P, P);
      }
    }
  }
  // bubbles / marine snow
  for (let i = 0; i < 60; i++) {
    const x = 120 + hash(i, 1) * (S - 240), y = hash(i, 2) * S, s = hash(i, 3) < 0.3 ? 12 : 6;
    g.fillStyle = `rgba(220,245,255,${0.15 + hash(i, 4) * 0.35})`;
    g.fillRect(Math.round(x / 6) * 6, Math.round(y / 6) * 6, s, s);
  }
  // darkness + light around the octopus in deep zones
  if (z.dark > 0) {
    const r = g.createRadialGradient(S / 2, 330, 60, S / 2, 330, 520);
    r.addColorStop(0, 'rgba(1,4,14,0)');
    r.addColorStop(1, `rgba(1,4,14,${z.dark})`);
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
  }

  // octopus
  const oc = document.createElement('canvas');
  oc.width = 16; oc.height = 15;
  drawOcto(oc.getContext('2d'), 0, 0, d.color || '#ff7a6b', 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(oc, S / 2 - 120, 190, 240, 225);

  // header
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '700 64px "Pixelify Sans", monospace';
  outlined(g, 'Heightopus', S / 2, 120, '#ffd166', '#2a1736', 12);
  g.font = '800 30px "DM Sans", sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillText(d.label.toUpperCase(), S / 2, 168);

  // result panel
  const px = 110, py = 470, pw = S - 220, ph = 480;
  g.fillStyle = 'rgba(2,8,16,0.55)';
  roundRect(g, px, py + 10, pw, ph, 30); g.fill();
  g.fillStyle = 'rgba(11,27,46,0.94)';
  roundRect(g, px, py, pw, ph, 30); g.fill();
  g.strokeStyle = '#2f5878'; g.lineWidth = 4; g.stroke();

  g.font = '700 150px "Pixelify Sans", monospace';
  outlined(g, fmtM(d.depth), S / 2, py + 170, '#ffd166', '#2a1736', 14);
  g.font = '800 40px "DM Sans", sans-serif';
  g.fillStyle = '#f3efe0';
  g.fillText(`${ZONE_EMOJI[zi] || ''} ${z.name}`.trim(), S / 2, py + 235);
  g.font = '500 30px "DM Sans", sans-serif';
  g.fillStyle = '#a9bfd0';
  const sub = [`${d.pts.toLocaleString('en-US')} / ${d.max.toLocaleString('en-US')} pts`, d.title, d.place].filter(Boolean).join('  ·  ');
  g.fillText(sub, S / 2, py + 285);

  // band squares
  const n = d.bands.length, sq = n > 10 ? 40 : 58, gap = 12;
  const total = n * sq + (n - 1) * gap;
  let x = S / 2 - total / 2;
  for (const b of d.bands) {
    const col = bandByKey(b).color;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(g, x, py + 330 + 6, sq, sq, 10); g.fill();
    g.fillStyle = col;
    roundRect(g, x, py + 330, sq, sq, 10); g.fill();
    x += sq + gap;
  }
  if (d.pct && d.pct.players > 1) {
    g.font = '800 30px "DM Sans", sans-serif';
    g.fillStyle = '#56e0f0';
    g.fillText(`Deeper than ${d.pct.betterThan}% of today's divers`, S / 2, py + 445);
  }

  // footer
  g.font = '700 44px "Pixelify Sans", monospace';
  outlined(g, 'heightopus.com', S / 2, S - 50, '#ffffff', '#0b2a44', 10);
  return c;
}

const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));

export async function openShare(d) {
  const text = shareText(d);
  const close = modal(`
    <h2>Share your dive</h2>
    <div class="share-wrap">
    <div class="share-preview"><div class="share-loading muted">Drawing your card…</div></div>
    <div class="share-side">
    <pre class="share-text">${esc(text)}</pre>
    <div class="share-actions">
      <button class="btn coral" data-s="native" type="button" hidden>${icon('share')} Share…</button>
      <button class="btn sun" data-s="copy" type="button">${icon('copy')} Copy text</button>
      <button class="btn aqua" data-s="img" type="button" hidden>${icon('image')} Copy image</button>
      <button class="btn ghost" data-s="save" type="button">${icon('download')} Save image</button>
      <a class="btn ghost" data-s="x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}">${icon('send')} Post on X</a>
      <a class="btn ghost" data-s="wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
    </div>
    </div>
    </div>`);
  const root = document.getElementById('modal');
  if (!root) return;
  let blob = null;
  try {
    const canvas = await renderCard(d);
    blob = await toBlob(canvas);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.alt = `Heightopus result card: ${fmtM(d.depth)}`;
    img.src = url;
    root.querySelector('.share-preview').replaceChildren(img);
  } catch {
    root.querySelector('.share-preview').innerHTML = '<div class="muted">Could not draw the image, but you can still share the text.</div>';
  }
  const file = blob ? new File([blob], `heightopus-${Math.round(d.depth)}m.png`, { type: 'image/png' }) : null;
  const canShareFile = file && navigator.canShare && navigator.canShare({ files: [file] });
  const nativeBtn = root.querySelector('[data-s="native"]');
  if (navigator.share && (isTouch() || canShareFile)) nativeBtn.hidden = false;
  const imgBtn = root.querySelector('[data-s="img"]');
  if (blob && window.ClipboardItem && navigator.clipboard?.write) imgBtn.hidden = false;

  root.querySelector('.share-actions').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-s]');
    if (!b) return;
    sfx.click();
    try {
      switch (b.dataset.s) {
        case 'native':
          await navigator.share(canShareFile ? { files: [file], text } : { text });
          break;
        case 'copy':
          await navigator.clipboard.writeText(text);
          toast('Result copied!');
          break;
        case 'img':
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('Image copied!');
          break;
        case 'save': {
          if (!blob) { toast('Image not ready'); break; }
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = file.name;
          document.body.appendChild(a); a.click(); a.remove();
          break;
        }
        default:
          break; // X / WhatsApp are plain links
      }
    } catch { /* cancelled or blocked */ }
  });
  return close;
}
