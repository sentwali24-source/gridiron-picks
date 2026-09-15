// Betting-model levers, per league, saved on this device.
const KEY = 'gp:model:v1';

const WEIGHTS = { ppg: 0.5, papg: 0.5, ypg: 0.02, tod: 3, third: 0.08, sacks: 0.8, rz: 0.03 };

export const DEFAULT_LEVERS = {
  nfl: { hfa: 2.0, sigma: 13.5, sigmaT: 10, pace: 1.0, keyOut: 6, shrink: 6, kellyFrac: 0.25, bankroll: 1000, juice: -110, weights: { ...WEIGHTS } },
  cfb: { hfa: 3.0, sigma: 17, sigmaT: 13, pace: 1.0, keyOut: 7, shrink: 4, kellyFrac: 0.25, bankroll: 1000, juice: -110, weights: { ...WEIGHTS } },
};

export const LEVER_INFO = [
  { key: 'hfa', label: 'Home-field advantage', unit: 'pts', min: 0, max: 7, step: 0.5, help: 'Points added to the home team before any stats.' },
  { key: 'shrink', label: 'Small-sample shrink', unit: 'games', min: 0, max: 16, step: 1, help: 'Regression to the mean: each team’s stats are blended toward league average until this many games are played. 0 = trust raw stats fully.' },
  { key: 'sigma', label: 'Margin volatility (σ)', unit: 'pts', min: 8, max: 22, step: 0.5, help: 'How spread out final margins are. NFL ≈ 13.5, college ≈ 17. Lower = more confident.' },
  { key: 'sigmaT', label: 'Total volatility (σ)', unit: 'pts', min: 6, max: 18, step: 0.5, help: 'Spread of combined scores around the projected total.' },
  { key: 'pace', label: 'Total pace factor', unit: '×', min: 0.8, max: 1.2, step: 0.01, help: 'Scales the projected total up or down.' },
  { key: 'keyOut', label: 'Key player out', unit: 'pts', min: 0, max: 14, step: 0.5, help: 'Margin shift when a starting QB (or similar) is out — the Bayes update.' },
  { key: 'kellyFrac', label: 'Kelly fraction', unit: '×', min: 0, max: 1, step: 0.05, help: 'Fraction of full Kelly to bet. 0.25 (quarter Kelly) is a common, safer choice.' },
  { key: 'juice', label: 'Spread / total price', unit: '', min: -130, max: -100, step: 5, help: 'Odds assumed for spread and total bets when the book doesn’t list them.' },
];

function migrate(saved) {
  return saved && typeof saved === 'object' ? saved : {};
}

export function loadLevers(league) {
  let saved = {};
  try {
    saved = migrate(JSON.parse(localStorage.getItem(KEY)))[league] || {};
  } catch {
    saved = {};
  }
  const d = DEFAULT_LEVERS[league] || DEFAULT_LEVERS.nfl;
  return { ...d, ...saved, weights: { ...d.weights, ...(saved.weights || {}) } };
}

export function saveLevers(league, levers) {
  try {
    const all = migrate(JSON.parse(localStorage.getItem(KEY)));
    all[league] = levers;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

export function resetLevers(league) {
  try {
    const all = migrate(JSON.parse(localStorage.getItem(KEY)));
    delete all[league];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return loadLevers(league);
}

export function isCustom(league, levers) {
  const d = DEFAULT_LEVERS[league] || DEFAULT_LEVERS.nfl;
  const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
  for (const k of Object.keys(d)) if (k !== 'weights' && !same(d[k], levers[k])) return true;
  for (const k of Object.keys(d.weights)) if (!same(d.weights[k], levers.weights?.[k])) return true;
  return false;
}
