// Rosters and per-player season stats from ESPN's free feeds.
import { LEAGUES } from './espn';
import { POS_MAP, OFFENSE_ROLES, DEFENSE_ROLES } from '../engine/matchupEngine';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/football';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  return res.json();
}

const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues';
const rosterCache = new Map();

/**
 * Ids of the team's statistical leaders (passing/rushing/receiving/tackles/sacks/…) — a cheap
 * stand-in for "starters". Falls back to last season early in the year when this season's
 * leaders aren't published yet. Returns { athleteId: [categoryName, …] }.
 */
async function fetchTeamLeaders(leagueKey, teamId, season) {
  const L = LEAGUES[leagueKey];
  const yr = season || new Date().getFullYear();
  for (const y of [yr, yr - 1]) {
    try {
      const j = await getJson(`${CORE}/${L.path}/seasons/${y}/types/2/teams/${teamId}/leaders`);
      const cats = j.categories || [];
      if (!cats.length) continue;
      const out = {};
      for (const c of cats) {
        for (const l of (c.leaders || []).slice(0, 2)) {
          const id = l.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1];
          if (id) (out[id] ||= []).push(c.name);
        }
      }
      return { leaders: out, season: y };
    } catch {
      /* try the previous season */
    }
  }
  return { leaders: {}, season: null };
}

/** Offensive and defensive players on a team, with the role the matchup engine understands. */
export async function fetchRoster(leagueKey, teamId, season) {
  const key = `${leagueKey}:${teamId}:${season || ''}`;
  if (rosterCache.has(key)) return rosterCache.get(key);
  const L = LEAGUES[leagueKey];
  const [j, lead] = await Promise.all([getJson(`${SITE}/${L.path}/teams/${teamId}/roster`), fetchTeamLeaders(leagueKey, teamId, season)]);
  const groups = j.athletes || [];
  const all = groups.flatMap((g) => (g.items || []).map((a) => ({ ...a, _group: g.position })));
  const toPlayer = (a) => {
    const pos = a.position?.abbreviation || '';
    return {
      id: a.id,
      name: a.displayName || a.fullName || '',
      short: a.shortName || a.displayName || '',
      pos,
      role: POS_MAP[pos] || null,
      jersey: a.jersey || '',
      headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/${leagueKey === 'nfl' ? 'nfl' : 'college-football'}/players/full/${a.id}.png`,
      status: a.status?.name || a._group,
      injured: a._group === 'injuredReserveOrOut' || a._group === 'suspended',
      star: !!lead.leaders[a.id],
      leads: lead.leaders[a.id] || [],
    };
  };
  // Starters (team leaders) first within each position, then the rest alphabetically.
  const order = (roles) => (a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || Number(b.star) - Number(a.star) || Number(a.injured) - Number(b.injured) || a.name.localeCompare(b.name);
  const players = all.filter((a) => a._group !== 'practiceSquad').map(toPlayer);
  const roster = {
    offense: players.filter((p) => OFFENSE_ROLES.includes(p.role)).sort(order(OFFENSE_ROLES)),
    defense: players.filter((p) => DEFENSE_ROLES.includes(p.role)).sort(order(DEFENSE_ROLES)),
    leadersSeason: lead.season,
  };
  rosterCache.set(key, roster);
  return roster;
}

const RATE_STATS = new Set(['yardsPerRushAttempt', 'yardsPerReception', 'QBRating', 'completionPct', 'yardsPerPassAttempt', 'avgInterceptionYards', 'adjQBR']);
const toNum = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const statsCache = new Map();

/**
 * A player's season stats, flattened to { statName: number } and projected to a full season
 * so a 2-game sample can be compared against typical ranges. Early in a season (fewer than
 * 4 games) we fall back to the previous season and say so.
 */
export async function fetchPlayerStats(leagueKey, athleteId, season) {
  const key = `${leagueKey}:${athleteId}:${season}`;
  if (statsCache.has(key)) return statsCache.get(key);
  const L = LEAGUES[leagueKey];
  const j = await getJson(`${WEB}/${L.path}/athletes/${athleteId}/stats`);
  const seasonGames = leagueKey === 'nfl' ? 17 : 12;

  // Merge every category's row for a given season into one flat map.
  const bySeason = new Map();
  for (const c of j.categories || []) {
    for (const row of c.statistics || []) {
      const yr = row.season?.year;
      if (!yr) continue;
      const flat = bySeason.get(yr) || {};
      (c.names || []).forEach((name, i) => {
        const v = toNum(row.stats?.[i]);
        if (v != null && !(name in flat)) flat[name] = v;
      });
      bySeason.set(yr, flat);
    }
  }
  const years = [...bySeason.keys()].sort((a, b) => b - a);
  const target = season || years[0];
  let used = target;
  let note = '';
  const cur = bySeason.get(target);
  const gp = cur?.gamesPlayed ?? 0;
  if (!cur || gp < 4) {
    // Prefer a previous season with a real sample; otherwise any previous season with games.
    const prev = years.find((y) => y < target && (bySeason.get(y)?.gamesPlayed ?? 0) >= 4) || years.find((y) => y < target && (bySeason.get(y)?.gamesPlayed ?? 0) > 0);
    if (prev) {
      used = prev;
      note = gp > 0 ? `Only ${gp} game${gp === 1 ? '' : 's'} this season — using ${prev} stats` : `No ${target} stats yet — using ${prev} season`;
    } else if (!cur || gp === 0) {
      const out = { seasonUsed: null, gamesPlayed: 0, raw: cur || {}, projected: {}, note: 'Hasn’t recorded stats yet — likely a backup. Try a starter (★).' };
      statsCache.set(key, out);
      return out;
    } else {
      note = `Based on ${gp} game${gp === 1 ? '' : 's'} this season`;
    }
  }
  const raw = bySeason.get(used) || {};
  const games = raw.gamesPlayed || 0;
  const projected = {};
  for (const [k, v] of Object.entries(raw)) {
    projected[k] = !RATE_STATS.has(k) && games > 0 && k !== 'gamesPlayed' ? Math.round((v / games) * seasonGames) : v;
  }
  const out = { seasonUsed: used, gamesPlayed: games, raw, projected, note };
  statsCache.set(key, out);
  return out;
}
