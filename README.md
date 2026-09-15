# Gridiron Picks

Weekly NFL and college football pick'em. Installable on your phone from the browser (no app store needed).

**Live site:** `https://sentwali24-source.github.io/gridiron-picks/`

## What it does

- **Lobby** — this week's NFL or college (FBS) games with logos, kickoff times, TV, live scores, and betting lines when available
- **Make picks** — tap the team you think wins; picks lock at kickoff
- **My Picks** — auto-graded when games go final; weekly and season records
- **Standings** — your season record (multi-player leagues coming in v2)

Scores come from ESPN's public scoreboard feed and refresh automatically while games are live.

## Install on your phone

1. Open the live site in **Safari** (iPhone) or **Chrome** (Android)
2. iPhone: tap **Share → Add to Home Screen**
   Android: tap the **⋮ menu → Add to Home screen** (or the "Install" banner)
3. Launch it from the icon like any other app

## Run it on your computer

```bash
npm install
npm run dev
```

Then open http://localhost:5180

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages automatically (see `.github/workflows/deploy.yml`).
One-time setup in the repository: **Settings → Pages → Source: GitHub Actions**.

## Roadmap

- v2: accounts, private leagues with friends, shared leaderboard
- Spread and over/under picks once lines are posted
- Matchup analysis powered by the `football-analytics` engine
