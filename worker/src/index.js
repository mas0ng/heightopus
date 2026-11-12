import { Room } from './room.js';
import { DailyStats } from './stats.js';
import { dayNumber } from '../../static/js/scoring.js';

export { Room, DailyStats };

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const withCors = (res) => {
  if (res.status === 101) return res;
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
};
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    try {
      if (path === '/api/health') return json({ ok: true, day: dayNumber() });

      // Create a party room
      if (path === '/api/party' && req.method === 'POST') {
        for (let i = 0; i < 6; i++) {
          const code = randomCode();
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          const r = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST' });
          if (r.ok) return json({ code });
        }
        return json({ error: 'Could not create a room, try again.' }, 503);
      }

      // Room info / websocket
      const m = path.match(/^\/api\/party\/([A-Za-z]{4})(\/ws)?$/);
      if (m) {
        const code = m[1].toUpperCase();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        if (m[2]) {
          if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected websocket' }, 426);
          const inner = new URL('https://room/ws');
          inner.search = url.search;
          return stub.fetch(new Request(inner, req));
        }
        return withCors(await stub.fetch('https://room/info'));
      }

      // Daily percentile
      const d = path.match(/^\/api\/daily\/(\d{1,5})\/score$/);
      if (d) {
        const day = Number(d[1]);
        const today = dayNumber();
        if (Math.abs(day - today) > 1) return json({ error: 'Wrong day' }, 400);
        const stub = env.STATS.get(env.STATS.idFromName(`day-${day}`));
        return withCors(await stub.fetch('https://stats/', { method: req.method, body: req.method === 'POST' ? await req.text() : undefined }));
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      // Free-plan Durable Object limits surface as exceptions: report them as a quota hit.
      if (/limit|quota|exceeded/i.test(String(err?.message || err))) return json({ error: 'quota' }, 429);
      return json({ error: 'Server error', detail: String(err?.message || err) }, 500);
    }
  },
};
