// Betting math in four layers:
//  1. odds arithmetic  — American odds → implied probability, strip the vig
//  2. distributions    — scoring margin and total modeled as Normal(μ, σ)
//  3. predictive model — μ built from efficiency-stat differences with adjustable weights
//  4. decision theory  — expected value and Kelly stake sizing

/* ---------- 1. Odds arithmetic ---------- */

export function americanToDecimal(a) {
  const n = Number(a);
  if (!n || Number.isNaN(n)) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}
export function impliedProb(a) {
  const d = americanToDecimal(a);
  return d ? 1 / d : null;
}
/** Two-way market → fair probabilities (vig removed proportionally) and the overround. */
export function removeVig(pA, pB) {
  if (pA == null || pB == null) return { a: null, b: null, overround: null };
  const s = pA + pB;
  return { a: pA / s, b: pB / s, overround: s - 1 };
}
export function probToAmerican(p) {
  if (!p || p <= 0 || p >= 1) return null;
  const d = 1 / p;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

/* ---------- 2. Distributions ---------- */

/** Standard normal CDF (Abramowitz–Stegun, accurate to ~1e-7). */
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** P(home covers) when the home side of the spread is `homeSpread` (negative = home favored). */
export function coverProb(margin, homeSpread, sigma) {
  return 1 - normCdf((-homeSpread - margin) / sigma);
}
export function overProb(total, line, sigmaT) {
  return 1 - normCdf((line - total) / sigmaT);
}

/* ---------- 3. Predictive model ---------- */

// Each feature is a per-team number; the model uses (home − away) × weight, in points of margin.
export const FEATURES = [
  { key: 'ppg', label: 'Points scored / game', unit: 'pts', step: 0.05, max: 1.5 },
  { key: 'papg', label: 'Points allowed / game', unit: 'pts', step: 0.05, max: 1.5, invert: true },
  { key: 'ypg', label: 'Yards / game', unit: 'yds', step: 0.005, max: 0.06 },
  { key: 'tod', label: 'Turnover margin / game', unit: 'TO', step: 0.25, max: 8 },
  { key: 'third', label: '3rd-down conversion %', unit: '%', step: 0.01, max: 0.25 },
  { key: 'sacks', label: 'Sacks / game', unit: 'sacks', step: 0.1, max: 2.5 },
  { key: 'rz', label: 'Red-zone scoring %', unit: '%', step: 0.005, max: 0.1 },
];

const num = (s) => (s == null ? null : typeof s === 'number' ? s : s.value != null ? Number(s.value) : parseFloat(String(s.display ?? s).replace(/,/g, '')));

/** Turn a team's season stats (flat map from fetchTeamStats) + standings row into model features. */
export function teamFeatures(flat = {}, standing = null) {
  const games = num(flat.gamesPlayed) || standing?.games || 1;
  const takeaways = num(flat.totalTakeaways);
  const giveaways = num(flat.totalGiveaways);
  const tod = flat.turnOverDifferential != null ? num(flat.turnOverDifferential) / games : takeaways != null && giveaways != null ? (takeaways - giveaways) / games : null;
  const ppg = num(flat.totalPointsPerGame) ?? (standing && standing.games ? standing.pf / standing.games : null);
  return {
    games,
    ppg,
    papg: standing && standing.games ? standing.pa / standing.games : null,
    ypg: num(flat.yardsPerGame),
    tod,
    third: num(flat.thirdDownConvPct),
    sacks: flat.sacks != null ? num(flat.sacks) / games : null,
    rz: num(flat.redzoneScoringPct),
  };
}

// League-average priors for regression to the mean early in a season.
export const PRIORS = {
  nfl: { ppg: 22.5, papg: 22.5, ypg: 335, tod: 0, third: 40, sacks: 2.4, rz: 56 },
  cfb: { ppg: 29, papg: 29, ypg: 400, tod: 0, third: 41, sacks: 2.2, rz: 80 },
};

/**
 * Shrink a team's features toward the league prior: weight = games / (games + k).
 * With k = 6, a 1-game sample counts 1/7 and a 12-game sample 2/3.
 */
export function shrinkFeatures(feat, prior, k) {
  if (!feat || !prior || !k) return feat;
  const g = feat.games || 0;
  const w = g / (g + k);
  const out = { ...feat, shrinkWeight: w };
  for (const f of FEATURES) {
    const v = feat[f.key];
    const p = prior[f.key];
    if (v != null && p != null) out[f.key] = w * v + (1 - w) * p;
  }
  return out;
}

/**
 * Predicted home margin and game total.
 * levers: { hfa, sigma, sigmaT, pace, keyOut, weights:{feature:w} }
 * adjustments: { homeOut, awayOut } — key player missing (Bayesian shift of the baseline)
 */
export function predictGame(home, away, levers, adjustments = {}) {
  let margin = levers.hfa;
  const contributions = [];
  for (const f of FEATURES) {
    const w = levers.weights?.[f.key] ?? 0;
    const h = home?.[f.key];
    const a = away?.[f.key];
    if (h == null || a == null) {
      contributions.push({ ...f, w, diff: null, pts: 0, home: h, away: a });
      continue;
    }
    const diff = f.invert ? a - h : h - a;
    const pts = diff * w;
    margin += pts;
    contributions.push({ ...f, w, diff, pts, home: h, away: a });
  }
  const keyAdj = (adjustments.homeOut ? -levers.keyOut : 0) + (adjustments.awayOut ? levers.keyOut : 0);
  margin += keyAdj;
  const hp = home?.ppg ?? 22;
  const ap = away?.ppg ?? 22;
  const hpa = home?.papg ?? hp;
  const apa = away?.papg ?? ap;
  const total = ((hp + ap + hpa + apa) / 2) * (levers.pace ?? 1);
  return { margin, total, keyAdj, contributions, homeWin: normCdf(margin / levers.sigma) };
}

/**
 * Anchor the projection to the market. The posted spread already prices in injuries, weather,
 * and things a stat model can't see, so blend: final = (1 − b) × model + b × market.
 * homeSpread negative = home favored, so the market's implied home margin is −homeSpread.
 */
export function blendWithMarket(pred, homeSpread, totalLine, b, sigma) {
  if (!pred || !b) return pred;
  const margin = homeSpread != null ? (1 - b) * pred.margin + b * -homeSpread : pred.margin;
  const total = totalLine != null ? (1 - b) * pred.total + b * totalLine : pred.total;
  return { ...pred, modelMargin: pred.margin, modelTotal: pred.total, margin, total, homeWin: normCdf(margin / sigma), blend: b };
}

/* ---------- 4. Decision theory ---------- */

/** Expected profit on `stake` at American odds `a` when the true win probability is `p`. */
export function expectedValue(p, a, stake = 100) {
  const d = americanToDecimal(a);
  if (!d || p == null) return null;
  return p * (d - 1) * stake - (1 - p) * stake;
}
/** Full-Kelly fraction of bankroll (0 when there's no edge). */
export function kellyFraction(p, a) {
  const d = americanToDecimal(a);
  if (!d || p == null) return null;
  const b = d - 1;
  return Math.max(0, (b * p - (1 - p)) / b);
}

/* ---------- Monte Carlo ---------- */

function gauss() {
  const u = Math.random() || 1e-12;
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** Simulate n games; returns win/cover/over rates and a margin histogram (5-point bins, −30…+30). */
export function simulate({ margin, total, sigma, sigmaT, homeSpread = null, totalLine = null, n = 10000 }) {
  let hw = 0;
  let hc = 0;
  let ov = 0;
  const bins = new Array(12).fill(0);
  for (let i = 0; i < n; i++) {
    const m = margin + gauss() * sigma;
    const t = total + gauss() * sigmaT;
    if (m > 0) hw++;
    if (homeSpread != null && m + homeSpread > 0) hc++;
    if (totalLine != null && t > totalLine) ov++;
    bins[Math.min(11, Math.max(0, Math.floor((m + 30) / 5)))]++;
  }
  return { n, homeWin: hw / n, homeCover: homeSpread != null ? hc / n : null, over: totalLine != null ? ov / n : null, bins: bins.map((c) => c / n) };
}

/** "BUF -4.5" → home-side spread number given the home abbreviation. */
export function parseHomeSpread(details, homeAbbr, fallback) {
  const m = String(details || '').match(/^([A-Z&]+)\s+([+-]?\d+(\.\d+)?)/i);
  if (m) {
    const n = parseFloat(m[2]);
    return m[1].toUpperCase() === String(homeAbbr).toUpperCase() ? n : -n;
  }
  return fallback ?? null;
}
