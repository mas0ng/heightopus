# Heightopus

Guess how tall things are. The closer you get, the deeper your pixel octopus dives,
from the Sunlit Shallows down to Challenger Deep (10,935 m).

Play it at [heightopus.com](https://heightopus.com). Game developed by
[mas0ng.com](https://mas0ng.com/projects/heightopus/).

## Folders

| Folder | What it is | Deployed to |
|---|---|---|
| `static/` | The whole game (HTML/CSS/JS, pixel art is drawn in code, questions in `data/questions.json`) | Cloudflare (static assets) |
| `worker/` | Small API: party rooms (Durable Objects + WebSockets) and the daily "deeper than X%" stat | Cloudflare Workers |
| `dev.py`, `run-local.bat` | Local test runner | — |

The worker imports `static/data/questions.json` and `static/js/scoring.js`, so the
site and the API always use the same questions and scoring.

## Run locally

Double-click **`run-local.bat`** (or run `python dev.py`). It:

- installs the worker's packages on first run,
- serves the game on http://localhost:8080,
- runs the API with `wrangler dev` on http://localhost:8787,
- prints a LAN address so you can test on your phone on the same Wi-Fi.

Close the window (or Ctrl+C) to stop both.

To test multiplayer on one computer, open http://localhost:8080 and http://127.0.0.1:8080
in two tabs. They count as different players.

## Deploy

**Worker (API):** (the --config matters: without it Wrangler picks up the site config in the parent folder)
```
cd worker
npx.cmd wrangler deploy --config wrangler.toml
```

**Site (static):** from the project root (uses `wrangler.jsonc`, serves `static/` as
assets on Cloudflare's Pages-on-Workers, custom domain `heightopus.com`):
```
npx.cmd wrangler deploy
```

How it's wired:
- `heightopus.com` → the `heightopus` site (static assets only, no code runs, free).
- `heightopus.com/api/*` → the `heightopus-api` worker (route in `worker/wrangler.toml`).
  Both share one origin, so `PROD_API` in `static/js/config.js` stays empty.
- `www.heightopus.com` is not set up. Add it as a second custom domain in `wrangler.jsonc` if you want it.

## Costs

- Site: static assets only, free.
- Worker + Durable Objects (SQLite-backed) run on the Workers free plan. Rooms use the
  WebSocket hibernation API, so idle connections are not billed; empty rooms delete themselves.
- No database to create: everything lives in Durable Object storage.

## Adding questions

Append to `static/data/questions.json`:

```json
{"id":"unique-id","cat":"Landmarks","q":"How tall is ...?","m":123,"fact":"A fun fact."}
```

`m` is the answer in metres. Append new questions at the end of the list. The daily
order is a seeded shuffle of the whole list, so editing the list reshuffles future dailies.
Each player's daily is pinned once they start it, so a mid-day edit never changes a run in progress.

## Scoring

| Band | How close | Points |
|---|---|---|
| Bullseye | within 3% | 100 |
| Spot On | within 8% | 75 |
| Close | within 18% | 50 |
| Ballpark | within 40% | 25 |
| Way Off | up to 2× off | 10 |
| Lost at Sea | more than 2× off | 0 |

Multipliers: Q1–2 ×1, Q3–5 ×2, Q6–8 ×3, Q9–10 ×4. Perfect daily = 2,500 pts = 10,935 m.
