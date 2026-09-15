import React, { useEffect, useMemo, useState } from 'react';
import { fetchStandings, fetchTeamStats } from '../api/espnStats';
import { impliedProb, removeVig, probToAmerican, teamFeatures, predictGame, coverProb, overProb, expectedValue, kellyFraction, simulate, parseHomeSpread, shrinkFeatures, PRIORS } from '../engine/bettingModel';
import { loadLevers, saveLevers, resetLevers, isCustom } from '../store/model';
import ModelLevers from './ModelLevers';

const standingsCache = new Map();
async function standingRow(league, teamId) {
  if (!standingsCache.has(league)) standingsCache.set(league, fetchStandings(league).catch(() => []));
  const groups = await standingsCache.get(league);
  const row = groups.flatMap((g) => g.entries).find((e) => String(e.id) === String(teamId));
  return row ? { pf: Number(row.pf) || 0, pa: Number(row.pa) || 0, games: row.wins + row.losses + row.ties } : null;
}

const pct = (p) => (p == null ? '–' : `${Math.round(p * 100)}%`);
const money = (v) => (v == null ? '–' : `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`);
const signed = (n, d = 1) => (n == null ? '–' : `${n > 0 ? '+' : ''}${n.toFixed(d)}`);

/**
 * Market vs model for one game: fair odds (vig removed), a stat-driven projection, 10,000 simulated
 * games, expected value per bet, and Kelly stake sizing. Every input is adjustable in the levers.
 */
