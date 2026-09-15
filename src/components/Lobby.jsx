import React, { useMemo } from 'react';
import GameCard from './GameCard';
import { pickKey } from '../store/picks';

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function Lobby({ games, picks, league, loading, error, onPick, onRetry }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const g of games) {
      const key = dayLabel(g.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(g);
    }
    return [...map.entries()];
  }, [games]);

  const openCount = games.filter((g) => g.state === 'pre').length;
  const pickedOpen = games.filter((g) => g.state === 'pre' && picks[pickKey(league, g.id)]).length;

  if (loading) {
    return (
      <div className="empty">
        <div className="spinner" />
        <p>Loading this week's games…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty">
        <p className="error">Couldn't reach the scores feed.</p>
        <p className="muted">{error}</p>
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!games.length) {
    return (
      <div className="empty">
        <p>No games scheduled for this week.</p>
      </div>
    );
  }

  return (
    <div className="lobby">
      {openCount > 0 && (
        <div className="progress-card">
          <div className="progress-text">
            <strong>
              {pickedOpen}/{openCount}
            </strong>{' '}
            picks made · tap a team to pick the winner
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(pickedOpen / openCount) * 100}%` }} />
          </div>
        </div>
      )}
      {groups.map(([day, list]) => (
        <section key={day} className="day-group">
          <h2 className="day-title">{day}</h2>
          {list.map((g) => (
            <GameCard key={g.id} game={g} pick={picks[pickKey(league, g.id)]} onPick={onPick} />
          ))}
        </section>
      ))}
    </div>
  );
}
