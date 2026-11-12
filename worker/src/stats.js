import { DurableObject } from 'cloudflare:workers';

// Histogram of daily scores in 100-point buckets (0..2500).
export class DailyStats extends DurableObject {
  async fetch(req) {
    const hist = (await this.ctx.storage.get('h')) || new Array(26).fill(0);
    const total = hist.reduce((a, c) => a + c, 0);
    if (req.method !== 'POST') return Response.json({ players: total, hist });

    let body = null;
    try { body = await req.json(); } catch {}
    const score = Math.round(Number(body?.score));
    if (!(score >= 0 && score <= 2500)) return Response.json({ error: 'Bad score' }, { status: 400 });

    const b = Math.min(25, Math.floor(score / 100));
    let below = hist[b] / 2;
    for (let i = 0; i < b; i++) below += hist[i];
    hist[b]++;
    await this.ctx.storage.put('h', hist);
    return Response.json({ players: total + 1, betterThan: total ? Math.round((100 * below) / total) : 100 });
  }
}
