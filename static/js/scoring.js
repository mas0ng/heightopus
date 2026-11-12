// Shared by the browser game and the Cloudflare Worker (party rooms).
// Keep this file free of DOM / browser APIs.

export const BANDS = [
  { key: 'bullseye', name: 'Bullseye', max: 1.03, points: 100, color: '#ffd166', icon: '◎' },
  { key: 'spoton',   name: 'Spot On',  max: 1.08, points: 75,  color: '#06d6a0', icon: '✦' },
  { key: 'close',    name: 'Close',    max: 1.18, points: 50,  color: '#4cc9f0', icon: '◆' },
  { key: 'ballpark', name: 'Ballpark', max: 1.40, points: 25,  color: '#7b8cde', icon: '●' },
  { key: 'wayoff',   name: 'Way Off',  max: 2.00, points: 10,  color: '#b5838d', icon: '○' },
  { key: 'lost',     name: 'Lost at Sea', max: Infinity, points: 0, color: '#8a94a6', icon: '·' },
];
export const PASS_BAND = { key: 'pass', name: 'Passed', max: Infinity, points: 0, color: '#6b7a90', icon: '–' };

// Later questions count more. 10-question pattern; sums to 25 (perfect = 2,500).
export const MULTIPLIERS = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
export const multFor = (i) => MULTIPLIERS[i % MULTIPLIERS.length];
export const maxPointsFor = (n) => {
  let t = 0;
  for (let i = 0; i < n; i++) t += 100 * multFor(i);
  return t;
};

/** ratio >= 1: how many times off the guess is (2 = double or half). */
export function ratioOff(guess, actual) {
  if (!(guess > 0) || !(actual > 0)) return Infinity;
  return guess > actual ? guess / actual : actual / guess;
}

export function bandFor(guess, actual) {
  if (guess == null) return PASS_BAND;
  const r = ratioOff(guess, actual);
  return BANDS.find((b) => r <= b.max) || BANDS[BANDS.length - 1];
}

export function scoreGuess(guess, actual, index) {
  const band = bandFor(guess, actual);
  const mult = multFor(index);
  return { band, mult, points: band.points * mult };
}

// Depth: a perfect 10-question run ends at Challenger Deep.
export const CHALLENGER_DEEP = 10935;
export function depthFor(points, perfectPoints = 2500) {
  return Math.round((points / perfectPoints) * CHALLENGER_DEEP);
}

export const TITLES = [
  { min: 2200, name: 'Living Tape Measure' },
  { min: 1700, name: 'Eagle Eye' },
  { min: 1200, name: 'Sharp Sizer' },
  { min: 700,  name: 'Rough Reckoner' },
  { min: 300,  name: 'Wobbly Ruler' },
  { min: 0,    name: 'Lost Little Squid' },
];
export const titleFor = (pts) => (TITLES.find((t) => pts >= t.min) || TITLES[TITLES.length - 1]).name;

// Daily #1 is 12 Nov 2026 (local date).
export const EPOCH_UTC = Date.UTC(2026, 10, 12);
export function dayNumber(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH_UTC) / 864e5) + 1;
}

// Seeded RNG (mulberry32) so everyone gets the same daily set.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
