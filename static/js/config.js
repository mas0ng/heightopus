// Where the Worker API lives.
//  - Local dev (run-local.bat / dev.py): the worker runs on port 8787.
//  - Production: route the worker to heightopus.com/api/* (see worker/wrangler.toml),
//    so the site calls its own origin and no CORS / extra domain is needed.
//  - If you ever host the API elsewhere (e.g. a workers.dev URL), put it in PROD_API.
const PROD_API = '';

const host = location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.endsWith('.local');

export const API_BASE = isLocal ? `${location.protocol}//${host}:8787` : PROD_API;
export const SITE_URL = 'heightopus.com';

export const api = (path) => `${API_BASE}${path}`;
export const wsUrl = (path) => {
  const base = API_BASE || location.origin;
  return base.replace(/^http/, 'ws') + path;
};
