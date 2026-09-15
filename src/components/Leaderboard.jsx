import React from 'react';
import { LEAGUES } from '../api/espn';
import { record, winPct } from '../store/picks';

export default function Leaderboard({ picks, season }) {
  const name = localStorage.getItem('gp:name') || 'You';
  const rows = Object.values(LEAGUES).map((L) => ({ league: L, r: record(picks, { league: L.key, season }) }));
  const overall = record(picks, { season });

  const rename = () => {
    const n = window.prompt('Display name for the standings:', name);
    if (n && n.trim()) {
      localStorage.setItem('gp:name', n.trim());
      window.location.reload();
    }
  };

  return (
    <div className="board">
      <h2 className="day-title">{season ?? ''} Standings</h2>
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>W-L</th>
            <th>Win %</th>
          </tr>
        </thead>
        <tbody>
          <tr className="me">
            <td>1</td>
            <td>
              <button className="linkbtn inline" onClick={rename}>
                {name}
              </button>
            </td>
            <td>
              {overall.win}-{overall.loss}
              {overall.push ? `-${overall.push}` : ''}
            </td>
            <td>{winPct(overall)}%</td>
          </tr>
        </tbody>
      </table>

      <h2 className="day-title">By league</h2>
      <div className="stat-row">
        {rows.map(({ league, r }) => (
          <div key={league.key} className="stat-card">
            <div className="stat-title">{league.label}</div>
            <div className="stat-big">
              {r.win}-{r.loss}
              {r.push ? `-${r.push}` : ''}
            </div>
            <div className="stat-sub">{winPct(r)}%</div>
          </div>
        ))}
      </div>

      <div className="note">
        <strong>Coming in version 2:</strong> accounts, private leagues with friends, weekly prizes, and a shared leaderboard. Right now standings are stored on this phone only.
      </div>
    </div>
  );
}
