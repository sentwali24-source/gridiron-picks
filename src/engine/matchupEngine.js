// Player-vs-player matchup grading. Stats come in already projected to a full season
// (see api/espnPlayers.js), get normalized to 0–100 against typical ranges, and are
// weighted by how much they matter for this particular position pairing.

export const POS_MAP = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  HB: 'RB',
  WR: 'WR',
  TE: 'TE',
  DE: 'EDGE',
  EDGE: 'EDGE',
  OLB: 'EDGE',
  DT: 'DL',
  NT: 'DL',
  DL: 'DL',
  LB: 'LB',
  ILB: 'LB',
  MLB: 'LB',
  CB: 'CB',
  DB: 'CB',
  S: 'S',
  FS: 'S',
  SS: 'S',
};
export const OFFENSE_ROLES = ['QB', 'RB', 'WR', 'TE'];
export const DEFENSE_ROLES = ['EDGE', 'DL', 'LB', 'CB', 'S'];
export const ROLE_LABEL = { QB: 'Quarterback', RB: 'Running back', WR: 'Receiver', TE: 'Tight end', EDGE: 'Edge rusher', DL: 'Interior D-line', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety' };

export const STAT_LABEL = {
  passingYards: 'Passing yards',
  QBRating: 'Passer rating',
  passingTouchdowns: 'Passing TDs',
  rushingYards: 'Rushing yards',
  yardsPerRushAttempt: 'Yards per carry',
  rushingTouchdowns: 'Rushing TDs',
  receptions: 'Catches',
  receivingYards: 'Receiving yards',
  receivingTouchdowns: 'Receiving TDs',
  yardsPerReception: 'Yards per catch',
  totalTackles: 'Tackles',
  stuffs: 'Tackles for loss',
  sacks: 'Sacks',
  passesDefended: 'Passes defended',
  interceptions: 'Interceptions',
  fumblesForced: 'Forced fumbles',
};

// Full-season ranges used to turn a raw number into a 0–100 score.
const RANGE = {
  passingYards: [1500, 5000],
  QBRating: [60, 120],
  passingTouchdowns: [5, 40],
  rushingYards: [100, 1800],
  yardsPerRushAttempt: [3, 6],
  rushingTouchdowns: [0, 18],
  receptions: [10, 120],
  receivingYards: [100, 1600],
  receivingTouchdowns: [0, 15],
  yardsPerReception: [6, 18],
  totalTackles: [20, 160],
  stuffs: [0, 20],
  sacks: [0, 18],
  passesDefended: [0, 20],
  interceptions: [0, 7],
  fumblesForced: [0, 5],
};

const OFF = {
  run: { rushingYards: 0.4, yardsPerRushAttempt: 0.3, rushingTouchdowns: 0.15, receivingYards: 0.15 },
  catchRB: { receptions: 0.35, receivingYards: 0.4, receivingTouchdowns: 0.25 },
  pass: { passingYards: 0.4, QBRating: 0.3, passingTouchdowns: 0.15, rushingYards: 0.15 },
  catch: { receptions: 0.3, receivingYards: 0.35, receivingTouchdowns: 0.15, yardsPerReception: 0.2 },
};
const DEF = {
  runStopLB: { totalTackles: 0.35, stuffs: 0.3, sacks: 0.1, fumblesForced: 0.1, passesDefended: 0.15 },
  runStopDL: { stuffs: 0.4, totalTackles: 0.3, sacks: 0.15, fumblesForced: 0.15 },
  passRush: { sacks: 0.45, stuffs: 0.2, fumblesForced: 0.15, passesDefended: 0.2 },
  passRushLB: { sacks: 0.3, passesDefended: 0.3, interceptions: 0.2, totalTackles: 0.2 },
  coverage: { passesDefended: 0.4, interceptions: 0.3, totalTackles: 0.3 },
  coverageLB: { passesDefended: 0.35, totalTackles: 0.4, interceptions: 0.25 },
};

// Which offensive/defensive stat sets apply for each pairing, plus a one-line story.
const PAIRS = {
  RB_vs_LB: [OFF.run, DEF.runStopLB, 'The linebacker keys on the running back every snap — this is the classic ground-game duel.'],
  RB_vs_EDGE: [OFF.run, DEF.runStopDL, 'Can the edge set the edge and force runs back inside?'],
  RB_vs_DL: [OFF.run, DEF.runStopDL, 'Interior run stuffing vs the back finding gaps.'],
  RB_vs_S: [OFF.catchRB, DEF.coverage, 'Safety covering the back on check-downs and screens.'],
  RB_vs_CB: [OFF.catchRB, DEF.coverage, 'Corner matched on the back out of the backfield.'],
  QB_vs_EDGE: [OFF.pass, DEF.passRush, 'Pass rush vs pocket presence — pressure changes everything.'],
  QB_vs_DL: [OFF.pass, DEF.passRush, 'Interior push collapses the pocket fastest.'],
  QB_vs_LB: [OFF.pass, DEF.passRushLB, 'Linebacker blitzing and covering the middle of the field.'],
  QB_vs_CB: [OFF.pass, DEF.coverage, 'Ball-hawking corner vs the passer’s decision making.'],
  QB_vs_S: [OFF.pass, DEF.coverage, 'Deep safety taking away the big play.'],
  WR_vs_CB: [OFF.catch, DEF.coverage, 'Island matchup — receiver vs corner, one on one.'],
  WR_vs_S: [OFF.catch, DEF.coverage, 'Safety help over the top vs a receiver who wins deep.'],
  WR_vs_LB: [OFF.catch, DEF.coverageLB, 'Receiver working the middle against a linebacker in coverage.'],
  TE_vs_LB: [OFF.catch, DEF.coverageLB, 'Tight end vs linebacker — a size and speed mismatch either way.'],
  TE_vs_S: [OFF.catch, DEF.coverage, 'Safety assigned to the tight end in the seam.'],
  TE_vs_CB: [OFF.catch, DEF.coverage, 'Corner on a tight end — size vs speed.'],
};

export function pairKey(offRole, defRole) {
  return `${offRole}_vs_${defRole}`;
}
export function isSupported(offRole, defRole) {
  return !!PAIRS[pairKey(offRole, defRole)];
}
export const PAIR_KEYS = Object.keys(PAIRS);
export function pairLabel(key) {
  const [o, , d] = key.split('_');
  return `${ROLE_LABEL[o] || o} vs ${ROLE_LABEL[d] || d}`;
}

/** Built-in weights for a pairing: { off: {stat: weight}, def: {stat: weight} } (copies, safe to edit). */
export function defaultWeights(key) {
  const p = PAIRS[key];
  return p ? { off: { ...p[0] }, def: { ...p[1] } } : null;
}

/** Effective weights = user overrides (from Settings) layered over the defaults. */
export function effectiveWeights(key, overrides) {
  const d = defaultWeights(key);
  if (!d) return null;
  const o = overrides?.[key];
  return o ? { off: { ...d.off, ...o.off }, def: { ...d.def, ...o.def } } : d;
}

function norm(key, value) {
  if (value == null || Number.isNaN(value)) return null;
  const [lo, hi] = RANGE[key] || [0, 100];
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1));

