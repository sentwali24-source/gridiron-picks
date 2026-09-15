// Free, no-key ESPN public scoreboard feeds for NFL and FBS college football.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

export const LEAGUES = {
  nfl: { key: 'nfl', label: 'NFL', path: 'nfl', maxWeek: 18, extra: '' },
  // groups=80 = FBS (Division I-A). limit raised so a full Saturday slate fits.
  cfb: { key: 'cfb', label: 'College', path: 'college-football', maxWeek: 16, extra: '&groups=80&limit=300' },
};

/**
 * Fetch one week of games. Omit `week` to get ESPN's idea of the current week.
 * Returns { season, week, games[] } with games normalized for the UI.
 */
export async function fetchWeek(leagueKey, week) {
  const L = LEAGUES[leagueKey];
  const qs = `?seasontype=2${week ? `&week=${week}` : ''}${L.extra}`;
  const res = await fetch(`${BASE}/${L.path}/scoreboard${qs}`);
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  const data = await res.json();
  return {
    season: data.season?.year ?? data.leagues?.[0]?.season?.year ?? new Date().getFullYear(),
    week: data.week?.number ?? week ?? 1,
    games: (data.events || []).map(normalizeEvent).sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

function normalizeTeam(c) {
  const rank = c.curatedRank?.current;
  return {
    id: c.team?.id,
    abbr: c.team?.abbreviation || '',
    name: c.team?.displayName || '',
    short: c.team?.shortDisplayName || c.team?.name || '',
    logo: c.team?.logo || '',
    color: c.team?.color ? `#${c.team.color}` : '#333',
    homeAway: c.homeAway,
    score: c.score != null && c.score !== '' ? Number(c.score) : null,
    winner: !!c.winner,
    record: c.records?.[0]?.summary || '',
    rank: rank && rank <= 25 ? rank : null,
  };
}

function normalizeEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const st = comp.status?.type || ev.status?.type || {};
  const teams = (comp.competitors || []).map(normalizeTeam);
  const home = teams.find((t) => t.homeAway === 'home') || teams[0] || {};
  const away = teams.find((t) => t.homeAway === 'away') || teams[1] || {};
  const completed = !!st.completed;
  const odds = comp.odds?.[0];
  return {
    id: ev.id,
    name: ev.shortName || ev.name || '',
    date: ev.date,
    state: st.state || 'pre', // 'pre' | 'in' | 'post'
    completed,
    detail: st.shortDetail || st.description || '',
    home,
    away,
    winnerId: completed ? teams.find((t) => t.winner)?.id ?? null : null,
    tie: completed && home.score != null && home.score === away.score,
    spread: odds?.details || null,
    homeSpread: odds?.spread ?? null, // numeric, home side (negative = home favored)
    overUnder: odds?.overUnder ?? null,
    oddsProvider: odds?.provider?.name || null,
    tv: comp.broadcasts?.[0]?.names?.[0] || comp.broadcast || '',
    venue: comp.venue?.fullName || '',
  };
}
