import { depthFor, maxPointsFor, multFor, titleFor } from './scoring.js';
import { fmtM } from './scene.js';
import {
  $, esc, load, save, toast, createBar, revealHTML, animateBars, COLORS, myName, myColor,
  squaresHTML, bandByKey, fmtH, CREDIT, isTouch, offText,
} from './ui.js';
import { sfx, isMuted, setMuted } from './sfx.js';
import { api, wsUrl } from './config.js';
import { icon } from './icons.js';
import { openShare } from './share.js';

function token() {
  let t = load('ho_token', null);
  if (!t) { t = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); save('ho_token', t); }
  return t;
}

export function mountParty({ app, scene, code }) {
  let alive = true;
  let ws = null, retries = 0, retryT = null, pingT = null;
  let S = null;          // latest server state
  let offset = 0;        // server clock - local clock
  let viewKey = '';
  let bar = null;
  let revealT = null;
  let quotaT = null;

  scene.showLabels = true;
  scene.showGauge = false;
  scene.anchor = 0.24;
  scene.setDivers([{ id: 'me', color: myColor(), depth: 0, name: myName() }], { instant: true });

  const hudHTML = (left) => `
    <div class="hud">
      <div class="hud-left">${left}</div>
      <div></div>
      <div class="hud-right">
        <button class="btn icon ghost" id="mute" type="button" aria-label="Toggle sound">${icon(isMuted() ? 'mute' : 'volume')}</button>
        <button class="btn icon ghost" data-help type="button" aria-label="How to play">${icon('help')}</button>
        <button class="btn icon ghost" id="leave" type="button" aria-label="Leave party">${icon('logout')}</button>
      </div>
    </div>`;
  const bindHud = () => {
    $('#mute')?.addEventListener('click', (e) => { setMuted(!isMuted()); e.currentTarget.innerHTML = icon(isMuted() ? 'mute' : 'volume'); });
    $('#leave')?.addEventListener('click', () => { location.hash = '#/'; });
  };

  const identityHTML = () => `
    <div class="field"><label for="pname">Your name</label><input id="pname" class="text-in" maxlength="18" value="${esc(myName())}" /></div>
    <div class="field"><label>Your octopus</label><div class="swatches">${COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === myColor() ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('')}</div></div>`;
  const bindIdentity = () => {
    $('#pname').addEventListener('input', (e) => {
      save('ho_name', e.target.value.trim().slice(0, 18) || myName());
      scene.setDivers([{ id: 'me', color: myColor(), depth: 0, name: myName() }]);
    });
    app.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      save('ho_color', b.dataset.c); sfx.click();
      app.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b));
      scene.setDivers([{ id: 'me', color: myColor(), depth: 0, name: myName() }]);
    }));
  };

  // ------------------------------------------------------------ quota screen
  // Cloudflare's free-plan limits reset at 00:00 UTC.
  function quotaScreen() {
    app.innerHTML = `${hudHTML('<b>Party</b><span>Offline</span>')}
      <div class="party"><div class="card quota-card">
        <h2>Party rooms are full for today</h2>
        <p class="muted" style="margin:0">Our servers have hit their daily quota for online multiplayer, please try again tomorrow.</p>
        <p class="quota-reset">Quota resets in: <b id="qleft">--:--:--</b></p>
        <a class="btn sun" href="#/play">${icon('down')} Play the daily solo</a>
        <button class="btn ghost" data-go="party" type="button">Back to party</button>
        ${CREDIT}
      </div></div>`;
    bindHud();
    const tick = () => {
      const el = $('#qleft');
      if (!alive || !el) { clearInterval(quotaT); return; }
      const now = Date.now();
      const reset = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
      const t = Math.max(0, Math.floor((reset - now) / 1000));
      const pad = (n) => String(n).padStart(2, '0');
      el.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
    };
    clearInterval(quotaT); tick(); quotaT = setInterval(tick, 1000);
  }

  // ------------------------------------------------------------ entry screens
  function partyHome() {
    app.innerHTML = `${hudHTML('<b>Party</b><span>Play live</span>')}
      <div class="party" style="align-items:flex-end">
        <div class="card">
          <h2>Dive together</h2>
          <p class="muted" style="margin:0">Everyone gets the same question at the same time. Closest guesses dive deepest. 2 to 12 players.</p>
          ${identityHTML()}
          <button class="btn coral big" id="host" type="button">Host a room</button>
          <form class="row" id="joinf" autocomplete="off">
            <input id="jcode" class="text-in" style="flex:1 1 140px;text-transform:uppercase;letter-spacing:.15em" maxlength="4" placeholder="CODE" aria-label="Room code" />
            <button class="btn aqua" type="submit">Join</button>
          </form>
          ${CREDIT}
        </div>
      </div>`;
    bindHud(); bindIdentity();
    $('#host').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Creating room…';
      try {
        const r = await fetch(api('/api/party'), { method: 'POST' });
        if (r.status === 429) { quotaScreen(); return; }
        const j = await r.json();
        if (!r.ok || !j.code) throw new Error(j.error || 'failed');
        sessionStorage.setItem('ho_autojoin', j.code);
        location.hash = `#/party/${j.code}`;
      } catch {
        toast('Could not reach the server. Is the API running?', 2600);
        btn.disabled = false; btn.textContent = 'Host a room';
      }
    });
    $('#joinf').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = $('#jcode').value.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(c)) { toast('Room codes are 4 letters'); return; }
      sessionStorage.setItem('ho_autojoin', c);
      location.hash = `#/party/${c}`;
    });
  }

  async function joinScreen(c) {
    app.innerHTML = `${hudHTML('<b>Party</b><span>' + esc(c) + '</span>')}<div class="party"><div class="card"><p class="muted">Looking for room ${esc(c)}…</p></div></div>`;
    bindHud();
    let info;
    try {
      const r = await fetch(api(`/api/party/${c}`));
      if (r.status === 429) { if (alive) quotaScreen(); return; }
      info = r.ok ? await r.json() : null;
    } catch { info = undefined; }
    if (!alive) return;
    if (info === undefined || !info) {
      app.querySelector('.party .card').innerHTML = `<h2>${info === undefined ? 'Server unreachable' : 'Room not found'}</h2>
        <p class="muted" style="margin:0">${info === undefined ? 'Could not reach the party server.' : `There is no open room called ${esc(c)}. It may have finished.`}</p>
        <button class="btn coral" data-go="party" type="button">Back to party</button>`;
      return;
    }
    if (info.full) {
      app.querySelector('.party .card').innerHTML = `<h2>Room full</h2><p class="muted" style="margin:0">Room ${esc(c)} already has 12 divers.</p><button class="btn coral" data-go="party" type="button">Back</button>`;
      return;
    }
    if (sessionStorage.getItem('ho_autojoin') === c) { sessionStorage.removeItem('ho_autojoin'); return connect(c); }
    app.innerHTML = `${hudHTML('<b>Party</b><span>' + esc(c) + '</span>')}
      <div class="party" style="align-items:flex-end"><div class="card">
        <div class="eyebrow">Party ${esc(c)} · ${info.players} waiting</div>
        <h2>${esc(info.host || 'Someone')} invited you to dive</h2>
        <span class="chip" style="justify-self:start">${info.settings.rounds} questions · ${info.settings.seconds}s each</span>
        ${identityHTML()}
        <button class="btn coral big" id="join" type="button">Join the party</button>
        ${CREDIT}
      </div></div>`;
    bindHud(); bindIdentity();
    $('#join').addEventListener('click', () => connect(c));
  }

  // ------------------------------------------------------------ connection
  function connect(c) {
    if (!alive) return;
    const q = new URLSearchParams({ name: myName(), color: myColor(), token: token() });
    ws = new WebSocket(wsUrl(`/api/party/${c}/ws?${q}`));
    ws.onopen = () => {
      retries = 0;
      clearInterval(pingT);
      pingT = setInterval(() => send({ t: 'ping' }), 25000);
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'state') onState(m);
    };
    ws.onclose = () => {
      clearInterval(pingT);
      if (!alive) return;
      if (retries >= 5) {
        app.innerHTML = `${hudHTML('<b>Party</b><span>' + esc(c) + '</span>')}<div class="party"><div class="card"><h2>Disconnected</h2><p class="muted" style="margin:0">Lost the connection to room ${esc(c)}.</p><div class="row"><button class="btn coral" id="retry" type="button">Try again</button><button class="btn ghost" data-go="party" type="button">Leave</button></div></div></div>`;
        bindHud();
        $('#retry').addEventListener('click', () => { retries = 0; connect(c); });
        return;
      }
      toast('Reconnecting…');
      retryT = setTimeout(() => connect(c), 600 * 2 ** retries++);
    };
  }
  const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };

  // ------------------------------------------------------------ state
  function onState(s) {
    const prev = S;
    S = s;
    offset = s.now - Date.now();
    const me = s.players.find((p) => p.id === s.you);
    const total = s.q?.total || s.settings.rounds;
    const perfect = maxPointsFor(total);
    const inPlay = s.phase !== 'lobby';
    scene.showGauge = inPlay;
    scene.anchor = s.phase === 'question' || s.phase === 'reveal' ? 0.42 : 0.24;
    scene.setDivers(
      s.players.filter((p) => p.connected || inPlay).map((p) => ({ id: p.id, color: p.color, name: p.name, depth: inPlay ? depthFor(p.score, perfect) : 0 })),
      { instant: !prev || (prev.phase === 'over' && s.phase !== 'over') || (prev.phase === 'lobby' && s.phase === 'question') },
    );
    scene.follow(s.you);

    const key = `${s.phase}:${s.q?.index ?? ''}`;
    if (key !== viewKey) {
      viewKey = key;
      if (s.phase === 'reveal' && prev?.phase === 'question') {
        const mine = s.reveal.results.find((r) => r.id === s.you);
        if (mine) { if (mine.pts >= 75 * s.reveal.mult) sfx.great(); else if (mine.pts > 0) sfx.ok(); else sfx.bad(); }
      }
      render(s, me);
    } else update(s, me);
  }

  function render(s, me) {
    clearInterval(revealT);
    bar?.stop();
    bar = null;
    if (s.phase === 'lobby') return lobby(s, me);
    if (s.phase === 'question') return question(s, me);
    if (s.phase === 'reveal') return reveal(s, me);
    if (s.phase === 'over') return over(s, me);
  }

  function update(s, me) {
    if (s.phase === 'lobby' || s.phase === 'over') {
      const pl = $('#plist'); if (pl) pl.innerHTML = playersHTML(s);
      const st = $('#pcount'); if (st) st.textContent = `${s.players.filter((p) => p.connected).length}/12`;
      paintSettings(s);
      const hostLine = $('#hostline'); if (hostLine) hostLine.innerHTML = hostLineHTML(s);
      if (s.hostId === s.you && !$('#start') && s.phase === 'lobby') lobby(s, me);
    }
    if (s.phase === 'question') {
      const sl = $('#slist'); if (sl) sl.innerHTML = sideHTML(s);
    }
  }

  const playersHTML = (s) => s.players.filter((p) => p.connected || s.phase !== 'lobby').map((p) => `
    <div class="player ${p.connected ? '' : 'off'}"><span class="dot" style="background:${p.color}"></span>
      <span class="nm">${esc(p.name)}${p.id === s.you ? ' (you)' : ''}</span>
      ${p.id === s.hostId ? '<span class="tag">HOST</span>' : ''}
      ${s.phase !== 'lobby' ? `<span class="sc">${p.score.toLocaleString()}</span>` : ''}
    </div>`).join('');
  const sideHTML = (s) => s.players.filter((p) => p.connected).map((p) => `
    <div class="player"><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.name)}</span>${p.answered ? '<span style="color:var(--aqua);font-weight:800">✓</span>' : '<span class="muted">…</span>'}</div>`).join('');
  const hostName = (s) => esc(s.players.find((p) => p.id === s.hostId)?.name || 'the host');
  const hostLineHTML = (s) => (s.hostId === s.you ? '' : `<p class="muted" style="margin:0">Waiting for <b style="color:var(--ink)">${hostName(s)}</b> to start the dive…</p>`);

  function segHTML(name, vals, cur, enabled, fmt) {
    return `<div class="seg" data-seg="${name}">${vals.map((v) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}" ${enabled ? '' : 'disabled'}>${fmt(v)}</button>`).join('')}</div>`;
  }
  function paintSettings(s) {
    app.querySelectorAll('[data-seg]').forEach((seg) => {
      const cur = s.settings[seg.dataset.seg];
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === cur));
    });
  }
  function settingsHTML(s) {
    const isHost = s.hostId === s.you;
    return `<div class="row" style="align-items:center">
      ${segHTML('rounds', [5, 10], s.settings.rounds, isHost, (v) => `${v} Qs`)}
      ${segHTML('seconds', [15, 20, 30], s.settings.seconds, isHost, (v) => `${v}s`)}
    </div>`;
  }
  function bindSettings() {
    app.querySelectorAll('[data-seg] button').forEach((b) => b.addEventListener('click', () => {
      sfx.click();
      send({ t: 'settings', [b.closest('[data-seg]').dataset.seg]: Number(b.dataset.v) });
    }));
  }
  function inviteLink(s) { return `${location.origin}${location.pathname}#/party/${s.code}`; }

  function lobby(s) {
    const isHost = s.hostId === s.you;
    app.innerHTML = `${hudHTML(`<b>${esc(s.code)}</b><span>Party lobby</span>`)}
      <div class="party" style="align-items:flex-end"><div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div><div class="eyebrow">Room code</div><div class="code-big">${esc(s.code)}</div></div>
          <button class="btn aqua" id="copy" type="button">${icon('link')} Copy invite link</button>
        </div>
        <div class="field"><label>Divers <span id="pcount">${s.players.filter((p) => p.connected).length}/12</span></label><div class="players" id="plist">${playersHTML(s)}</div></div>
        <div class="field"><label>Settings</label>${settingsHTML(s)}</div>
        ${isHost ? `<button class="btn coral big" id="start" type="button">Start the dive ${icon('down')}</button>
          <p class="muted" style="margin:0;font-size:13px">Share the code or link. You can start on your own to try it out.</p>` : `<div id="hostline">${hostLineHTML(s)}</div>`}
        ${CREDIT}
      </div></div>`;
    bindHud(); bindSettings();
    $('#copy').addEventListener('click', async () => {
      const link = inviteLink(s);
      try {
        if (navigator.share && isTouch()) await navigator.share({ title: 'Heightopus party', text: `Join my Heightopus dive! Code ${s.code}`, url: link });
        else { await navigator.clipboard.writeText(link); toast('Invite link copied!'); }
      } catch {}
    });
    $('#start')?.addEventListener('click', () => { sfx.submit(); send({ t: 'start' }); });
  }

  function playHud(s, me) {
    return hudHTML(`<b id="hDepth">0m</b><span>${(me?.score || 0).toLocaleString()} pts</span>`) +
      `<div class="hud-mid" style="top:8px"><div class="squares">${squaresHTML((me?.results || []).map((b) => ({ band: b })), s.q.total, s.q.index)}</div><small>Q ${s.q.index + 1} / ${s.q.total}<span class="sfx"> · ${esc(s.code)}</span></small></div>`;
  }
  let raf;
  function depthLoop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!alive) return;
      const el = $('#hDepth'); const f = scene.followed;
      if (el && f) el.textContent = fmtM(Math.max(0, f.depth));
      raf = requestAnimationFrame(step);
    };
    step();
  }

  function question(s, me) {
    const mult = multFor(s.q.index);
    app.innerHTML = `${playHud(s, me)}
      <div class="play-main">
        <div class="side-list" id="slist">${sideHTML(s)}</div>
        <div id="stage" style="width:min(600px,100%)"><div class="q-card card">
          <div class="eyebrow">${esc(s.q.cat)} · Party${mult > 1 ? `<span class="mult">×${mult}</span>` : ''}</div>
          <div class="q-text">${esc(s.q.text)}</div>
          <div class="q-hint" id="qhint">Lock in your guess. Nobody sees answers until time's up.</div>
        </div></div>
        <div id="barSlot" style="width:min(600px,100%);display:flex;justify-content:center"></div>
      </div>`;
    bindHud(); depthLoop();
    const lockIn = (m) => {
      if (!bar) return;
      bar.lock();
      send(m == null ? { t: 'pass' } : { t: 'guess', m });
      sfx.submit();
      const h = $('#qhint'); if (h) h.innerHTML = m == null ? 'You passed. Waiting for the others…' : `Locked in <b style="color:var(--sun)">${fmtH(m)}</b>. Waiting for the others…`;
      if (isTouch()) bar.input.blur();
    };
    bar = createBar({ onSubmit: lockIn, onPass: () => lockIn(null), onTimeout: (m) => { if (m != null) lockIn(m); } });
    $('#barSlot').appendChild(bar.el);
    bar.reset();
    const already = me?.answered;
    if (already) { bar.lock(); $('#qhint').textContent = 'Answer locked in. Waiting for the others…'; }
    bar.start(s.q.endsAt - offset, s.q.seconds * 1000);
  }

  function reveal(s, me) {
    const R = s.reveal;
    const last = R.index + 1 >= s.q.total;
    const canSkip = s.hostId === s.you && !!R.allIn;
    const mine = R.results.find((r) => r.id === s.you) || { band: 'pass', pts: 0, m: null };
    const list = R.results.map((r) => {
      const b = bandByKey(r.band);
      return `<div class="player"><span class="dot" style="background:${r.color}"></span>
        <span class="nm">${esc(r.name)}${r.id === s.you ? ' (you)' : ''} ${r.closest ? '<span class="badge" style="background:var(--sun)">Closest</span>' : ''}</span>
        <span class="muted" style="font-size:13px">${r.m == null ? '—' : `${fmtH(r.m)} · ${offText(r.m, R.answer)}`}</span>
        <span class="sc" style="color:${b.color}">+${r.pts}</span></div>`;
    }).join('');
    app.innerHTML = `${playHud({ ...s, q: { ...s.q, index: R.index } }, me)}
      <div class="play-main"><div id="stage" style="width:min(600px,100%)">
        ${revealHTML({
          band: bandByKey(mine.band), pts: mine.pts, mult: R.mult, guess: mine.m, actual: R.answer, fact: null,
          footLeft: `<span id="nextIn"></span>`, showNext: canSkip,
          nextLabel: last ? `Final results ${icon('right', 18)}` : `Next question ${icon('right', 18)}`,
          extra: `<div class="muted" style="font-size:13px;margin-top:-4px">${esc(R.text)}</div><div class="guess-list">${list}</div>`,
        })}
      </div></div>`;
    bindHud(); depthLoop(); animateBars($('#stage'));
    $('[data-next]')?.addEventListener('click', (e) => {
      sfx.submit(); e.currentTarget.disabled = true;
      send({ t: 'next', index: R.index });
    });
    const tick = () => {
      const left = Math.max(0, Math.ceil((R.nextAt - offset - Date.now()) / 1000));
      const el = $('#nextIn'); if (el) el.textContent = (last ? `Final results in ${left}s` : `Next question in ${left}s`);
    };
    tick(); revealT = setInterval(tick, 250);
  }

  function over(s, me) {
    const ranked = s.players.slice().sort((a, b) => b.score - a.score);
    const total = s.settings.rounds;
    const isHost = s.hostId === s.you;
    const myRank = ranked.findIndex((p) => p.id === s.you) + 1;
    const medal = ['🥇', '🥈', '🥉'];
    app.innerHTML = `${hudHTML(`<b>${esc(s.code)}</b><span>Final results</span>`)}
      <div class="party"><div class="card">
        <div class="eyebrow">Dive complete · ${total} questions</div>
        <h2>${ranked[0]?.id === s.you ? 'You dove deepest! 🐙' : `${esc(ranked[0]?.name || '')} dove deepest!`}</h2>
        <div class="muted">You finished <b style="color:var(--ink)">#${myRank}</b> of ${ranked.length} with ${(me?.score || 0).toLocaleString()} pts · ${fmtM(depthFor(me?.score || 0, maxPointsFor(total)))}</div>
        <div class="players" id="plist">${ranked.map((p, k) => `
          <div class="player ${p.connected ? '' : 'off'}"><span style="width:22px;text-align:center">${medal[k] || k + 1}</span><span class="dot" style="background:${p.color}"></span>
            <span class="nm">${esc(p.name)}${p.id === s.you ? ' (you)' : ''}</span>
            <span class="strip" style="gap:2px">${(p.results || []).map((b) => `<i style="width:8px;height:10px;background:${bandByKey(b).color}"></i>`).join('')}</span>
            <span class="sc">${p.score.toLocaleString()}</span></div>`).join('')}</div>
        ${isHost ? `<div class="field"><label>Next dive</label>${settingsHTML(s)}</div>
          <div class="row"><button class="btn coral big" id="again" type="button">${icon('repeat')} Play again</button><button class="btn ghost" id="toLobby" type="button">Back to lobby</button></div>`
          : `<div id="hostline">${hostLineHTML(s).replace('start the dive', 'start the next dive')}</div>`}
        <div class="row"><button class="btn sun" id="pshare" type="button">${icon('share')} Share result</button><button class="btn ghost" data-go="" type="button">${icon('logout')} Leave party</button></div>
        ${CREDIT}
      </div></div>`;
    bindHud(); bindSettings();
    $('#again')?.addEventListener('click', () => { sfx.submit(); send({ t: 'start' }); });
    $('#toLobby')?.addEventListener('click', () => send({ t: 'lobby' }));
    $('#pshare')?.addEventListener('click', () => {
      sfx.click();
      const max = maxPointsFor(total);
      const score = me?.score || 0;
      const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
      openShare({
        label: `Party · ${total} questions`,
        depth: depthFor(score, max), pts: score, max,
        title: titleFor(score * (2500 / max)),
        bands: me?.results || [],
        place: `${ord(myRank)} of ${ranked.length}`,
        color: me?.color,
      });
    });
  }

  // ------------------------------------------------------------ boot
  if (code && /^[A-Za-z]{4}$/.test(code)) joinScreen(code.toUpperCase());
  else partyHome();

  return () => {
    alive = false;
    clearTimeout(retryT); clearInterval(pingT); clearInterval(revealT); clearInterval(quotaT);
    cancelAnimationFrame(raf);
    bar?.stop();
    try { ws?.close(1000, 'leave'); } catch {}
    scene.showLabels = false;
  };
}
