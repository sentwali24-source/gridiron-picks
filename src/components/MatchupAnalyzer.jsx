import React, { useEffect, useMemo, useState } from 'react';
import { fetchRoster, fetchPlayerStats } from '../api/espnPlayers';
import { analyze, isSupported, ROLE_LABEL } from '../engine/matchupEngine';

const SAVE_KEY = 'gp:matchups:v1';
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || [];
  } catch {
    return [];
  }
};

function PlayerSelect({ label, players, value, onChange, disabled }) {
  return (
    <label className="ma-field">
      <span className="stat-title">{label}</span>
      <select className="team-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">Choose a player…</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.star ? '★ ' : ''}
            {p.pos} · {p.name}
            {p.jersey ? ` #${p.jersey}` : ''}
            {p.injured ? ' (inj.)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Meter({ score }) {
  const pct = ((score + 100) / 200) * 100;
  return (
    <div className="meter">
      <div className="meter-track">
        <div className="meter-marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="meter-ends">
        <span>Defense</span>
        <span>Even</span>
        <span>Offense</span>
      </div>
    </div>
  );
}

/**
 * Pick one offensive player and one defender from the two teams and grade the matchup
 * with real season stats. `teams` is [teamA, teamB] with { id, abbr, short|name, logo }.
 */
export default function MatchupAnalyzer({ league, season, teams, gameId }) {
  const [offIdx, setOffIdx] = useState(0);
  const [rosters, setRosters] = useState({});
  const [offId, setOffId] = useState('');
  const [defId, setDefId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(loadSaved);

  const offTeam = teams[offIdx];
  const defTeam = teams[1 - offIdx];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all(teams.map((t) => fetchRoster(league, t.id, season)))
      .then((rs) => alive && setRosters(Object.fromEntries(teams.map((t, i) => [t.id, rs[i]]))))
      .catch((e) => alive && setError(e.message || 'Could not load rosters'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [league, teams[0]?.id, teams[1]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOffId('');
    setDefId('');
    setResult(null);
  }, [offIdx, league, teams[0]?.id, teams[1]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const offPlayers = rosters[offTeam?.id]?.offense || [];
  const defPlayers = rosters[defTeam?.id]?.defense || [];
  const offP = offPlayers.find((p) => p.id === offId);
  const defP = defPlayers.find((p) => p.id === defId);
  const supported = offP && defP ? isSupported(offP.role, defP.role) : true;

  const run = async () => {
    if (!offP || !defP) return;
    setBusy(true);
    setError(null);
    try {
      const [os, ds] = await Promise.all([fetchPlayerStats(league, offP.id, season), fetchPlayerStats(league, defP.id, season)]);
      const r = analyze(offP.role, defP.role, os.projected, ds.projected);
      const entry = {
        id: `${Date.now()}`,
        gameId: gameId || null,
        league,
        season,
        madeAt: new Date().toISOString(),
        off: { id: offP.id, name: offP.name, pos: offP.pos, role: offP.role, team: offTeam.abbr, headshot: offP.headshot, note: os.note, seasonUsed: os.seasonUsed, games: os.gamesPlayed },
        def: { id: defP.id, name: defP.name, pos: defP.pos, role: defP.role, team: defTeam.abbr, headshot: defP.headshot, note: ds.note, seasonUsed: ds.seasonUsed, games: ds.gamesPlayed },
        ...r,
      };
      setResult(entry);
      const next = [entry, ...saved.filter((s) => !(s.off.id === entry.off.id && s.def.id === entry.def.id && s.league === league))].slice(0, 100);
      setSaved(next);
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e.message || 'Could not load player stats');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (result?.id === id) setResult(null);
  };

  // Inside a game sheet show that game's analyses; on the Stats tab show everything for this league.
  const history = useMemo(() => saved.filter((s) => s.league === league && (gameId ? s.gameId === gameId : true)).slice(0, 8), [saved, league, gameId]);

  const sideText = (r) =>
    r.side === 'offense' ? `${r.off.name} has the edge` : r.side === 'defense' ? `${r.def.name} can contain ${r.off.pos === 'QB' ? 'the passer' : r.off.name.split(' ').slice(-1)[0]}` : 'Even matchup';

  return (
    <div className="ma">
      <div className="segmented small">
        {[0, 1].map((i) => (
          <button key={i} className={`seg ${offIdx === i ? 'active' : ''}`} onClick={() => setOffIdx(i)}>
            {teams[i]?.abbr} offense vs {teams[1 - i]?.abbr} defense
          </button>
        ))}
      </div>

      {error && <div className="error small-text" style={{ margin: '6px 0' }}>{error}</div>}
      {loading ? (
        <div className="empty small">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="ma-fields">
            <PlayerSelect label={`${offTeam?.abbr} offense`} players={offPlayers} value={offId} onChange={setOffId} />
            <PlayerSelect label={`${defTeam?.abbr} defense`} players={defPlayers} value={defId} onChange={setDefId} />
          </div>
          <div className="muted small-text" style={{ margin: '-4px 0 10px' }}>
            ★ = team stat leader (likely starter){rosters[offTeam?.id]?.leadersSeason && rosters[offTeam.id].leadersSeason !== season ? ` · based on ${rosters[offTeam.id].leadersSeason}` : ''}
          </div>
        </>
      )}

      {offP && defP && !supported && (
        <div className="muted small-text" style={{ marginBottom: 8 }}>
          {ROLE_LABEL[offP.role]} vs {ROLE_LABEL[defP.role]} isn't a pairing the engine grades — try a defender who would actually line up against this player.
        </div>
      )}

      <button className="btn wide" onClick={run} disabled={!offP || !defP || !supported || busy}>
        {busy ? 'Crunching stats…' : 'Analyze matchup'}
      </button>

      {result && (
        <div className={`ma-result ${result.side}`}>
          <div className="ma-heads">
            {[result.off, result.def].map((p, i) => (
              <div key={i} className="ma-head">
                <img className="headshot big" src={p.headshot} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <div className="ma-head-name">{p.name}</div>
                <div className="muted small-text">
                  {p.pos} · {p.team}
                </div>
              </div>
            ))}
          </div>
          <div className="ma-score">
            {result.score > 0 ? '+' : ''}
            {result.score}
          </div>
          <div className="ma-verdict">{sideText(result)}</div>
          <Meter score={result.score} />
          <p className="ma-explain">{result.explanation}</p>
          {result.story && <p className="muted small-text">{result.story}</p>}

          <div className="ma-factors">
            {['offense', 'defense'].map((who) => (
              <div key={who} className="ma-factor-col">
                <div className="stat-title">{who === 'offense' ? result.off.name : result.def.name}</div>
                {result.factors
                  .filter((f) => f.who === who)
                  .map((f) => (
                    <div key={`${f.who}-${f.key}`} className="ma-factor">
                      <div className="ma-factor-top">
                        <span>{f.label}</span>
                        <strong>{f.display}</strong>
                      </div>
                      <div className="bar-track">
                        <div className={`bar ${f.norm >= 60 ? 'edge' : ''}`} style={{ width: `${f.norm ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <div className="muted small-text ma-note">
            {[result.off, result.def]
              .map((p) => p.note || (p.seasonUsed ? `${p.name.split(' ').slice(-1)[0]}: ${p.seasonUsed} season, ${p.games} games` : ''))
              .filter(Boolean)
              .join(' · ')}
            {result.confidence < 100 && ` · ${result.confidence}% of stats available`}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="ma-history">
          <div className="stat-title">Saved analyses</div>
          {history.map((h) => (
            <div key={h.id} className={`ma-hist ${h.side}`} onClick={() => setResult(h)}>
              <span className="ma-hist-score">
                {h.score > 0 ? '+' : ''}
                {h.score}
              </span>
              <span className="ma-hist-text">
                {h.off.pos} {h.off.name} ({h.off.team}) vs {h.def.pos} {h.def.name} ({h.def.team})
              </span>
              <button
                className="ma-del"
                aria-label="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(h.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
