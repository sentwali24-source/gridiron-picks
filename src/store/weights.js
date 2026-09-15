// User-adjusted matchup weights, kept on this device.
// Shape: { "<pairKey>": { off: { stat: weight }, def: { stat: weight } } } — only pairings the user touched.
const KEY = 'gp:weights:v1';

export function loadWeights() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function saveWeights(overrides) {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    /* storage unavailable — levers still work for this session */
  }
}
