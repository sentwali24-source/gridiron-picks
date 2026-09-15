// Free ESPN feeds for detailed stats: game summaries (box score, leaders, injuries, betting
// lines), season team stats, league leaders, and standings.
import { LEAGUES } from './espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football';
const SITE_V2 = 'https://site.api.espn.com/apis/v2/sports/football';
const WEB = 'https://site.web.api.espn.com/apis/site/v3/sports/football';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  return res.json();
}

const headshot = (leagueKey, athleteId) =>
  athleteId ? `https://a.espncdn.com/i/headshots/${leagueKey === 'nfl' ? 'nfl' : 'college-football'}/players/full/${athleteId}.png` : '';

/* ---------- Game summary: box score, leaders, injuries, odds ---------- */

export async function fetchGameSummary(leagueKey, gameId) {
  const L = LEAGUES[leagueKey];
  const j = await getJson(`${SITE}/${L.path}/summary?event=${gameId}`);

  const teamStats = (j.boxscore?.teams || []).map((t) => ({
    teamId: t.team?.id,
    abbr: t.team?.abbreviation,
    logo: t.team?.logo,
    stats: (t.statistics || []).map((s) => ({ name: s.name, label: s.label, display: s.displayValue, value: s.value })),
  }));

  const players = (j.boxscore?.players || []).map((p) => ({
    teamId: p.team?.id,
    abbr: p.team?.abbreviation,
    categories: (p.statistics || []).map((c) => ({
      name: c.name,
      label: c.text || c.name,
      labels: c.labels || [],
      rows: (c.athletes || []).map((a) => ({
        id: a.athlete?.id,
        name: a.athlete?.shortName || a.athlete?.displayName,
        pos: a.athlete?.position?.abbreviation || '',
        stats: a.stats || [],
      })),
    })),
  }));

  const leaders = (j.leaders || []).map((t) => ({
    teamId: t.team?.id,
    abbr: t.team?.abbreviation,
    logo: t.team?.logo,
    categories: (t.leaders || []).map((c) => {
      const top = c.leaders?.[0];
      return {
        name: c.name,
        label: c.displayName,
        player: top?.athlete?.shortName || top?.athlete?.displayName || '',
        playerId: top?.athlete?.id,
        pos: top?.athlete?.position?.abbreviation || '',
        headshot: top?.athlete?.headshot?.href || headshot(leagueKey, top?.athlete?.id),
        line: top?.displayValue || '',
      };
    }),
  }));

  const injuries = (j.injuries || []).map((t) => ({
    teamId: t.team?.id,
    abbr: t.team?.abbreviation,
    list: (t.injuries || []).map((i) => ({
      name: i.athlete?.shortName || i.athlete?.displayName,
      pos: i.athlete?.position?.abbreviation || '',
      status: i.status || '',
      detail: i.details?.type || i.details?.detail || '',
    })),
  }));

  const pc = j.pickcenter?.[0];
  const odds = pc
    ? {
        provider: pc.provider?.name || '',
        details: pc.details || '',
        spread: pc.spread,
        overUnder: pc.overUnder,
        homeML: pc.homeTeamOdds?.moneyLine,
        awayML: pc.awayTeamOdds?.moneyLine,
        homeFav: pc.homeTeamOdds?.favorite,
      }
    : null;

  const wp = j.winprobability?.length ? j.winprobability[j.winprobability.length - 1] : null;
  const gi = j.gameInfo || {};

  return {
    teamStats,
    players,
    leaders,
    injuries,
    odds,
    homeWinProb: wp?.homeWinPercentage != null ? Math.round(wp.homeWinPercentage * 100) : null,
    venue: gi.venue?.fullName || '',
    city: gi.venue?.address ? [gi.venue.address.city, gi.venue.address.state].filter(Boolean).join(', ') : '',
    weather: gi.weather ? `${gi.weather.displayValue || ''}${gi.weather.temperature != null ? ` · ${gi.weather.temperature}°` : ''}` : '',
  };
}

/* ---------- Season team stats ---------- */

const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues';

/**
 * Current-season team statistics. The core feed is season-accurate (the site feed lags a
 * full season early in the year); we fall back to the site feed only if the core one fails.
 */
