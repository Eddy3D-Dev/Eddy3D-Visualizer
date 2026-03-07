# Eddy3D Visualizer

A web-based visualization tool for [Eddy3D](https://www.eddy3d.com/) simulation results. Upload CSV data and explore 3D airflow and environmental patterns interactively.

| Deployment | Link | Status |
| --- | --- | --- |
| Main | [viz.eddy3d.com](https://viz.eddy3d.com/) | [![prod-deploy](https://github.com/Eddy3D-Dev/Eddy3D-Visualizer/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/Eddy3D-Dev/Eddy3D-Visualizer/actions/workflows/deploy.yml?query=branch%3Amain) |
| Dev | [dev.viz.eddy3d.com](https://dev.viz.eddy3d.com/) | [![dev-deploy](https://api.netlify.com/api/v1/badges/d2c336e9-4807-4de4-9228-a1094ad00dc1/deploy-status)](https://app.netlify.com/projects/dev-viz-eddy3d/deploys) |

## Features

- **CSV Import** — drag-and-drop or upload `.csv` result files
- **Interactive 3D** — orbit, pan, zoom; switch between perspective and top-down views
- **Colormaps** — Turbo, Jet, Viridis, Inferno, Magma with adjustable min/max range
- **Display Controls** — toggle buildings, edges, grid; adjust point size or use gapless mode
- **Screenshot Export** — batch-download views at configurable DPI (100–1200 px)
- **Auto-Rotate** — spin the model hands-free for presentations

## Branching & Versioning

| Branch | Purpose | Versioning | Deploy target |
| --- | --- | --- | --- |
| `dev` (default) | Active development | Pre-release — `vX.Y.Z-dev.DATE.SHA` | dev.viz.eddy3d.com |
| `main` | Stable releases | Release — `vX.Y.Z` | viz.eddy3d.com |

Pushes to either branch automatically sync the other via GitHub Actions and create a GitHub Release (pre-release for `dev`, stable for `main`). The deployed app displays the current version in the sidebar.

<details>
<summary>Local development</summary>

### Prerequisites

- [Node.js](https://nodejs.org/) `>=20.19.0` or `>=22.12.0` (Node 22 LTS recommended)

### Setup

```bash
cd gui
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173/`).

</details>

<details>
<summary>Production build</summary>

```bash
cd gui
npm run build
```

Output is written to `gui/dist`.

</details>

<details>
<summary>Deployment details</summary>

- **GitHub Pages** deploys `main` via `.github/workflows/deploy.yml`.
- **Netlify** deploys `dev` using the `dev` context in `netlify.toml`.
- **GitHub Actions** handles versioning (`.github/workflows/version.yml`) and branch syncing (`.github/workflows/sync-branches.yml`).
- Version is injected at build time via `VITE_APP_VERSION` and `VITE_APP_BRANCH` environment variables.

</details>
