<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="Vitals icon">
</p>

<h1 align="center">Vitals</h1>

<p align="center">
  <strong>Your entire dev stack, living in the macOS notch.</strong>
</p>

<p align="center">
  <a href="https://github.com/eugumatos/vitals/releases/latest"><img src="https://img.shields.io/github/v/release/eugumatos/vitals?include_prereleases&style=flat-square&color=7c3aed" alt="Release"></a>
  <a href="https://github.com/eugumatos/vitals/actions"><img src="https://img.shields.io/github/actions/workflow/status/eugumatos/vitals/build.yml?style=flat-square" alt="Build"></a>
  <img src="https://img.shields.io/badge/platform-macOS-000?style=flat-square&logo=apple" alt="macOS">
</p>

<p align="center">
  <em>GitHub PRs. Vercel deploys. Sentry errors. API costs. System health.<br>All glanceable. Zero context switching.</em>
</p>

---

## Why Vitals?

You're deep in flow. A deploy fails. A PR gets approved. Sentry catches a new exception. Your OpenAI bill spikes.

Normally you'd find out minutes (or hours) later — after checking three dashboards, two Slack channels, and an email.

**Vitals surfaces everything that matters in real-time, right where your eyes already are: the menu bar.**

One glance. Zero tabs. Back to coding.

---

## What it looks like

| Resting | Hover (expanded) |
|---------|-----------------|
| Minimal indicator in the notch | Full panel with live data from all your services |

Press `⌘⇧N` to toggle the overlay. Hover to expand. Walk away and it goes silent.

---

## Integrations

| Service | What you see |
|---------|-------------|
| **GitHub** | PRs awaiting review, CI status, mentions, build failures |
| **Vercel** | Deploy status, velocity, success rate, MTTR, one-click rollback |
| **Sentry** | New exceptions, unresolved count, error trends |
| **OpenAI** | Token usage, cost breakdown by model |
| **Anthropic** | API usage and spend |
| **Datadog** | Service health and infrastructure metrics |
| **Supabase** | Database health and usage |
| **System** | CPU, memory, and local machine health (always on) |

Connect what you use, ignore the rest. Each integration is independent.

---

## Features

- **Lives in the notch** — Not another Dock icon. Not another tab. It's just _there_.
- **Deploy streaks** — Track consecutive successful deploys. Break the streak and you'll know instantly.
- **Anomaly detection** — Combines signals from Vercel + Sentry + GitHub to surface problems before they page you.
- **Smart silence** — Configure quiet hours and weekends. No pings at 2am.
- **Auto-update** — New versions install silently. Always up to date.
- **OAuth-first** — No manual tokens. Connect with one click.
- **Lightweight** — Native Electron app, adaptive polling, minimal resource usage.

---

## Install

### Download

Grab the latest DMG from [**Releases**](https://github.com/eugumatos/vitals/releases/latest):

- **Apple Silicon (M1–M4):** `Vitals-*-arm64.dmg`
- **Intel:** `Vitals-*-x64.dmg`

### First launch

macOS will block unsigned apps. Bypass once:

```bash
# Option A: Right-click → Open → Confirm
# Option B:
xattr -cr /Applications/Vitals.app
```

Then just open Vitals. It appears in the menu bar — not the Dock.

---

## Dev setup

```bash
git clone https://github.com/eugumatos/vitals.git
cd vitals
npm install
npm start          # dev mode (renderer + electron)
```

### Scripts

| Command | What it does |
|---------|-------------|
| `npm start` | Dev mode with hot reload |
| `npm run build` | Compile for production |
| `npm run dist` | Build DMG |
| `npm test` | Run tests |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier format |

---

## Releasing

```bash
npm version 0.1.0-beta.2 --no-git-tag-version
git add package.json && git commit -m "Release v0.1.0-beta.2"
git tag v0.1.0-beta.2
git push && git push --tags
```

GitHub Actions builds both architectures and publishes to Releases automatically. Users with the app installed receive the update silently.

---

## Stack

- **Electron** — Native macOS menu bar app
- **React 19** + **Framer Motion** — Smooth, animated UI
- **Tailwind CSS 4** — Utility-first styling
- **Zustand** — Lightweight state management
- **sql.js** — Local SQLite for deploy history and streaks
- **electron-updater** — Silent auto-updates via GitHub Releases

---

## License

Private beta. Not yet open source.

---

<p align="center">
  <sub>Built by <a href="https://github.com/eugumatos">@eugumatos</a></sub>
</p>
