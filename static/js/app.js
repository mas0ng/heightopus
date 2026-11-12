import { Scene, zoneAt, fmtM } from './scene.js';
import { scoreGuess, depthFor, titleFor, rng, shuffled, multFor, maxPointsFor, PASS_BAND, dayNumber } from './scoring.js';
import {
  $, esc, load, save, toast, showZone, createBar, revealHTML, animateBars, helpModal, closeModal,
  squaresHTML, bandByKey, EMOJI, myColor, fmtH, CREDIT, isTouch,
} from './ui.js';
import { sfx, isMuted, setMuted } from './sfx.js';
import { api, SITE_URL } from './config.js';
import { mountParty } from './party.js';
import { openShare } from './share.js';
import { icon } from './icons.js';

const app = $('#app');
const scene = new Scene($('#scene'), $('#overlay'));
scene.onZone = (z, down) => { if (down) { showZone(z); sfx.zone(); } };
scene.start();

let bank = [];
let cleanup = null;

// ---------- daily selection
const byId = (id) => bank.find((q) => q.id === id);
function dailyQuestions(day) {
  const per = Math.floor(bank.length / 10);
  const idx = Math.max(0, day - 1);
  const cycle = Math.floor(idx / per), slot = idx % per;
  return shuffled(bank, rng(cycle * 1013 + 7)).slice(slot * 10, slot * 10 + 10);
}
const dailyKey = (day) => `ho_daily_${day}`;
const totalPts = (answers) => answers.reduce((s, a) => s + a.pts, 0);
function msToMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
}
const hms = (ms) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':');
};

// ---------- router
function route() {
  cleanup?.();
  cleanup = null;
  closeModal();
  $('#zone').classList.remove('show');
  scene.anchor = 0.42;
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'play') return (cleanup = solo('daily'));
  if (a === 'unlimited') return (cleanup = solo('unlimited'));
  if (a === 'results') return (cleanup = results());
  if (a === 'party') return (cleanup = mountParty({ app, scene, code: b }));
  cleanup = home();
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    sfx.click();
    const target = `#/${go.dataset.go}`;
    if (location.hash === target || (target === '#/' && !location.hash)) route();
    else location.hash = target;
  }
  if (e.target.closest('[data-help]')) { sfx.click(); helpModal(); }
});

// ---------- home
function home() {
  const day = dayNumber();
  const st = load(dailyKey(day));
  const stats = load('ho_stats', { streak: 0, best: 0, played: 0 });
  const done = st?.done;
  const pts = st ? totalPts(st.answers) : 0;
  scene.showGauge = false;
  scene.showLabels = false;
  scene.setDivers([{ id: 'me', color: myColor(), depth: 0 }], { instant: true });

  app.innerHTML = `
  <div class="home">
    <h1 class="logo">Height<span class="o">opus</span></h1>
    <div style="display:grid;gap:8px;width:min(560px,100%)">
      <div class="home-card card">
        <div class="eyebrow">Daily #${day} · 10 questions · Free</div>
        <h2>How tall is it, really?</h2>
        <p>Guess the height of famous landmarks, skyscrapers, mountains, animals and people. The closer you get, the deeper your octopus dives, all the way down to Challenger Deep.</p>
        ${done ? `<div class="stat-line"><span class="chip sun">Today: ${fmtM(depthFor(pts))} · ${pts.toLocaleString()} pts</span></div>` : ''}
        <div class="row">
          <button class="btn coral big" data-go="${done ? 'results' : 'play'}" type="button">${done ? "See today's dive" : st?.answers?.length ? 'Continue dive' : 'Dive in'} ${icon('down')}</button>
          <button class="btn aqua big" data-go="party" type="button">${icon('users')} Party</button>
        </div>
        <div class="mini-links">
          <button class="linkish" data-go="unlimited" type="button">Unlimited</button>
          <a class="linkish" href="/how-to-play/">How to play</a>
          <a class="linkish" href="/heights/">All heights</a>
          <span class="muted" style="padding:6px 0">New questions in <b id="cd">${hms(msToMidnight())}</b></span>
        </div>
        ${stats.played ? `<div class="stat-line"><span class="chip">🔥 Streak ${stats.streak}</span><span class="chip">Best ${fmtM(stats.best)}</span><span class="chip">Dives ${stats.played}</span></div>` : ''}
      </div>
      ${CREDIT}
    </div>
  </div>`;
  const iv = setInterval(() => { const c = $('#cd'); if (c) c.textContent = hms(msToMidnight()); }, 1000);
  return () => clearInterval(iv);
}

