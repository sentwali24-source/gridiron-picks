import React from 'react';
import { FEATURES } from '../engine/bettingModel';
import { LEVER_INFO, DEFAULT_LEVERS, isCustom } from '../store/model';

function Row({ label, help, value, unit, min, max, step, changed, onChange, display }) {
  return (
    <label className={`lv-row ${changed ? 'changed' : ''}`}>
      <span className="lv-top">
        <span className="lv-label">{label}</span>
        <strong className="lv-val">
          {display ?? value}
          {unit && ` ${unit}`}
        </strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <span className="muted small-text">{help}</span>}
    </label>
  );
}

/** Levers for the betting model. `levers` is the full object for the league; onChange gets the new one. */
export default function ModelLevers({ league, levers, onChange, onReset, onClose }) {
  const d = DEFAULT_LEVERS[league] || DEFAULT_LEVERS.nfl;
  const set = (k, v) => onChange({ ...levers, [k]: v });
  const setW = (k, v) => onChange({ ...levers, weights: { ...levers.weights, [k]: v } });
  const custom = isCustom(league, levers);
  const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

  return (
    <div className="wp lv">
      <div className="wp-head">
        <strong>Model levers · {league === 'nfl' ? 'NFL' : 'College'}</strong>
        {onClose && (
          <button className="linkbtn" onClick={onClose}>
            Done
          </button>
        )}
      </div>

      <div className="stat-title" style={{ marginTop: 6 }}>Game model</div>
      {LEVER_INFO.filter((l) => !['kellyFrac', 'juice'].includes(l.key)).map(({ key, ...l }) => (
        <Row key={key} {...l} value={levers[key]} changed={!eq(levers[key], d[key])} onChange={(v) => set(key, v)} />
      ))}

      <div className="stat-title" style={{ marginTop: 14 }}>How much each stat moves the line</div>
      <p className="muted small-text" style={{ margin: '2px 0 4px' }}>
        Points of margin per one unit of difference between the teams. Example: 0.5 for points/game means a team scoring 6 more per game gets +3.
      </p>
      {FEATURES.map((f) => (
        <Row
          key={f.key}
          label={f.label}
          unit={`pts per ${f.unit}`}
          value={levers.weights[f.key] ?? 0}
          display={(levers.weights[f.key] ?? 0).toFixed(f.step < 0.01 ? 3 : 2)}
          min={0}
          max={f.max}
          step={f.step}
          changed={!eq(levers.weights[f.key], d.weights[f.key])}
          onChange={(v) => setW(f.key, v)}
        />
      ))}

      <div className="stat-title" style={{ marginTop: 14 }}>Bankroll</div>
      {LEVER_INFO.filter((l) => ['kellyFrac', 'juice'].includes(l.key)).map(({ key, ...l }) => (
        <Row key={key} {...l} value={levers[key]} changed={!eq(levers[key], d[key])} onChange={(v) => set(key, v)} />
      ))}
      <label className="lv-row">
        <span className="lv-top">
          <span className="lv-label">Bankroll</span>
        </span>
        <input type="number" className="team-select" style={{ margin: 0 }} min="0" step="50" value={levers.bankroll} onChange={(e) => set('bankroll', Math.max(0, Number(e.target.value) || 0))} />
        <span className="muted small-text">Used only to turn the Kelly fraction into a dollar stake.</span>
      </label>

      <div className="wp-actions">
        <button className="btn-secondary" onClick={onReset} disabled={!custom}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
