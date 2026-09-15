// "Locks": up to 3 best bets a user commits to each week. Stored per device for now;
// with accounts (v2) these become the picks published to subscribers.
const KEY = 'gp:locks:v1';
export const MAX_LOCKS = 3;

export const weekKey = (league, season, week) => `${league}:${season}:${week}`;

export function loadLocks() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
export function saveLocks(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * Build a lock from a game + choice.
 * kind: 'ML' (team wins), 'ATS' (team covers teamSpread), 'OVER' / 'UNDER' (total line)
 */
export function makeLock(game, kind, team = null, teamSpread = null, line = null) {
  return {
    id: `${game.id}:${kind}:${team?.id || ''}`,
    gameId: game.id,
    name: game.name,
    kickoff: game.date,
    kind,
    teamId: team?.id || null,
    teamAbbr: team?.abbr || null,
    teamName: team?.short || null,
    teamSpread,
    line,
    label: kind === 'ML' ? `${team.abbr} to win` : kind === 'ATS' ? `${team.abbr} ${teamSpread > 0 ? '+' : ''}${teamSpread}` : `${kind === 'OVER' ? 'Over' : 'Under'} ${line}`,
    madeAt: new Date().toISOString(),
    result: 'pending',
  };
}

/** Grade locks for one week against finished games. Returns a new array only if something changed. */
export function gradeLocks(list, games) {
  let changed = false;
  const byId = new Map(games.map((g) => [g.id, g]));
  const next = list.map((l) => {
    const g = byId.get(l.gameId);
    if (!g || !g.completed) return l;
    const hs = g.home.score ?? 0;
    const as = g.away.score ?? 0;
    let result = 'pending';
    if (l.kind === 'ML') result = g.tie ? 'push' : g.winnerId === l.teamId ? 'win' : 'loss';
    else if (l.kind === 'ATS') {
      const teamScore = l.teamId === g.home.id ? hs : as;
      const oppScore = l.teamId === g.home.id ? as : hs;
      const adj = teamScore - oppScore + Number(l.teamSpread || 0);
      result = adj > 0 ? 'win' : adj === 0 ? 'push' : 'loss';
    } else {
      const total = hs + as;
      result = total === l.line ? 'push' : (l.kind === 'OVER') === total > l.line ? 'win' : 'loss';
    }
    if (result !== l.result) {
      changed = true;
      return { ...l, result, finalScore: `${g.away.abbr} ${as} – ${g.home.abbr} ${hs}` };
    }
    return l;
  });
  return changed ? next : list;
}

/** Totals across every stored week (optionally one league / season). */
export function locksRecord(all, { league, season } = {}) {
  const r = { win: 0, loss: 0, push: 0, pending: 0 };
  for (const [k, list] of Object.entries(all)) {
    const [lg, yr] = k.split(':');
    if (league && lg !== league) continue;
    if (season && String(yr) !== String(season)) continue;
    for (const l of list) r[l.result || 'pending']++;
  }
  return r;
}
