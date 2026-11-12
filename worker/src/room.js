import { DurableObject } from 'cloudflare:workers';
import questions from '../../static/data/questions.json';
import { scoreGuess, ratioOff, shuffled, multFor } from '../../static/js/scoring.js';

const MAX_PLAYERS = 12;
const REVEAL_MS = 9000;
const IDLE_MS = 30 * 60 * 1000;
const COLORS = ['#ff7a6b', '#ffd166', '#56e0f0', '#9b8cff', '#7bd389', '#ff8fd0', '#ffa94d', '#e8eef5'];
const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'Diver';
const cleanColor = (c) => (COLORS.includes(c) ? c : COLORS[0]);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) || null;
    });
  }

  save() { return this.ctx.storage.put('s', this.s); }
  sockets(except) { return this.ctx.getWebSockets().filter((w) => w !== except); }
  players() { return this.s.order.map((id) => this.s.players[id]).filter(Boolean); }
  connected() { return this.players().filter((p) => p.connected); }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/init') {
      if (this.s && this.sockets().length) return new Response('busy', { status: 409 });
      this.s = {
        code: url.searchParams.get('code'), created: Date.now(), phase: 'lobby', hostId: null,
        settings: { rounds: 10, seconds: 20 }, players: {}, order: [],
        qIds: [], qIndex: -1, endsAt: 0, nextAt: 0, guesses: {}, reveal: null,
      };
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
      return Response.json({ ok: true });
    }

    if (!this.s) return Response.json({ error: 'Room not found' }, { status: 404 });

    if (url.pathname === '/info') {
      const host = this.s.players[this.s.hostId];
      return Response.json({
        code: this.s.code, phase: this.s.phase, settings: this.s.settings,
        players: this.connected().length, full: this.players().length >= MAX_PLAYERS,
        host: host?.name || null,
      });
    }

    if (url.pathname === '/ws') {
      const token = (url.searchParams.get('token') || '').slice(0, 64);
      if (!token) return new Response('token required', { status: 400 });
      let p = this.players().find((x) => x.token === token);
      if (!p) {
        if (this.players().length >= MAX_PLAYERS) return new Response('room full', { status: 403 });
        p = { id: crypto.randomUUID().slice(0, 8), token, score: 0, results: [], joined: Date.now() };
        this.s.players[p.id] = p;
        this.s.order.push(p.id);
      }
      p.name = cleanName(url.searchParams.get('name'));
      p.color = cleanColor(url.searchParams.get('color'));
      p.connected = true;
      if (!this.s.hostId || !this.s.players[this.s.hostId]?.connected) this.s.hostId = p.id;

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ pid: p.id });
      await this.save();
      this.broadcast();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  // ---------------------------------------------------------------- messages
  async webSocketMessage(ws, raw) {
    if (!this.s || typeof raw !== 'string' || raw.length > 1000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const pid = ws.deserializeAttachment()?.pid;
    const p = this.s.players[pid];
    if (!p) return;
    const isHost = pid === this.s.hostId;
    const ph = this.s.phase;

    switch (m.t) {
      case 'ping':
        ws.send('{"t":"pong"}');
        return;
      case 'settings': {
        if (!isHost || (ph !== 'lobby' && ph !== 'over')) return;
        if ([5, 10].includes(m.rounds)) this.s.settings.rounds = m.rounds;
        if ([15, 20, 30].includes(m.seconds)) this.s.settings.seconds = m.seconds;
        break;
      }
      case 'start': {
        if (!isHost || (ph !== 'lobby' && ph !== 'over')) return;
        this.s.qIds = shuffled(questions, Math.random).slice(0, this.s.settings.rounds).map((q) => q.id);
        for (const pl of this.players()) { pl.score = 0; pl.results = []; }
        // drop players who left before the new game
        this.s.order = this.s.order.filter((id) => this.s.players[id]?.connected);
        for (const id of Object.keys(this.s.players)) if (!this.s.order.includes(id)) delete this.s.players[id];
        return this.startQuestion(0);
      }
      case 'guess':
      case 'pass': {
        if (ph !== 'question' || pid in this.s.guesses) return;
        if (m.t === 'guess') {
          const g = Number(m.m);
          if (!(g > 0 && g < 1e9)) return;
          this.s.guesses[pid] = g;
        } else this.s.guesses[pid] = null;
        if (this.connected().every((x) => x.id in this.s.guesses)) return this.revealNow();
        break;
      }
      case 'next': {
        // Host skips the reveal countdown, only when everyone answered (or passed).
        if (!isHost || ph !== 'reveal' || !this.s.reveal?.allIn || m.index !== this.s.qIndex) return;
        if (this.s.qIndex + 1 < this.s.qIds.length) return this.startQuestion(this.s.qIndex + 1);
        return this.gameOver();
      }
      case 'lobby': {
        if (!isHost || ph !== 'over') return;
        this.s.phase = 'lobby';
        break;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch {}
    await this.dropSocket(ws);
  }
  async webSocketError(ws) { await this.dropSocket(ws); }

  async dropSocket(ws) {
    if (!this.s) return;
    const pid = ws.deserializeAttachment()?.pid;
    const p = this.s.players[pid];
    if (!p) return;
    const stillHere = this.sockets(ws).some((w) => w.deserializeAttachment()?.pid === pid);
    if (!stillHere) {
      p.connected = false;
      if (this.s.phase === 'lobby') {
        delete this.s.players[pid];
        this.s.order = this.s.order.filter((id) => id !== pid);
      }
      if (this.s.hostId === pid) this.s.hostId = this.connected()[0]?.id || null;
    }
    const conn = this.connected();
    if (this.s.phase === 'question' && conn.length && conn.every((x) => x.id in this.s.guesses)) return this.revealNow();
    if (!this.sockets(ws).length && (this.s.phase === 'lobby' || this.s.phase === 'over')) {
      await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
    }
    await this.save();
    this.broadcast(ws);
  }

  // ---------------------------------------------------------------- game flow
  async startQuestion(i) {
    this.s.phase = 'question';
    this.s.qIndex = i;
    this.s.guesses = {};
    this.s.reveal = null;
    this.s.endsAt = Date.now() + this.s.settings.seconds * 1000 + 400;
    await this.ctx.storage.setAlarm(this.s.endsAt);
    await this.save();
    this.broadcast();
  }

  async revealNow() {
    const i = this.s.qIndex;
    const q = byId[this.s.qIds[i]];
    const allIn = this.connected().every((p) => p.id in this.s.guesses);
    let best = Infinity;
    for (const g of Object.values(this.s.guesses)) if (g != null) best = Math.min(best, ratioOff(g, q.m));
    const results = this.players().map((p) => {
      const g = p.id in this.s.guesses ? this.s.guesses[p.id] : null;
      const r = scoreGuess(g, q.m, i);
      p.score += r.points;
      p.results.push(r.band.key);
      return {
        id: p.id, name: p.name, color: p.color, m: g, band: r.band.key, pts: r.points,
        closest: g != null && ratioOff(g, q.m) === best,
      };
    });
    results.sort((a, b) => b.pts - a.pts || (a.m == null) - (b.m == null) || ratioOff(a.m, q.m) - ratioOff(b.m, q.m));
    this.s.reveal = { index: i, text: q.q, cat: q.cat, answer: q.m, fact: q.fact, mult: multFor(i), results, allIn };
    this.s.phase = 'reveal';
    this.s.nextAt = Date.now() + REVEAL_MS;
    await this.ctx.storage.setAlarm(this.s.nextAt);
    await this.save();
    this.broadcast();
  }

  async gameOver() {
    this.s.phase = 'over';
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    await this.save();
    this.broadcast();
  }

  async alarm() {
    if (!this.s) return;
    const now = Date.now();
    switch (this.s.phase) {
      case 'question':
        if (now >= this.s.endsAt - 100) return this.revealNow();
        return this.ctx.storage.setAlarm(this.s.endsAt);
      case 'reveal':
        if (now < this.s.nextAt - 100) return this.ctx.storage.setAlarm(this.s.nextAt);
        if (this.s.qIndex + 1 < this.s.qIds.length) return this.startQuestion(this.s.qIndex + 1);
        return this.gameOver();
      default:
        if (!this.sockets().length) {
          await this.ctx.storage.deleteAll();
          this.s = null;
        } else {
          await this.ctx.storage.setAlarm(now + IDLE_MS);
        }
    }
  }

  // ---------------------------------------------------------------- state out
  view() {
    const s = this.s;
    const q = s.phase === 'question' || s.phase === 'reveal' ? byId[s.qIds[s.qIndex]] : null;
    return {
      t: 'state', now: Date.now(), code: s.code, phase: s.phase, hostId: s.hostId, settings: s.settings,
      players: this.players().map((p) => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: !!p.connected,
        answered: s.phase === 'question' && p.id in s.guesses, results: p.results,
      })),
      q: q ? { index: s.qIndex, total: s.qIds.length, text: q.q, cat: q.cat, endsAt: s.endsAt, seconds: s.settings.seconds } : null,
      reveal: s.phase === 'reveal' ? { ...s.reveal, nextAt: s.nextAt } : null,
    };
  }

  broadcast(except) {
    if (!this.s) return;
    const base = this.view();
    for (const ws of this.sockets(except)) {
      const pid = ws.deserializeAttachment()?.pid;
      try { ws.send(JSON.stringify({ ...base, you: pid })); } catch {}
    }
  }
}
