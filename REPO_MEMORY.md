# Repository Memory: illucidate-landing2

This file is a quick internal memory aid summarizing what this codebase contains and how it is organized.

## What this repository is
- Static website repo with two main experiences:
  - A temporary corporate-style landing page (`index.html`).
  - A research dashboard and related pages for experiment visualization/analysis.
- No npm/build pipeline required for normal development; served as static files.

## Key pages
- `index.html` — main landing page.
- `designer.html` — plate designer UI.
- `master-timeline.html` — timeline view.
- `rationale.html`, `bio.html`, `roadmap.html`, `cite.html`, `multivariate.html` — supporting research/content pages.

## Core JavaScript modules
- `scripts/app.js`
  - Main dashboard controller.
  - Handles state (metric, visible groups, target group, time index, selected channels).
  - Wires DOM controls and triggers recompute/render.
- `scripts/analysis.js`
  - Feature engineering + analytics helpers.
  - Computes derived series, per-well features, ranking/comparisons, detection/z-style stats.
  - Supports core metrics (`od600`, `luminescence`, `ratio`) and extra channels when present.
- `scripts/charts.js`
  - D3-based rendering utilities.
  - Renders series chart, feature chart, and plate heatmap.
  - Handles responsive token sizing and tooltip/empty-state behavior.
- `scripts/plate-designer.js`, `scripts/xlsx-parser.js`, `scripts/experiment-browser.js`
  - Plate layout tooling, spreadsheet parsing, and experiment browsing flows.

## Data and config
- `data/demo-dataset.json` — demo experiment dataset.
- `data/default-plate-map.json` — default plate layout/map.
- `data/master-timeline-default.json` — default timeline data.
- `scripts/config.js` — Supabase client-side configuration.

## Styling and assets
- `styles/site.css` — global design system/layout styles.
- `styles/master-timeline.css` — timeline-specific styles.
- `assets/` — logos + imagery used by landing/dashboard pages.

## Local development
- Python dev server: `python ./scripts/dev_server.py` (default `:5500`).
- PowerShell option: `./scripts/dev-server.ps1`.

## Deployment/routing
- `staticwebapp.config.json` configures Azure Static Web Apps routing and redirects.
- Repo appears intended for static deployment (no build step).

## Notes for future edits
- Prefer small, static-file friendly changes (HTML/CSS/vanilla JS).
- Keep dashboard data flow in mind: load dataset -> compute features/statistics -> render D3 views.
- If adding new metrics/channels, ensure support is consistent across `analysis.js`, `app.js`, and chart labeling.
