// Cached model features per team (season stats + points for/against from standings).
import { fetchTeamStats, fetchStandings } from './espnStats';
import { teamFeatures } from '../engine/bettingModel';

const TTL = 6 * 60 * 60 * 1000; // 6 hours
const mem = new Map();
const standings = new Map();

export async function getStandingRow(league, teamId) {
  if (!standings.has(league)) standings.set(league, fetchStandings(league).catch(() => []));
  const groups = await standings.get(league);
  const row = groups.flatMap((g) => g.entries).find((e) => String(e.id) === String(teamId));
  return row ? { pf: Number(row.pf) || 0, pa: Number(row.pa) || 0, games: row.wins + row.losses + row.ties } : null;
}

export async function getTeamFeatures(league, teamId, season) {
  const key = `gp:feat:${league}:${season}:${teamId}`;
  if (mem.has(key)) return mem.get(key);
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && Date.now() - c.t < TTL) {
      mem.set(key, c.f);
      return c.f;
    }
  } catch {
    /* no cache */
  }
  const p = (async () => {
    const [ts, st] = await Promise.all([fetchTeamStats(league, teamId, season).catch(() => null), getStandingRow(league, teamId)]);
    const f = teamFeatures(ts?.flat || {}, st);
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), f }));
    } catch {
      /* ignore */
    }
    mem.set(key, f);
    return f;
  })();
  mem.set(key, p);
  return p;
}

/** Fetch features for many teams with a concurrency cap; reports progress. */
export async function getManyTeamFeatures(league, teamIds, season, onProgress) {
  const ids = [...new Set(teamIds.map(String))];
  const out = {};
  let done = 0;
  let i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      out[id] = await getTeamFeatures(league, id, season).catch(() => null);
      done++;
      onProgress?.(done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
  return out;
}