export default function EdgeCard({ game, league, season, odds, seasonStats }) {
  const [levers, setLevers] = useState(() => loadLevers(league));
  const [showLevers, setShowLevers] = useState(false);
  const [homeOut, setHomeOut] = useState(false);
  const [awayOut, setAwayOut] = useState(false);
  const [feat, setFeat] = useState(null); // { home, away }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => setLevers(loadLevers(league)), [league]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const get = async (t) => {
          const flat = seasonStats?.[t.id]?.flat || (await fetchTeamStats(league, t.id, season).catch(() => null))?.flat || {};
          const st = await standingRow(league, t.id);
          return teamFeatures(flat, st);
        };
        const [home, away] = await Promise.all([get(game.home), get(game.away)]);
        if (alive) setFeat({ home, away });
      } catch (e) {
        if (alive) setError(e.message || 'Could not load team numbers');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [league, season, game.id, game.home.id, game.away.id, seasonStats]);

  const shrunk = useMemo(() => {
    if (!feat) return null;
    const prior = PRIORS[league] || PRIORS.nfl;
    return { home: shrinkFeatures(feat.home, prior, levers.shrink), away: shrinkFeatures(feat.away, prior, levers.shrink) };
  }, [feat, league, levers.shrink]);
  const pred = useMemo(() => (shrunk ? predictGame(shrunk.home, shrunk.away, levers, { homeOut, awayOut }) : null), [shrunk, levers, homeOut, awayOut]);

  const market = useMemo(() => {
    if (!odds) return null;
    const hp = impliedProb(odds.homeML);
    const ap = impliedProb(odds.awayML);
    const fair = removeVig(hp, ap);
    const homeSpread = parseHomeSpread(odds.details, game.home.abbr, odds.spread);
    const j = levers.juice;
    const sp = removeVig(impliedProb(odds.homeSpreadOdds ?? j), impliedProb(odds.awaySpreadOdds ?? j));
    const tp = removeVig(impliedProb(odds.overOdds ?? j), impliedProb(odds.underOdds ?? j));
    return { hp, ap, fairHome: fair.a, fairAway: fair.b, overround: fair.overround, homeSpread, totalLine: odds.overUnder ?? null, spreadFairHome: sp.a, spreadFairAway: sp.b, totalFairOver: tp.a, totalFairUnder: tp.b };
  }, [odds, game.home.abbr, levers.juice]);

  const sim = useMemo(
    () => (pred ? simulate({ margin: pred.margin, total: pred.total, sigma: levers.sigma, sigmaT: levers.sigmaT, homeSpread: market?.homeSpread ?? null, totalLine: market?.totalLine ?? null }) : null),
    [pred, levers.sigma, levers.sigmaT, market?.homeSpread, market?.totalLine]
  );

  const rows = useMemo(() => {
    if (!pred) return [];
    const j = levers.juice;
    const H = game.home.abbr;
    const A = game.away.abbr;
    const pHome = pred.homeWin;
    const out = [];
    if (market?.hp != null) {
      out.push({ bet: `${H} moneyline`, price: odds.homeML, fair: market.fairHome, model: pHome });
      out.push({ bet: `${A} moneyline`, price: odds.awayML, fair: market.fairAway, model: 1 - pHome });
    }
    if (market?.homeSpread != null) {
      const pc = coverProb(pred.margin, market.homeSpread, levers.sigma);
      out.push({ bet: `${H} ${signed(market.homeSpread)}`, price: odds.homeSpreadOdds ?? j, fair: market.spreadFairHome, model: pc });
      out.push({ bet: `${A} ${signed(-market.homeSpread)}`, price: odds.awaySpreadOdds ?? j, fair: market.spreadFairAway, model: 1 - pc });
    }
    if (market?.totalLine != null) {
      const po = overProb(pred.total, market.totalLine, levers.sigmaT);
      out.push({ bet: `Over ${market.totalLine}`, price: odds.overOdds ?? j, fair: market.totalFairOver, model: po });
      out.push({ bet: `Under ${market.totalLine}`, price: odds.underOdds ?? j, fair: market.totalFairUnder, model: 1 - po });
    }
    return out.map((r) => {
      const ev = expectedValue(r.model, r.price, 100);
      const k = kellyFraction(r.model, r.price);
      return { ...r, ev, kelly: k, stake: k != null ? Math.round(k * levers.kellyFrac * levers.bankroll) : null, edge: r.fair != null ? r.model - r.fair : null };
    });
  }, [pred, market, odds, levers, game.home.abbr, game.away.abbr]);

  const update = (next) => {
    setLevers(next);
    saveLevers(league, next);
  };
  const H = game.home.abbr;
  const A = game.away.abbr;
  const favored = pred ? (pred.margin >= 0 ? H : A) : null;

  return (
    <section className="detail-card edge">
      <div className="detail-card-title">Edge · market vs your model</div>

      {loading && (
        <div className="empty small">
          <div className="spinner" />
        </div>
      )}
      {error && <div className="error small-text">{error}</div>}

      {pred && (
        <>
          <div className="edge-grid">
            <div className="edge-box">
              <div className="stat-title">Market</div>
              {market?.hp != null ? (
                <>
                  <div className="edge-big">
                    {H} {pct(market.fairHome)} · {A} {pct(market.fairAway)}
                  </div>
                  <div className="muted small-text">
                    Fair odds, vig removed ({(market.overround * 100).toFixed(1)}% hold). Book: {H} {odds.homeML > 0 ? '+' : ''}
                    {odds.homeML} / {A} {odds.awayML > 0 ? '+' : ''}
                    {odds.awayML}
                  </div>
                  <div className="muted small-text">
                    Line: {odds.details || '–'} · O/U {market.totalLine ?? '–'}
                  </div>
                </>
              ) : (
                <div className="muted small-text">No line posted yet — model only.</div>
              )}
            </div>
            <div className="edge-box">
              <div className="stat-title">Your model</div>
              <div className="edge-big">
                {H} {pct(pred.homeWin)} · {A} {pct(1 - pred.homeWin)}
              </div>
              <div className="muted small-text">
                Projects {favored} by {Math.abs(pred.margin).toFixed(1)} · total {pred.total.toFixed(1)}
                {market?.fairHome != null && ` · edge on ${H}: ${signed((pred.homeWin - market.fairHome) * 100, 1)} pts`}
              </div>
              <div className="muted small-text">Fair price: {H} {probToAmerican(pred.homeWin) > 0 ? '+' : ''}{probToAmerican(pred.homeWin)} / {A} {probToAmerican(1 - pred.homeWin) > 0 ? '+' : ''}{probToAmerican(1 - pred.homeWin)}</div>
            </div>
          </div>

          <div className="edge-toggles">
            <label>
              <input type="checkbox" checked={awayOut} onChange={(e) => setAwayOut(e.target.checked)} /> {A} key player out
            </label>
            <label>
              <input type="checkbox" checked={homeOut} onChange={(e) => setHomeOut(e.target.checked)} /> {H} key player out
            </label>
            <span className="muted small-text">(−{levers.keyOut} pts each · Bayes update)</span>
          </div>

          {rows.length > 0 && (
            <div className="box-scroll">
              <table className="edge-table">
                <thead>
                  <tr>
                    <th>Bet</th>
                    <th>Price</th>
                    <th>Market</th>
                    <th>Model</th>
                    <th>Edge</th>
                    <th>EV / $100</th>
                    <th>Kelly stake</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.bet} className={r.ev > 0 ? 'plus' : ''}>
                      <td className="edge-bet">{r.bet}</td>
                      <td>
                        {r.price > 0 ? '+' : ''}
                        {r.price}
                      </td>
                      <td>{pct(r.fair)}</td>
                      <td>{pct(r.model)}</td>
                      <td>{r.edge == null ? '–' : signed(r.edge * 100, 1)}</td>
                      <td className={r.ev > 0 ? 'pos' : 'neg'}>{money(r.ev)}</td>
                      <td>{r.stake ? `$${r.stake}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sim && (
            <div className="sim">
              <div className="stat-title">
                {sim.n.toLocaleString()} simulated games · {H} wins {pct(sim.homeWin)}
                {sim.homeCover != null && ` · covers ${pct(sim.homeCover)}`}
                {sim.over != null && ` · over ${pct(sim.over)}`}
              </div>
              <div className="hist" aria-hidden>
                {sim.bins.map((b, i) => (
                  <div key={i} className={`hist-bar ${i >= 6 ? 'home' : ''}`} style={{ height: `${Math.max(2, (b / Math.max(...sim.bins)) * 100)}%` }} title={`${-30 + i * 5} to ${-25 + i * 5}`} />
                ))}
              </div>
              <div className="hist-axis">
                <span>{A} by 30</span>
                <span>Even</span>
                <span>{H} by 30</span>
              </div>
            </div>
          )}

          <details className="cat-block" style={{ marginTop: 10 }}>
            <summary>What moved the line</summary>
            <table className="cat-table">
              <tbody>
                <tr>
                  <td>Home field</td>
                  <td className="num muted"></td>
                  <td className="num">{signed(levers.hfa)}</td>
                </tr>
                {shrunk?.home?.shrinkWeight != null && levers.shrink > 0 && (
                  <tr>
                    <td colSpan="3" className="muted small-text">
                      Small sample: stats below are {Math.round(shrunk.home.shrinkWeight * 100)}% team / {Math.round((1 - shrunk.home.shrinkWeight) * 100)}% league average ({feat.home.games} game{feat.home.games === 1 ? '' : 's'} played).
                    </td>
                  </tr>
                )}
                {pred.contributions.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td className="num muted">
                      {c.home == null || c.away == null ? 'n/a' : `${A} ${c.away.toFixed(1)} · ${H} ${c.home.toFixed(1)}`}
                    </td>
                    <td className="num">{c.diff == null ? '–' : signed(c.pts)}</td>
                  </tr>
                ))}
                {pred.keyAdj !== 0 && (
                  <tr>
                    <td>Key player out</td>
                    <td className="num muted"></td>
                    <td className="num">{signed(pred.keyAdj)}</td>
                  </tr>
                )}
                <tr>
                  <td>
                    <strong>Projected margin ({H})</strong>
                  </td>
                  <td className="num muted"></td>
                  <td className="num">
                    <strong>{signed(pred.margin)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </details>

          <button className="linkbtn" style={{ display: 'block', margin: '10px auto 0' }} onClick={() => setShowLevers((v) => !v)}>
            {showLevers ? 'Hide levers' : `⚙ Adjust model levers${isCustom(league, levers) ? ' (custom)' : ''}`}
          </button>
          {showLevers && <ModelLevers league={league} levers={levers} onChange={update} onReset={() => setLevers(resetLevers(league))} onClose={() => setShowLevers(false)} />}

          <p className="muted small-text" style={{ marginTop: 10 }}>
            Numbers are estimates for entertainment and research. Season stats are a small sample early in the year.
          </p>
        </>
      )}
    </section>
  );
}
