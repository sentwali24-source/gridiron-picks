import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEAGUES, fetchWeek } from './api/espn';
import { loadPicks, savePicks, gradePicks, pickKey } from './store/picks';
import Lobby from './components/Lobby';
import MyPicks from './components/MyPicks';
import Leaderboard from './components/Leaderboard';

const TABS = [
  { key: 'lobby', label: 'Lobby', icon: '🏈' },
  { key: 'picks', label: 'My Picks', icon: '✅' },
  { key: 'board', label: 'Standings', icon: '🏆' },
];

export default function App() {
  const [league, setLeague] = useState(() => localStorage.getItem('gp:league') || 'nfl');
  const [tab, setTab] = useState('lobby');
  const [week, setWeek] = useState(null); // null = "current" until ESPN tells us
  const [data, setData] = useState({ season: null, week: null, games: [] });
  const [currentWeek, setCurrentWeek] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [picks, setPicks] = useState(loadPicks);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timer = useRef(null);

  useEffect(() => localStorage.setItem('gp:league', league), [league]);
  useEffect(() => savePicks(picks), [picks]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await fetchWeek(league, week);
        setData(result);
        if (week == null) setCurrentWeek((c) => ({ ...c, [league]: result.week }));
        setPicks((p) => gradePicks(p, league, result.games));
        setLastUpdated(new Date());
      } catch (e) {
        setError(e.message || 'Could not load games');
      } finally {
        setLoading(false);
      }
    },
    [league, week]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 45s while any game on screen is live.
  useEffect(() => {
    clearInterval(timer.current);
    const live = data.games.some((g) => g.state === 'in');
    if (live) timer.current = setInterval(() => load(true), 45_000);
    return () => clearInterval(timer.current);
  }, [data.games, load]);

  const changeLeague = (key) => {
    if (key === league) return;
    setLeague(key);
    setWeek(null);
  };

  const makePick = (game, team) => {
    if (game.state !== 'pre') return; // locked at kickoff
    const k = pickKey(league, game.id);
    setPicks((p) => {
      if (p[k]?.teamId === team.id) {
        const { [k]: _removed, ...rest } = p; // tap again to clear
        return rest;
      }
      return {
        ...p,
        [k]: {
          league,
          season: data.season,
          week: data.week,
          gameId: game.id,
          teamId: team.id,
          teamAbbr: team.abbr,
          teamName: team.short,
          opponentAbbr: (team.id === game.home.id ? game.away : game.home).abbr,
          kickoff: game.date,
          madeAt: new Date().toISOString(),
          result: 'pending',
        },
      };
    });
  };

  const maxWeek = LEAGUES[league].maxWeek;
  const shownWeek = data.week ?? week ?? 1;
  const canPrev = shownWeek > 1;
  const canNext = shownWeek < maxWeek;

  const screen = useMemo(() => {
    switch (tab) {
      case 'picks':
        return <MyPicks picks={picks} league={league} season={data.season} week={shownWeek} games={data.games} />;
      case 'board':
        return <Leaderboard picks={picks} league={league} season={data.season} />;
      default:
        return (
          <Lobby
            games={data.games}
            picks={picks}
            league={league}
            loading={loading}
            error={error}
            onPick={makePick}
            onRetry={() => load()}
          />
        );
    }
  }, [tab, picks, league, data, shownWeek, loading, error]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <span className="brand-name">Gridiron Picks</span>
        </div>
        <div className="league-toggle" role="tablist">
          {Object.values(LEAGUES).map((L) => (
            <button
              key={L.key}
              role="tab"
              aria-selected={league === L.key}
              className={`pill ${league === L.key ? 'active' : ''}`}
              onClick={() => changeLeague(L.key)}
            >
              {L.label}
            </button>
          ))}
        </div>
      </header>

      {tab !== 'board' && (
        <div className="weekbar">
          <button className="weeknav" disabled={!canPrev} onClick={() => setWeek(shownWeek - 1)} aria-label="Previous week">
            ‹
          </button>
          <div className="weeklabel">
            <strong>Week {shownWeek}</strong>
            {data.season && <span className="muted"> · {data.season}</span>}
            {currentWeek[league] && currentWeek[league] !== shownWeek && (
              <button className="linkbtn" onClick={() => setWeek(null)}>
                Jump to this week
              </button>
            )}
          </div>
          <button className="weeknav" disabled={!canNext} onClick={() => setWeek(shownWeek + 1)} aria-label="Next week">
            ›
          </button>
        </div>
      )}

      <main className="screen">{screen}</main>

      <footer className="statusline">
        {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        <button className="linkbtn" onClick={() => load(true)} disabled={loading}>
          Refresh
        </button>
      </footer>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
