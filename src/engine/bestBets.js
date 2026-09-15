// Rank a week's games by the model's edge against the posted spread and total.
import { predictGame, shrinkFeatures, PRIORS, coverProb, overProb, impliedProb, removeVig, expectedValue, kellyFraction, blendWithMarket } from './bettingModel';

const sgn = (n) => (n > 0 ? `+${n}` : `${n}`);

/**
 * @param games   normalized games (only 'pre' games are ranked)
 * @param feats   { teamId: features } from getManyTeamFeatures
 * @param levers  model levers for the league
 * @returns [{ game, pred, best, rows, reason }] sorted by best.ev desc
 */
export function rankGames(games, feats, levers, league) {
  const prior = PRIORS[league] || PRIORS.nfl;
  const j = levers.juice;
  const fair = removeVig(impliedProb(j), impliedProb(j)).a; // e.g. 50% at −110/−110
  const out = [];
  for (const g of games) {
    if (g.state !== 'pre') continue;
    const fh = feats[String(g.home.id)];
    const fa = feats[String(g.away.id)];
    if (!fh || !fa) continue;
    const raw = predictGame(shrinkFeatures(fh, prior, levers.shrink), shrinkFeatures(fa, prior, levers.shrink), levers);
    const pred = blendWithMarket(raw, g.homeSpread, g.overUnder, levers.marketBlend, levers.sigma);
    const rows = [];
    if (g.homeSpread != null) {
      const pc = coverProb(pred.margin, g.homeSpread, levers.sigma);
      rows.push({ type: 'spread', team: g.home, teamSpread: g.homeSpread, bet: `${g.home.abbr} ${sgn(g.homeSpread)}`, price: j, fair, model: pc });
      rows.push({ type: 'spread', team: g.away, teamSpread: -g.homeSpread, bet: `${g.away.abbr} ${sgn(-g.homeSpread)}`, price: j, fair, model: 1 - pc });
    }
    if (g.overUnder != null) {
      const po = overProb(pred.total, g.overUnder, levers.sigmaT);
      rows.push({ type: 'total', bet: `Over ${g.overUnder}`, line: g.overUnder, over: true, price: j, fair, model: po });
      rows.push({ type: 'total', bet: `Under ${g.overUnder}`, line: g.overUnder, over: false, price: j, fair, model: 1 - po });
    }
    if (!rows.length) continue;
    for (const r of rows) {
      r.ev = expectedValue(r.model, r.price, 100);
      r.kelly = kellyFraction(r.model, r.price);
      r.edge = r.model - r.fair;
      r.stake = Math.round((r.kelly || 0) * levers.kellyFrac * levers.bankroll);
    }
    rows.sort((a, b) => b.ev - a.ev);
    const best = rows[0];
    const favored = pred.margin >= 0 ? g.home : g.away;
    const top = pred.contributions.filter((c) => c.diff != null && Math.abs(c.pts) > 0.05).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts))[0];
    const statsFav = raw.margin >= 0 ? g.home : g.away;
    const reason =
      `Model: ${favored.abbr} by ${Math.abs(pred.margin).toFixed(1)} after anchoring to the line (stats alone: ${statsFav.abbr} by ${Math.abs(raw.margin).toFixed(1)}; book ${g.spread || 'no line'}), total ${pred.total.toFixed(1)} vs ${g.overUnder ?? '–'}.` +
      (top ? ` Biggest factor: ${top.label.toLowerCase()} (${top.pts > 0 ? '+' : ''}${top.pts.toFixed(1)} pts ${top.pts > 0 ? g.home.abbr : g.away.abbr}).` : '');
    out.push({ game: g, pred, best, rows, reason });
  }
  return out.sort((a, b) => b.best.ev - a.best.ev);
}
