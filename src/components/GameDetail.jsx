import React, { useEffect, useMemo, useState } from 'react';
import { fetchGameSummary, fetchTeamStats, KEY_TEAM_STATS } from '../api/espnStats';
import MatchupAnalyzer from './MatchupAnalyzer';
import EdgeCard from './EdgeCard';

// Box-score lines worth comparing for a live/finished game, in display order.
const GAME_STAT_ROWS = [
  ['totalYards', 'Total yards'],
  ['netPassingYards', 'Passing yards'],
  ['rushingYards', 'Rushing yards'],
  ['firstDowns', '1st downs'],
  ['thirdDownEff', '3rd downs'],
  ['yardsPerPlay', 'Yards / play'],
  ['turnovers', 'Turnovers', true],
  ['sacksYardsLost', 'Sacks allowed', true],
  ['possessionTime', 'Possession'],
  ['totalPenaltiesYards', 'Penalties', true],
];

function num(v) {
  if (typeof v === 'number') return v;
  const m = String(v ?? '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function CompareRow({ label, left, right, lowerBetter }) {
  const l = num(left);
  const r = num(right);
  const max = Math.max(Math.abs(l ?? 0), Math.abs(r ?? 0)) || 1;
  const lw = l == null ? 0 : (Math.abs(l) / max) * 100;
  const rw = r == null ? 0 : (Math.abs(r) / max) * 100;
  let edge = null;
  if (l != null && r != null && l !== r) edge = (l > r) !== !!lowerBetter ? 'left' : 'right';
  return (
    <div className="compare-row">
      <span className={`compare-val ${edge === 'left' ? 'edge' : ''}`}>{left ?? '–'}</span>
      <div className="compare-bars">
        <div className="bar-track left">
          <div className={`bar ${edge === 'left' ? 'edge' : ''}`} style={{ width: `${lw}%` }} />
        </div>
        <span className="compare-label">{label}</span>
        <div className="bar-track right">
          <div className={`bar ${edge === 'right' ? 'edge' : ''}`} style={{ width: `${rw}%` }} />
        </div>
      </div>
      <span className={`compare-val ${edge === 'right' ? 'edge' : ''}`}>{right ?? '–'}</span>
    </div>
  );
}

function TeamHead({ team, score, showScore }) {
  return (
    <div className="detail-team">
      {team.logo && <img className="detail-logo" src={team.logo} alt="" />}
      <div className="detail-team-name">
        {team.rank && <span className="rank">#{team.rank} </span>}
        {team.short}
      </div>
      <div className="muted small-text">
        {team.abbr}
        {team.record && ` · ${team.record}`}
      </div>
      {showScore && <div className="detail-score">{score ?? 0}</div>}
    </div>
  );
}

export default function GameDetail({ game, league, season: seasonYear, pick, onPick, onClose }) {
  const [summary, setSummary] = useState(null);
  const [season, setSeason] = useState(null); // { [teamId]: teamStats } for upcoming games
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBox, setShowBox] = useState(false);
  const [showMatchup, setShowMatchup] = useState(false);
  const isPre = game.state === 'pre';
  const locked = !isPre;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [s, home, away] = await Promise.all([
          fetchGameSummary(league, game.id),
          isPre ? fetchTeamStats(league, game.home.id, seasonYear).catch(() => null) : null,
          isPre ? fetchTeamStats(league, game.away.id, seasonYear).catch(() => null) : null,
        ]);
        if (!alive) return;
        setSummary(s);
        if (isPre) setSeason({ [game.home.id]: home, [game.away.id]: away });
      } catch (e) {
        if (alive) setError(e.message || 'Could not load game details');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [league, game.id, isPre, seasonYear]);

  // Close on Escape / lock page scroll while open.
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const byTeam = (arr) => Object.fromEntries((arr || []).map((t) => [t.teamId, t]));
  const teamStats = useMemo(() => byTeam(summary?.teamStats), [summary]);
  const leaders = useMemo(() => byTeam(summary?.leaders), [summary]);
  const injuries = useMemo(() => byTeam(summary?.injuries), [summary]);
  const players = useMemo(() => byTeam(summary?.players), [summary]);

  const gameRows = useMemo(() => {
    const a = teamStats[game.away.id]?.stats || [];
    const h = teamStats[game.home.id]?.stats || [];
    const find = (list, n) => list.find((s) => s.name === n);
    return GAME_STAT_ROWS.map(([n, label, lower]) => ({ label, lower, left: find(a, n)?.display, right: find(h, n)?.display })).filter(
      (r) => r.left != null || r.right != null
    );
  }, [teamStats, game]);

  const seasonRows = useMemo(() => {
    if (!season) return [];
    const a = season[game.away.id]?.flat || {};
    const h = season[game.home.id]?.flat || {};
    const pick = (flat, names) => names.map((n) => flat[n]).find(Boolean);
    return KEY_TEAM_STATS.map((k) => {
      const l = pick(a, k.names);
      const r = pick(h, k.names);
      const show = (s) => (s ? (s.perGame && k.label.includes('game') ? s.perGame : s.display) : null);
      return { label: k.label, lower: k.lowerBetter, left: show(l), right: show(r) };
    }).filter((r) => r.left != null || r.right != null);
  }, [season, game]);

  const odds = summary?.odds;
  const hasBox = !isPre && (players[game.away.id]?.categories?.length || players[game.home.id]?.categories?.length);

  const Performers = ({ team }) => {
    const cats = (leaders[team.id]?.categories || []).filter((c) => c.player).slice(0, 3);
    if (!cats.length) return null;
    return (
      <div className="performers">
        <div className="performers-team">
          {team.logo && <img src={team.logo} alt="" />} {team.abbr}
        </div>
        {cats.map((c, i) => (
          <div key={`${c.name}-${i}`} className="performer">
            {c.headshot && <img className="headshot" src={c.headshot} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
            <div className="performer-text">
              <div className="performer-name">
                {c.player} <span className="muted">{c.pos}</span>
              </div>
              <div className="muted small-text">
                {c.label}: {c.line}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const Injuries = ({ team }) => {
    const list = injuries[team.id]?.list || [];
    if (!list.length) return null;
    return (
      <details className="injury-block">
        <summary>
          {team.abbr} injuries <span className="muted">({list.length})</span>
        </summary>
        <ul className="injury-list">
          {list.map((i, idx) => (
            <li key={idx}>
              <span className={`inj-status ${i.status.toLowerCase().replace(/\s+/g, '-')}`}>{i.status}</span>
              <span>
                {i.name} <span className="muted">{i.pos}</span>
              </span>
              {i.detail && <span className="muted small-text">{i.detail}</span>}
            </li>
          ))}
        </ul>
      </details>
    );
  };

  const BoxScore = ({ team }) => {
    const cats = players[team.id]?.categories || [];
    return (
      <div className="box-team">
        <div className="performers-team">
          {team.logo && <img src={team.logo} alt="" />} {team.abbr}
        </div>
        {cats
          .filter((c) => c.rows.length)
          .map((c) => (
            <div key={c.name} className="box-cat">
              <div className="box-cat-title">{c.label}</div>
              <div className="box-scroll">
                <table className="box-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      {c.labels.map((l) => (
                        <th key={l}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.rows.map((r) => (
                      <tr key={r.id || r.name}>
                        <td className="box-player">
                          {r.name} <span className="muted">{r.pos}</span>
                        </td>
                        {r.stats.map((v, i) => (
                          <td key={i}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet-bar">
        <button className="linkbtn" onClick={onClose}>
          ‹ Back
        </button>
        <span className="sheet-title">{game.name}</span>
        <span style={{ width: 56 }} />
      </div>

      <div className="sheet-body">
        <div className="detail-head">
          <TeamHead team={game.away} score={game.away.score} showScore={!isPre} />
          <div className="detail-mid">
            <div className={`game-status ${game.state === 'in' ? 'live' : ''}`}>{isPre ? new Date(game.date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : game.detail}</div>
            {game.tv && <div className="muted small-text">{game.tv}</div>}
            {summary?.homeWinProb != null && !isPre && (
              <div className="muted small-text">
                Win prob: {game.home.abbr} {summary.homeWinProb}%
              </div>
            )}
          </div>
          <TeamHead team={game.home} score={game.home.score} showScore={!isPre} />
        </div>

        <div className="pick-buttons">
          {[game.away, game.home].map((t) => (
            <button key={t.id} className={`pick-btn ${pick?.teamId === t.id ? 'on' : ''}`} disabled={locked} onClick={() => onPick(game, t)}>
              {pick?.teamId === t.id ? '✓ ' : ''}
              {locked ? (pick?.teamId === t.id ? 'Your pick' : 'Locked') : `Pick ${t.abbr}`}
            </button>
          ))}
        </div>

        <section className="detail-card">
          <div className="detail-card-title">Matchup analysis</div>
          {showMatchup ? (
            <MatchupAnalyzer league={league} season={seasonYear} teams={[game.away, game.home]} gameId={game.id} />
          ) : (
            <>
              <p className="muted small-text" style={{ margin: '0 0 10px' }}>
                Pick one player from each side — a running back vs a linebacker, a receiver vs a corner — and see who has the edge using real season stats.
              </p>
              <button className="btn wide" onClick={() => setShowMatchup(true)}>
                Analyze a player matchup ›
              </button>
            </>
          )}
        </section>

        {loading && (
          <div className="empty small">
            <div className="spinner" />
          </div>
        )}
        {error && <div className="empty small error">{error}</div>}

        {!loading && !error && (
          <>
            <section className="detail-card">
              <div className="detail-card-title">Betting line</div>
              {odds ? (
                <div className="odds-grid">
                  <div>
                    <div className="muted small-text">Spread</div>
                    <strong>{odds.details || '–'}</strong>
                  </div>
                  <div>
                    <div className="muted small-text">Over/Under</div>
                    <strong>{odds.overUnder ?? '–'}</strong>
                  </div>
                  <div>
                    <div className="muted small-text">Moneyline</div>
                    <strong>
                      {game.away.abbr} {odds.awayML ?? '–'} · {game.home.abbr} {odds.homeML ?? '–'}
                    </strong>
                  </div>
                  {odds.provider && <div className="muted small-text odds-src">via {odds.provider}</div>}
                </div>
              ) : (
                <div className="muted">Lines not posted yet — usually appear a few days before kickoff.</div>
              )}
            </section>

            <EdgeCard game={game} league={league} season={seasonYear} odds={odds} seasonStats={season} />

            {(isPre ? seasonRows : gameRows).length > 0 && (
              <section className="detail-card">
                <div className="detail-card-title">{isPre ? 'Season stats' : 'Team stats'}</div>
                <div className="compare-head">
                  <span>{game.away.abbr}</span>
                  <span>{game.home.abbr}</span>
                </div>
                {(isPre ? seasonRows : gameRows).map((r) => (
                  <CompareRow key={r.label} label={r.label} left={r.left} right={r.right} lowerBetter={r.lower} />
                ))}
              </section>
            )}

            {(leaders[game.away.id] || leaders[game.home.id]) && (
              <section className="detail-card">
                <div className="detail-card-title">{isPre ? 'Players to watch' : 'Top performers'}</div>
                <div className="performers-grid">
                  <Performers team={game.away} />
                  <Performers team={game.home} />
                </div>
              </section>
            )}

            {(injuries[game.away.id]?.list?.length || injuries[game.home.id]?.list?.length) > 0 && (
              <section className="detail-card">
                <div className="detail-card-title">Injuries</div>
                <Injuries team={game.away} />
                <Injuries team={game.home} />
              </section>
            )}

            {hasBox ? (
              <section className="detail-card">
                <button className="linkbtn" onClick={() => setShowBox((v) => !v)}>
                  {showBox ? 'Hide full box score' : 'Show full box score ›'}
                </button>
                {showBox && (
                  <>
                    <BoxScore team={game.away} />
                    <BoxScore team={game.home} />
                  </>
                )}
              </section>
            ) : null}

            {(summary?.venue || summary?.weather) && (
              <div className="muted small-text" style={{ textAlign: 'center', padding: '4px 0 16px' }}>
                {summary.venue}
                {summary.city && ` · ${summary.city}`}
                {summary.weather && ` · ${summary.weather}`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
