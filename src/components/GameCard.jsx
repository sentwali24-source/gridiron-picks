import React from 'react';

function kickoff(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function TeamRow({ team, game, picked, locked, onPick, result }) {
  const isWinner = game.completed && game.winnerId === team.id;
  const dim = game.completed && !isWinner && !game.tie;
  return (
    <button
      type="button"
      className={`team-row ${picked ? 'picked' : ''} ${dim ? 'dim' : ''} ${locked ? 'locked' : ''}`}
      onClick={() => onPick(game, team)}
      disabled={locked}
      aria-pressed={picked}
    >
      <span className="team-logo-wrap" style={{ '--team': team.color }}>
        {team.logo ? <img className="team-logo" src={team.logo} alt="" loading="lazy" /> : <span className="team-logo fallback">{team.abbr}</span>}
      </span>
      <span className="team-text">
        <span className="team-name">
          {team.rank && <span className="rank">#{team.rank} </span>}
          {team.short}
        </span>
        <span className="team-meta">
          {team.abbr}
          {team.record && ` · ${team.record}`}
          {team.homeAway === 'home' && ' · Home'}
        </span>
      </span>
      <span className="team-right">
        {game.state !== 'pre' && <span className={`score ${isWinner ? 'win' : ''}`}>{team.score ?? 0}</span>}
        {picked && result && result !== 'pending' && <span className={`badge ${result}`}>{result === 'win' ? 'W' : result === 'loss' ? 'L' : 'PUSH'}</span>}
        {picked && (!result || result === 'pending') && <span className="check">✓</span>}
      </span>
    </button>
  );
}

export default function GameCard({ game, pick, onPick, onOpen }) {
  const locked = game.state !== 'pre';
  const live = game.state === 'in';
  return (
    <article className={`game-card ${live ? 'live' : ''} ${game.completed ? 'final' : ''}`}>
      <header className="game-head">
        <span className={`game-status ${live ? 'live' : ''}`}>
          {live && <span className="live-dot" aria-hidden />}
          {game.state === 'pre' ? kickoff(game.date) : game.detail}
          {game.tv && game.state === 'pre' && <span className="muted"> · {game.tv}</span>}
        </span>
        <span className="game-odds">
          {game.spread && <span>{game.spread}</span>}
          {game.overUnder != null && <span>O/U {game.overUnder}</span>}
          {locked && !game.completed && <span className="lock">🔒</span>}
          {onOpen && (
            <button type="button" className="stats-btn" onClick={() => onOpen(game)}>
              Stats ›
            </button>
          )}
        </span>
      </header>
      <TeamRow team={game.away} game={game} picked={pick?.teamId === game.away.id} locked={locked} onPick={onPick} result={pick?.result} />
      <TeamRow team={game.home} game={game} picked={pick?.teamId === game.home.id} locked={locked} onPick={onPick} result={pick?.result} />
    </article>
  );
}