// ---------- solo play
function solo(mode) {
  const day = dayNumber();
  let qs, st;
  if (mode === 'daily') {
    st = load(dailyKey(day)) || { day, answers: [], done: false };
    if (st.done) { location.replace('#/results'); return null; }
    if (!st.ids) {
      // pin today's set so later edits to the question bank can't change it mid-day
      const fresh = dailyQuestions(day).map((q) => q.id);
      const had = st.answers.map((a) => a.id);
      st.ids = [...had, ...fresh.filter((id) => !had.includes(id))].slice(0, 10);
      save(dailyKey(day), st);
    }
    qs = st.ids.map(byId).filter(Boolean);
  } else {
    qs = shuffled(bank, Math.random).slice(0, 10);
    st = { answers: [] };
  }
  const persist = () => mode === 'daily' && save(dailyKey(day), st);
  const total = qs.length;
  let i = st.answers.length;
  let phase = 'question';
  let alive = true;

  scene.showGauge = true;
  scene.showLabels = false;
  scene.setDivers([{ id: 'me', color: myColor(), depth: depthFor(totalPts(st.answers)) }], { instant: true });

  app.innerHTML = `
    <div class="hud">
      <div class="hud-left"><b id="hDepth">0m</b><span id="hPts">0 pts</span></div>
      <div class="hud-mid"><div class="squares" id="sq"></div><small id="qn"></small></div>
      <div class="hud-right">
        <button class="btn icon ghost" id="mute" type="button" aria-label="Toggle sound">${icon(isMuted() ? 'mute' : 'volume')}</button>
        <button class="btn icon ghost" data-help type="button" aria-label="How to play">${icon('help')}</button>
        <button class="btn icon ghost" id="quit" type="button" aria-label="Back to home">${icon('home')}</button>
      </div>
    </div>
    <div class="play-main">
      <div id="stage" style="width:min(600px,100%)"></div>
      <div id="barSlot" style="width:min(600px,100%);display:flex;justify-content:center"></div>
    </div>`;

  $('#mute').addEventListener('click', (e) => { setMuted(!isMuted()); e.currentTarget.innerHTML = icon(isMuted() ? 'mute' : 'volume'); });
  $('#quit').addEventListener('click', () => { location.hash = '#/'; });

  const bar = createBar({
    onSubmit: (m) => answer(m),
    onPass: () => answer(null),
    onTimeout: (m) => answer(m),
  });
  $('#barSlot').appendChild(bar.el);

  // live depth readout
  let raf;
  const hud = () => {
    if (!alive) return;
    const f = scene.followed;
    if (f) $('#hDepth').textContent = fmtM(Math.max(0, f.depth));
    raf = requestAnimationFrame(hud);
  };
  hud();

  function paintHud() {
    $('#hPts').textContent = `${totalPts(st.answers).toLocaleString()} pts`;
    $('#sq').innerHTML = squaresHTML(st.answers, total, i);
    $('#qn').innerHTML = `Q ${Math.min(i + 1, total)} / ${total}<span class="sfx">${mode === 'unlimited' ? ' · Unlimited' : ` · Daily #${day}`}</span>`;
  }

  function showQuestion() {
    phase = 'question';
    const q = qs[i];
    const mult = multFor(i);
    $('#stage').innerHTML = `
      <div class="q-card card">
        <div class="eyebrow">${esc(q.cat)}${mult > 1 ? `<span class="mult">×${mult}</span>` : ''}</div>
        <div class="q-text">${esc(q.q)}</div>
        <div class="q-hint">The closer your guess, the deeper you dive.</div>
      </div>`;
    paintHud();
    bar.reset();
    bar.start(Date.now() + 30000, 30000);
  }

  function answer(m) {
    if (phase !== 'question' || !alive) return;
    phase = 'reveal';
    bar.lock();
    const q = qs[i];
    const r = m == null ? { band: PASS_BAND, mult: multFor(i), points: 0 } : scoreGuess(m, q.m, i);
    st.answers.push({ id: q.id, g: m, pts: r.points, band: r.band.key });
    persist();
    const pts = totalPts(st.answers);
    const depth = depthFor(pts);
    scene.setDivers([{ id: 'me', color: myColor(), depth }]);
    if (r.points >= 75 * r.mult) sfx.great(); else if (r.points > 0) sfx.ok(); else sfx.bad();
    if (r.points > 0) setTimeout(() => sfx.dive(), 150);
    if (isTouch()) bar.input.blur();
    const last = i === total - 1;
    $('#stage').innerHTML = revealHTML({
      band: r.band, pts: r.points, mult: r.mult, guess: m, actual: q.m, fact: q.fact,
      footLeft: `Now heading to <b style="color:var(--ink)">${fmtM(depth)}</b>`,
      nextLabel: last ? 'See results ' + icon('right', 18) : 'Next ' + icon('right', 18),
    });
    animateBars($('#stage'));
    i++;
    paintHud();
    $('[data-next]').addEventListener('click', next);
    if (!isTouch()) $('[data-next]').focus();
  }

  function next() {
    if (phase !== 'reveal' || !alive) return;
    sfx.click();
    if (i >= total) return finish();
    showQuestion();
  }

  function finish() {
    if (mode === 'daily') {
      st.done = true;
      persist();
      const stats = load('ho_stats', { streak: 0, best: 0, played: 0, lastDay: 0 });
      if (stats.lastDay !== day) {
        stats.streak = stats.lastDay === day - 1 ? stats.streak + 1 : 1;
        stats.lastDay = day;
        stats.played += 1;
        stats.best = Math.max(stats.best || 0, depthFor(totalPts(st.answers)));
        save('ho_stats', stats);
      }
      location.hash = '#/results';
    } else {
      cleanupLocal();
      cleanup = results({ unlimited: { qs, answers: st.answers } });
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && phase === 'reveal' && !document.getElementById('modal')) { e.preventDefault(); next(); }
  };
  document.addEventListener('keydown', onKey);

  if (i >= total) finish();
  else showQuestion();

  function cleanupLocal() {
    alive = false;
    bar.stop();
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
  }
  return cleanupLocal;
}