/**
 * @param offRole  'QB' | 'RB' | 'WR' | 'TE'
 * @param defRole  'EDGE' | 'DL' | 'LB' | 'CB' | 'S'
 * @param offStats { statName: number } projected full-season numbers for the offensive player
 * @param defStats { statName: number } for the defender
 */
export function analyze(offRole, defRole, offStats = {}, defStats = {}, overrides = null) {
  const key = pairKey(offRole, defRole);
  const pair = PAIRS[key];
  if (!pair) {
    return { supported: false, score: 0, side: 'neutral', factors: [], explanation: `${ROLE_LABEL[offRole] || offRole} vs ${ROLE_LABEL[defRole] || defRole} isn't a matchup this grades yet.`, confidence: 0 };
  }
  const story = pair[2];
  const { off: offW, def: defW } = effectiveWeights(key, overrides);

  const side = (weights, stats, who) => {
    let sum = 0;
    let wsum = 0;
    let have = 0;
    const factors = [];
    for (const [key, w] of Object.entries(weights)) {
      const raw = stats[key];
      const n = norm(key, raw);
      if (n != null) {
        sum += n * w;
        wsum += w;
        have++;
      }
      factors.push({ key, label: STAT_LABEL[key] || key, who, weight: w, raw, display: fmt(raw), norm: n });
    }
    return { avg: wsum ? sum / wsum : null, factors, coverage: have / Object.keys(weights).length };
  };

  const o = side(offW, offStats, 'offense');
  const d = side(defW, defStats, 'defense');
  const offAvg = o.avg ?? 50;
  const defAvg = d.avg ?? 50;
  const score = Math.round(Math.max(-100, Math.min(100, (offAvg - defAvg) * 2)));
  const verdict = score > 12 ? 'offense' : score < -12 ? 'defense' : 'neutral';
  const confidence = Math.round(((o.coverage + d.coverage) / 2) * 100);

  const top = (f) => f.filter((x) => x.norm != null).sort((a, b) => b.norm * b.weight - a.norm * a.weight)[0];
  const ob = top(o.factors);
  const db = top(d.factors);
  const offLabel = ROLE_LABEL[offRole] || offRole;
  const defLabel = ROLE_LABEL[defRole] || defRole;
  let explanation;
  if (verdict === 'offense') {
    explanation = `${offLabel} has the edge. ${ob ? `${ob.label} (${ob.display}) is the difference` : 'The offensive numbers are stronger'}${db ? `, and the ${defLabel.toLowerCase()}'s best trait, ${db.label.toLowerCase()} (${db.display}), isn't enough to offset it` : ''}. Expect this side to win more snaps.`;
  } else if (verdict === 'defense') {
    explanation = `${defLabel} can contain this matchup. ${db ? `${db.label} (${db.display}) stands out` : 'The defensive numbers are stronger'}${ob ? `, and the ${offLabel.toLowerCase()}'s ${ob.label.toLowerCase()} (${ob.display}) doesn't overcome it` : ''}. Expect the offense to lean elsewhere.`;
  } else {
    explanation = `Even matchup. ${ob ? `${ob.label} (${ob.display})` : 'The offense'} vs ${db ? `${db.label.toLowerCase()} (${db.display})` : 'the defense'} roughly cancel out — game flow and scheme will decide it.`;
  }

  return {
    supported: true,
    pair: key,
    score,
    side: verdict,
    offScore: Math.round(offAvg),
    defScore: Math.round(defAvg),
    factors: [...o.factors, ...d.factors],
    explanation,
    story,
    confidence,
  };
}
