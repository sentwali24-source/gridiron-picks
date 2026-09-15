import React from 'react';
import { record, winPct } from '../store/picks';

function RecordCard({ title, r }) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-big">
        {r.win}-{r.loss}
        {r.push ? `-${r.push}` : ''}
      </div>
      <div className="stat-sub">
        {winPct(r)}% · {r.pending} pending
      </div>
    </div>
  );
}

export default function MyPicks({ picks, league, season, week, games }) {
  const weekRec = record(picks, { league, season, week });
  const seasonRec = record(picks, { league, season });
  const gameById = new Map(games.map((g) => [g.id, g]));

  const weekPicks = Object.values(picks)
    .filter((p) => p.league === league && p.season === season && p.week === week)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  return (
    <div className="mypicks">
      <div className="stat-row">
        <RecordCard title={`Week ${week}`} r={weekRec} />
        <RecordCard title={`${season ?? ''} Season`} r={seasonRec} />
      </div>

      <h2 className="day-title">Week {week} picks</h2>
      {weekPicks.length === 0 && (
        <div className="empty small">
          <p>No picks yet this week. Head to the Lobby and tap the teams you like.</p>
        </div>
      )}
      <ul className="pick-list">
        {weekPicks.map((p) => {
          const g = gameById.get(p.gameId);
          const status = p.result === 'pending' ? (g?.state === 'in' ? 'LIVE' : g?.state === 'post' ? 'Grading…' : 'Locks at kickoff') : p.result.toUpperCase();
          const scoreline = g && g.state !== 'pre' ? `${g.away.abbr} ${g.away.score ?? 0} – ${g.home.abbr} ${g.home.score ?? 0}` : null;
          return (
            <li key={p.gameId} className={`pick-item ${p.result}`}>
              <div className="pick-main">
                <div className="pick-team">{p.teamName || p.teamAbbr}</div>
                <div className="muted small-text">
                  vs {p.opponentAbbr} · {new Date(p.kickoff).toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  {scoreline && ` · ${scoreline}`}
                </div>
              </div>
              <span className={`badge ${p.result}`}>{status}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