// ---------- results
function results(opts = {}) {
  const day = dayNumber();
  let qs, answers, st = null;
  if (opts.unlimited) {
    ({ qs, answers } = opts.unlimited);
  } else {
    st = load(dailyKey(day));
    if (!st?.done) { location.replace('#/'); return null; }
    qs = (st.ids || st.answers.map((a) => a.id)).map(byId).filter(Boolean);
    answers = st.answers;
  }
  const pts = totalPts(answers);
  const max = maxPointsFor(qs.length);
  const depth = depthFor(pts, max);
  const zone = zoneAt(depth);
  const title = titleFor(pts * (2500 / max));
  scene.showGauge = true;
  scene.showLabels = false;
  scene.setDivers([{ id: 'me', color: myColor(), depth }], { instant: true });

  const rows = qs.map((q, k) => {
    const a = answers[k] || {};
    const b = bandByKey(a.band);
    return `<div class="qrow"><span class="n">Q${k + 1}${multFor(k) > 1 ? `<br>×${multFor(k)}` : ''}</span>
      <div class="qq">${esc(q.q)}<small>You: ${fmtH(a.g)} · Actual: ${fmtH(q.m)}</small></div>
      <div class="p" style="color:${b.color}">+${a.pts ?? 0}<small>${esc(b.name)}</small></div></div>`;
  }).join('');
  const strip = answers.map((a) => `<i style="background:${bandByKey(a.band).color}"></i>`).join('');

  app.innerHTML = `
    <div class="hud">
      <div class="hud-left"><b>${fmtM(depth)}</b><span>${pts.toLocaleString()} pts</span></div>
      <div></div>
      <div class="hud-right"><button class="btn icon ghost" data-go="" type="button" aria-label="Home">${icon('home')}</button></div>
    </div>
    <div class="results">
      <div class="card">
        <div class="eyebrow">${opts.unlimited ? 'Unlimited run' : `Daily #${day}`} · Dive complete</div>
        <div class="res-head">
          <div><div class="big-depth">${fmtM(depth)}</div><div class="muted" style="margin-top:6px">${esc(zone.name)} · ${pts.toLocaleString()} / ${max.toLocaleString()} pts</div></div>
          <span class="chip sun" style="font-size:14px">✦ ${esc(title)}</span>
        </div>
        <div class="strip">${strip}</div>
        <div id="pct" class="muted" style="font-size:14px"></div>
        <div class="row">
          <button class="btn coral" id="share" type="button">${icon('share')} Share result</button>
          <button class="btn aqua" data-go="party" type="button">${icon('users')} Play with friends</button>
        </div>
        <div class="row">
          <button class="btn ghost" data-go="unlimited" type="button">${opts.unlimited ? 'Dive again' : 'Play Unlimited'}</button>
          ${opts.unlimited ? '' : `<span class="muted" style="align-self:center;flex:1 1 140px;text-align:center">Next daily in <b id="cd">${hms(msToMidnight())}</b></span>`}
        </div>
        <div class="qlist">${rows}</div>
        ${CREDIT}
      </div>
    </div>`;

  $('#share').addEventListener('click', () => {
    sfx.click();
    openShare({
      label: opts.unlimited ? 'Unlimited' : `Daily #${day}`,
      depth, pts, max, title,
      bands: answers.map((a) => a.band),
      pct: st?.pct || null,
      color: myColor(),
    });
  });

  // percentile vs today's divers
  if (st) {
    const showPct = (r) => {
      if (!r || r.players == null) return;
      $('#pct') && ($('#pct').innerHTML = r.players > 1
        ? `Deeper than <b style="color:var(--ink)">${r.betterThan}%</b> of today's ${r.players.toLocaleString()} divers`
        : 'You are one of the first divers today!');
    };
    if (st.pct) showPct(st.pct);
    else {
      fetch(api(`/api/daily/${day}/score`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ score: pts }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => { if (r) { st.pct = r; save(dailyKey(day), st); showPct(r); } })
        .catch(() => {});
    }
  }

  const iv = setInterval(() => { const c = $('#cd'); if (c) c.textContent = hms(msToMidnight()); }, 1000);
  return () => clearInterval(iv);
}

// ---------- boot
(async function boot() {
  try {
    bank = await fetch('data/questions.json').then((r) => r.json());
  } catch {
    app.innerHTML = '<div class="home"><div class="card">Could not load questions. Please refresh.</div></div>';
    return;
  }
  window.addEventListener('hashchange', route);
  route();
})();
