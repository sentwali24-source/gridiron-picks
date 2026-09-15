import React, { useEffect, useMemo, useState } from 'react';
import { fetchLeaders, fetchStandings, fetchTeamStats, KEY_TEAM_STATS } from '../api/espnStats';

const VIEWS = [
  ['leaders', 'Leaders'],
  ['standings', 'Standings'],
  ['teams', 'Team stats'],
];

export default function StatsTab({ league, season }) {
  const [view, setView] = useState('leaders');
  const [leaders, setLeaders] = useState({});
  const [standings, setStandings] = useState({});
  const [cat, setCat] = useState(0);
  const [teamId, setTeamId] = useState('');
  const [teamStats, setTeamStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Leaders + standings are fetched once per league and kept.
  useEffect(() => {
    let alive = true;
    const need = (view === 'leaders' && !leaders[league]) || (view !== 'leaders' && !standings[league]);
    if (!need) return;
    setLoading(true);
    setError(null);
    (view === 'leaders' ? fetchLeaders(league, season) : fetchStandings(league))
      .then((res) => {
        if (!alive) return;
        if (view === 'leaders') setLeaders((m) => ({ ...m, [league]: res }));
        else setStandings((m) => ({ ...m, [league]: res }));
      })
      .catch((e) => alive && setError(e.message || 'Could not load stats'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [view, league, season]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCat(0);
    setTeamId('');
  }, [league]);

  // Team stats on demand.
  useEffect(() => {
    if (!teamId || teamStats[`${league}:${teamId}`]) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchTeamStats(league, teamId, season)
      .then((res) => alive && setTeamStats((m) => ({ ...m, [`${league}:${teamId}`]: res })))
      .catch((e) => alive && setError(e.message || 'Could not load team stats'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [teamId, league]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = standings[league] || [];
  const allTeams = useMemo(() => groups.flatMap((g) => g.entries).sort((a, b) => a.name.localeCompare(b.name)), [groups]);
  const cats = leaders[league] || [];
  const current = cats[Math.min(cat, Math.max(cats.length - 1, 0))];
  const ts = teamId ? teamStats[`${league}:${teamId}`] : null;

  return (
    <div className="stats">
      <div className="segmented">
        {VIEWS.map(([k, label]) => (
          <button key={k} className={`seg ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="empty small">
          <p className="error">{error}</p>
        </div>
      )}
      {loading && (
        <div className="empty small">
          <div className="spinner" />
        </div>
      )}

      {view === 'leaders' && current && (
        <>
          <div className="chips">
            {cats.map((c, i) => (
              <button key={c.name} className={`chip ${i === cat ? 'active' : ''}`} onClick={() => setCat(i)}>
                {c.label}
              </button>
            ))}
          </div>
          <ul className="leader-list">
            {current.leaders.map((l) => (
              <li key={l.id || l.rank} className="leader-row">
                <span className="leader-rank">{l.rank}</span>
                {l.headshot && <img className="headshot" src={l.headshot} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
                <span className="leader-text">
                  <span className="leader-name">{l.name}</span>
                  <span className="muted small-text">
                    {l.pos}
                    {l.team && ` · ${l.team}`}
                  </span>
                </span>
                <span className="leader-val">{l.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === 'standings' &&
        groups.map((g) => (
          <section key={g.name} className="standings-group">
            <h2 className="day-title">{g.name}</h2>
            <div className="box-scroll">
              <table className="standings wide">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>W-L</th>
                    <th>PCT</th>
                    <th>PF</th>
                    <th>PA</th>
                    <th>DIFF</th>
                    <th>STRK</th>
                  </tr>
                </thead>
                <tbody>
                  {g.entries.map((t) => (
                    <tr key={t.id} onClick={() => { setTeamId(t.id); setView('teams'); }} className="clickable">
                      <td className="team-cell">
                        {t.logo && <img src={t.logo} alt="" />}
                        {t.abbr}
                      </td>
                      <td>
                        {t.wins}-{t.losses}
                        {t.ties ? `-${t.ties}` : ''}
                      </td>
                      <td>{t.pct}</td>
                      <td>{t.pf}</td>
                      <td>{t.pa}</td>
                      <td>{t.diff}</td>
                      <td>{t.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {view === 'teams' && (
        <>
          <select className="team-select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Choose a team…</option>
            {allTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!teamId && !loading && (
            <div className="empty small">
              <p className="muted">Pick a team to see its full season numbers — offense, defense, passing, rushing, and more.</p>
            </div>
          )}
          {ts && (
            <>
              <div className="stat-row">
                {KEY_TEAM_STATS.map((k) => {
                  const s = k.names.map((n) => ts.flat[n]).find(Boolean);
                  if (!s) return null;
                  return (
                    <div key={k.label} className="stat-card">
                      <div className="stat-title">{k.label}</div>
                      <div className="stat-big">{s.perGame && k.label.includes('game') ? s.perGame : s.display}</div>
                    </div>
                  );
                })}
              </div>
              {ts.categories.map((c) => (
                <details key={c.name} className="cat-block">
                  <summary>
                    {c.label} <span className="muted">({c.stats.length})</span>
                  </summary>
                  <table className="cat-table">
                    <tbody>
                      {c.stats.map((s) => (
                        <tr key={s.name}>
                          <td>{s.label}</td>
                          <td className="num">{s.display}</td>
                          <td className="num muted">{s.rank || (s.perGame ? `${s.perGame}/g` : '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
