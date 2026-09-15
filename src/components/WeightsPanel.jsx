import React, { useState } from 'react';
import { PAIR_KEYS, pairLabel, defaultWeights, effectiveWeights, STAT_LABEL } from '../engine/matchupEngine';

function Sliders({ title, weights, defaults, onChange }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="wp-col">
      <div className="stat-title">{title}</div>
      {Object.entries(weights).map(([stat, w]) => {
        const changed = Math.abs(w - (defaults[stat] ?? 0)) > 0.001;
        return (
          <label key={stat} className={`wp-row ${changed ? 'changed' : ''}`}>
            <span className="wp-label">
              {STAT_LABEL[stat] || stat}
              <span className="muted"> {Math.round((w / total) * 100)}%</span>
            </span>
            <input type="range" min="0" max="100" step="5" value={Math.round(w * 100)} onChange={(e) => onChange(stat, Number(e.target.value) / 100)} />
          </label>
        );
      })}
    </div>
  );
}

/**
 * Levers for how much each stat counts in a pairing. `overrides` is the saved user map;
 * `onChange(nextOverrides)` receives the full updated map.
 */
export default function WeightsPanel({ pair: initialPair, overrides, onChange, onClose }) {
  const [pair, setPair] = useState(initialPair && PAIR_KEYS.includes(initialPair) ? initialPair : PAIR_KEYS[0]);
  const eff = effectiveWeights(pair, overrides);
  const def = defaultWeights(pair);
  const touched = !!overrides?.[pair];

  const set = (side, stat, value) => {
    const cur = effectiveWeights(pair, overrides);
    onChange({ ...overrides, [pair]: { off: { ...cur.off }, def: { ...cur.def }, [side]: { ...cur[side], [stat]: value } } });
  };
  const resetPair = () => {
    const { [pair]: _drop, ...rest } = overrides || {};
    onChange(rest);
  };
  const resetAll = () => onChange({});

  return (
    <div className="wp">
      <div className="wp-head">
        <strong>Grading weights</strong>
        {onClose && (
          <button className="linkbtn" onClick={onClose}>
            Done
          </button>
        )}
      </div>
      <p className="muted small-text" style={{ margin: '0 0 8px' }}>
        Slide a stat up to make it count more, down to ignore it. Percentages show each stat's share of that side's grade. Changes save on this phone and apply to every analysis.
      </p>
      <select className="team-select" value={pair} onChange={(e) => setPair(e.target.value)}>
        {PAIR_KEYS.map((k) => (
          <option key={k} value={k}>
            {pairLabel(k)}
            {overrides?.[k] ? ' (custom)' : ''}
          </option>
        ))}
      </select>
      <div className="wp-cols">
        <Sliders title="Offense" weights={eff.off} defaults={def.off} onChange={(s, v) => set('off', s, v)} />
        <Sliders title="Defense" weights={eff.def} defaults={def.def} onChange={(s, v) => set('def', s, v)} />
      </div>
      <div className="wp-actions">
        <button className="btn-secondary" onClick={resetPair} disabled={!touched}>
          Reset this pairing
        </button>
        <button className="btn-secondary" onClick={resetAll} disabled={!overrides || !Object.keys(overrides).length}>
          Reset all
        </button>
      </div>
    </div>
  );
}
