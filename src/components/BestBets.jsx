import React, { useEffect, useMemo, useState } from 'react';
import { getManyTeamFeatures } from '../api/teamFeatures';
import { rankGames } from '../engine/bestBets';
import { loadLevers } from '../store/model';
import { loadLocks, saveLocks, makeLock, gradeLocks, locksRecord, weekKey, MAX_LOCKS } from '../store/locks';
import { pickKey } from '../store/picks';

const pct = (p) => (p == null ? '–' : `${Math.round(p * 100)}%`);
const money = (v) => (v == null ? '–' : `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`);
const when = (d) => new Date(d).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// College slates are huge; rank ranked-team games and any game with a line, capped.
function candidates(games, league) {
  const pre = games.filter((g) => g.state === 'pre' && (g.homeSpread != null || g.overUnder != null));
  if (league === 'nfl') return pre;
  const score = (g) => (g.home.rank ? 1 : 0) + (g.away.rank ? 1 : 0);
  return pre.sort((a, b) => score(b) - score(a)).slice(0, 30);
}

export default function BestBets({ league, season, week, games, picks, onPick, onOpen }) {
  const [ranked, setRanked] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [all, setAll] = useState(loadLocks);
  const [adding, setAdding] = useState(false);
  const [addGame, setAddGame] = useState('');
  const [addKind, setAddKind] = useState('ATS');
  const [addSide, setAddSide] = useState('home');

  const wk = weekKey(league, season, week);
  const locks = all[wk] || [];
  const preGames = useMemo(() => games.filter((g) => g.state === 'pre'), [games]);

  // Rank the slate whenever the week's games change.
  useEffect(() => {
    let alive = true;
    const cands = candidates(games, league);
    if (!cands.length) {
      setRanked([]);
      return;
    }
    setError(null);
    setProgress({ done: 0, total: 0 });
    const ids = cands.flatMap((g) => [g.home.id, g.away.id]);
    getManyTeamFeatures(league, ids, season, (done, total) => alive && setProgress({ done, total }))
      .then((feats) => {
        if (!alive) return;
        setRanked(rankGames(cands, feats, loadLevers(league), league));
        setProgress(null);
      })
      .catch((e) => alive && setError(e.message || 'Could not rank games'));
    return () => {
      alive = false;
    };
  }, [games, league, season]);

  // Grade locks as games finish.
  useEffect(() => {
    if (!locks.length) return;
    const graded = gradeLocks(locks, games);
    if (graded !== locks) {
      const next = { ...all, [wk]: graded };
      setAll(next);
      saveLocks(next);
    }
  }, [games]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (list) => {
    const next = { ...all, [wk]: list };
    setAll(next);
    saveLocks(next);
  };
  const addLock = (lock) => {
    if (locks.length >= MAX_LOCKS || locks.some((l) => l.id === lock.id)) return;
    persist([...locks, lock]);
  };
  const removeLock = (id) => persist(locks.filter((l) => l.id !== id));
  const lockFromRow = (game, row) => {
    if (row.type === 'spread') return makeLock(game, 'ATS', row.team, row.teamSpread);
    return makeLock(game, row.over ? 'OVER' : 'UNDER', null, null, row.line);
  };
  const isLocked = (game, row) => locks.some((l) => l.id === lockFromRow(game, row).id);

  const rec = locksRecord(all, { league, season });
  const top3 = ranked ? ranked.slice(0, 3) : [];
  const addTarget = preGames.find((g) => g.id === addGame);

  const submitAdd = () => {
    if (!addTarget) return;
    const team = addSide === 'home' ? addTarget.home : addTarget.away;
    let lock;
    if (addKind === 'ML') lock = makeLock(addTarget, 'ML', team);
    else if (addKind === 'ATS') {
      if (addTarget.homeSpread == null) return;
      lock = makeLock(addTarget, 'ATS', team, addSide === 'home' ? addTarget.homeSpread : -addTarget.homeSpread);
    } else {
      if (addTarget.overUnder == null) return;
      lock = makeLock(addTarget, addKind, null, null, addTarget.overUnder);
    }
    addLock(lock);
    setAdding(false);
    setAddGame('');
  };

  return (
    <div className="bb">
      {/* ---------- Computer's top 3 ---------- */}
      <section className="detail-card">
        <div className="detail-card-title">🤖 Computer's top 3 · Week {week}</div>
        <p className="muted small-text" style={{ margin: '0 0 10px' }}>
          Every game on the slate is run through your model (Stats → Model levers) against DraftKings' spread and total. These are the three bets with the most expected value.
        </p>
        {error && <div className="error small-text">{error}</div>}
        {progress && (
          <div className="empty small">
            <div className="spinner" />
            <p className="muted small-text">Crunching team numbers… {progress.done}/{progress.total}</p>
          </div>
        )}
        {ranked && !ranked.length && !progress && <div className="muted">No upcoming games with lines this week.</div>}
        {top3.map((r, i) => (
          <article key={r.game.id} className={`bb-card ${r.best.ev > 0 ? 'plus' : ''}`}>
            <div className="bb-head">
              <span className="bb-rank">#{i + 1}</span>
              <span className="bb-game">
                {r.game.name} <span className="muted small-text">· {when(r.game.date)}</span>
              </span>
              {onOpen && (
                <button className="stats-btn" onClick={() => onOpen(r.game)}>
                  Stats ›
                </button>
              )}
            </div>
            <div className="bb-bet">
              {r.best.bet} <span className="muted">({r.best.price})</span>
            </div>
            <div className="bb-nums">
              <span>
                Model <strong>{pct(r.best.model)}</strong>
              </span>
              <span>
                Book <strong>{pct(r.best.fair)}</strong>
              </span>
              <span>
                EV/$100 <strong className={r.best.ev > 0 ? 'pos' : ''}>{money(r.best.ev)}</strong>
              </span>
              <span>
                Kelly <strong>{r.best.stake ? `$${r.best.stake}` : '—'}</strong>
              </span>
            </div>
            <p className="bb-reason muted small-text">{r.reason}</p>
            <div className="bb-actions">
              <button className="btn-secondary" disabled={isLocked(r.game, r.best) || locks.length >= MAX_LOCKS} onClick={() => addLock(lockFromRow(r.game, r.best))}>
                {isLocked(r.game, r.best) ? '🔒 Locked' : '🔒 Lock it'}
              </button>
              {r.best.type === 'spread' && (
                <button className="btn-secondary" disabled={picks[pickKey(league, r.game.id)]?.teamId === r.best.team.id} onClick={() => onPick(r.game, r.best.team)}>
                  {picks[pickKey(league, r.game.id)]?.teamId === r.best.team.id ? `✓ Picked ${r.best.team.abbr}` : `Pick ${r.best.team.abbr} to win`}
                </button>
              )}
            </div>
          </article>
        ))}
        {ranked && ranked.length > 3 && (
          <>
            <button className="linkbtn" style={{ display: 'block', margin: '6px auto 0' }} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Hide the rest' : `Show all ${ranked.length} games ranked ›`}
            </button>
            {showAll && (
              <ul className="bb-list">
                {ranked.slice(3).map((r, i) => (
                  <li key={r.game.id} className="bb-row">
                    <span className="bb-rank">#{i + 4}</span>
                    <span className="bb-row-text">
                      <span className="bb-row-game">{r.game.name}</span>
                      <span className="muted small-text">
                        {r.best.bet} · model {pct(r.best.model)} · EV {money(r.best.ev)}
                      </span>
                    </span>
                    <button className="ma-del" title="Lock it" disabled={isLocked(r.game, r.best) || locks.length >= MAX_LOCKS} onClick={() => addLock(lockFromRow(r.game, r.best))}>
                      🔒
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ---------- Your locks ---------- */}
      <section className="detail-card">
        <div className="detail-card-title">
          🔒 Your locks · Week {week} · {locks.length}/{MAX_LOCKS}
        </div>
        <p className="muted small-text" style={{ margin: '0 0 10px' }}>
          Your {MAX_LOCKS} best bets of the week. Graded automatically when games go final. Season locks record: <strong>{rec.win}-{rec.loss}{rec.push ? `-${rec.push}` : ''}</strong>
          {rec.pending ? ` · ${rec.pending} pending` : ''}.
        </p>
        {!locks.length && <div className="muted small-text" style={{ marginBottom: 8 }}>No locks yet — lock one of the computer's picks above, or add your own.</div>}
        <ul className="pick-list">
          {locks.map((l) => (
            <li key={l.id} className={`pick-item ${l.result}`}>
              <div className="pick-main">
                <div className="pick-team">{l.label}</div>
                <div className="muted small-text">
                  {l.name} · {when(l.kickoff)}
                  {l.finalScore && ` · ${l.finalScore}`}
                </div>
              </div>
              <span className={`badge ${l.result}`}>{l.result === 'pending' ? 'OPEN' : l.result.toUpperCase()}</span>
              {l.result === 'pending' && (
                <button className="ma-del" aria-label="Remove" onClick={() => removeLock(l.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        {locks.length < MAX_LOCKS && !adding && (
          <button className="btn wide" onClick={() => setAdding(true)}>
            + Add your own lock
          </button>
        )}
        {adding && (
          <div className="bb-add">
            <select className="team-select" value={addGame} onChange={(e) => setAddGame(e.target.value)}>
              <option value="">Choose a game…</option>
              {preGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {when(g.date)}
                  {g.spread ? ` · ${g.spread}` : ''}
                </option>
              ))}
            </select>
            {addTarget && (
              <>
                <div className="chips">
                  {[
                    ['ATS', 'Spread'],
                    ['ML', 'To win'],
                    ['OVER', `Over ${addTarget.overUnder ?? ''}`],
                    ['UNDER', `Under ${addTarget.overUnder ?? ''}`],
                  ].map(([k, label]) => (
                    <button key={k} className={`chip ${addKind === k ? 'active' : ''}`} disabled={(k === 'ATS' && addTarget.homeSpread == null) || ((k === 'OVER' || k === 'UNDER') && addTarget.overUnder == null)} onClick={() => setAddKind(k)}>
                      {label}
                    </button>
                  ))}
                </div>
                {(addKind === 'ATS' || addKind === 'ML') && (
                  <div className="chips">
                    {[
                      ['away', addTarget.away],
                      ['home', addTarget.home],
                    ].map(([side, t]) => (
                      <button key={side} className={`chip ${addSide === side ? 'active' : ''}`} onClick={() => setAddSide(side)}>
                        {t.abbr}
                        {addKind === 'ATS' && addTarget.homeSpread != null && ` ${(side === 'home' ? addTarget.homeSpread : -addTarget.homeSpread) > 0 ? '+' : ''}${side === 'home' ? addTarget.homeSpread : -addTarget.homeSpread}`}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="wp-actions">
              <button className="btn-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button className="btn-secondary" disabled={!addTarget} onClick={submitAdd}>
                Add lock
              </button>
            </div>
          </div>
        )}
        <div className="note" style={{ marginTop: 12 }}>
          <strong>For customers (coming with accounts):</strong> your weekly locks and the computer's top 3 can be published to subscribers behind a paid tier, with a public track record.
        </div>
      </section>
    </div>
  );
}
