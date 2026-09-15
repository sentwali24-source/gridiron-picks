// Picks live in localStorage for v1 (one player, this device).
// Shape: { "<league>:<gameId>": { league, season, week, gameId, teamId, teamAbbr, madeAt, result, homeScore, awayScore } }
const KEY = 'gp:picks:v1';

export const pickKey = (league, gameId) => `${league}:${gameId}`;

export function loadPicks() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function savePicks(picks) {
  try {
    localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    /* private mode / quota — picks just won't persist */
  }
}

/** Grade every pick that has a finished game in `games`. Returns a new object only if something changed. */
export function gradePicks(picks, league, games) {
  let changed = false;
  const next = { ...picks };
  for (const g of games) {
    const k = pickKey(league, g.id);
    const p = next[k];
    if (!p) continue;
    let result = 'pending';
    if (g.completed) result = g.tie ? 'push' : g.winnerId === p.teamId ? 'win' : 'loss';
    if (p.result !== result || p.homeScore !== g.home.score || p.awayScore !== g.away.score) {
      next[k] = { ...p, result, homeScore: g.home.score, awayScore: g.away.score };
      changed = true;
    }
  }
  return changed ? next : picks;
}

/** Win/loss/push/pending totals for picks matching the filter (league, season, week are all optional). */
export function record(picks, { league, season, week } = {}) {
  const r = { win: 0, loss: 0, push: 0, pending: 0, total: 0 };
  for (const p of Object.values(picks)) {
    if (league && p.league !== league) continue;
    if (season && p.season !== season) continue;
    if (week && p.week !== week) continue;
    r[p.result || 'pending']++;
    r.total++;
  }
  return r;
}

export function winPct(r) {
  const decided = r.win + r.loss;
  return decided ? Math.round((r.win / decided) * 100) : 0;
}