export async function fetchTeamStats(leagueKey, teamId, season) {
  const L = LEAGUES[leagueKey];
  const yr = season || new Date().getFullYear();
  let cats;
  try {
    const j = await getJson(`${CORE}/${L.path}/seasons/${yr}/types/2/teams/${teamId}/statistics`);
    cats = j.splits?.categories || [];
  } catch {
    const j = await getJson(`${SITE}/${L.path}/teams/${teamId}/statistics`);
    cats = j.results?.stats?.categories || [];
  }
  const categories = cats.map((c) => ({
    name: c.name,
    label: c.displayName || c.name,
    stats: (c.stats || []).map((s) => ({
      name: s.name,
      label: s.displayName || s.name,
      abbr: s.abbreviation || s.shortDisplayName || '',
      display: s.displayValue,
      perGame: s.perGameDisplayValue,
      value: s.value,
      rank: s.rankDisplayValue || '',
    })),
  }));
  const flat = {};
  for (const c of categories) for (const s of c.stats) if (!(s.name in flat)) flat[s.name] = s;
  return { teamId, season: yr, categories, flat };
}

// Headline numbers we try to show side by side for an upcoming game.
export const KEY_TEAM_STATS = [
  { names: ['totalPointsPerGame', 'pointsPerGame'], label: 'Points / game' },
  { names: ['yardsPerGame', 'totalYardsPerGame'], label: 'Yards / game' },
  { names: ['netPassingYardsPerGame', 'passingYardsPerGame'], label: 'Pass yds / game' },
  { names: ['rushingYardsPerGame'], label: 'Rush yds / game' },
  { names: ['thirdDownConvPct'], label: '3rd down %' },
  { names: ['totalTakeaways'], label: 'Takeaways' },
  { names: ['turnovers', 'totalGiveaways'], label: 'Giveaways', lowerBetter: true },
  { names: ['sacks'], label: 'Sacks' },
  { names: ['interceptions'], label: 'Interceptions' },
];

/* ---------- League leaders ---------- */

export const LEADER_CATEGORIES = [
  ['passingYards', 'Passing yards'],
  ['rushingYards', 'Rushing yards'],
  ['receivingYards', 'Receiving yards'],
  ['passingTouchdowns', 'Passing TDs'],
  ['rushingTouchdowns', 'Rushing TDs'],
  ['receivingTouchdowns', 'Receiving TDs'],
  ['sacks', 'Sacks'],
  ['interceptions', 'Interceptions'],
  ['totalTackles', 'Tackles'],
  ['passesDefended', 'Passes defended'],
];

export async function fetchLeaders(leagueKey, season) {
  const L = LEAGUES[leagueKey];
  const j = await getJson(`${WEB}/${L.path}/leaders${season ? `?season=${season}` : ''}`);
  const byName = new Map((j.leaders?.categories || []).map((c) => [c.name, c]));
  return LEADER_CATEGORIES.filter(([n]) => byName.has(n)).map(([name, label]) => {
    const c = byName.get(name);
    return {
      name,
      label,
      leaders: (c.leaders || []).slice(0, 10).map((l, i) => ({
        rank: i + 1,
        id: l.athlete?.id,
        name: l.athlete?.shortName || l.athlete?.displayName || '',
        pos: l.athlete?.position?.abbreviation || '',
        team: l.team?.abbreviation || '',
        teamLogo: l.team?.logos?.[0]?.href || '',
        headshot: l.athlete?.headshot?.href || headshot(leagueKey, l.athlete?.id),
        value: l.displayValue,
      })),
    };
  });
}

/* ---------- Standings ---------- */

export async function fetchStandings(leagueKey) {
  const L = LEAGUES[leagueKey];
  const url = leagueKey === 'nfl' ? `${SITE_V2}/nfl/standings` : `${SITE_V2}/${L.path}/standings?group=80`;
  const j = await getJson(url);
  const groups = [];
  const walk = (node, trail) => {
    const name = node.name || node.abbreviation || '';
    const path = name && name !== j.name ? [...trail, name] : trail;
    const entries = node.standings?.entries || [];
    if (entries.length) {
      groups.push({
        name: path.join(' · ') || name,
        entries: entries
          .map((e) => {
            const s = Object.fromEntries((e.stats || []).map((x) => [x.name, x.displayValue ?? x.value]));
            return {
              id: e.team?.id,
              name: e.team?.displayName || '',
              abbr: e.team?.abbreviation || '',
              logo: e.team?.logos?.[0]?.href || '',
              wins: Number(s.wins ?? 0),
              losses: Number(s.losses ?? 0),
              ties: Number(s.ties ?? 0),
              pct: s.winPercent ?? '',
              pf: s.pointsFor ?? '',
              pa: s.pointsAgainst ?? '',
              diff: s.differential ?? s.pointDifferential ?? '',
              streak: s.streak ?? '',
              seed: s.playoffSeed != null ? Number(s.playoffSeed) : null,
            };
          })
          .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || b.wins - a.wins || a.losses - b.losses),
      });
    }
    for (const c of node.children || []) walk(c, path);
  };
  walk(j, []);
  return groups;
}
