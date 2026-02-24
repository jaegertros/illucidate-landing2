# CLAUDE.md

## Project Overview

Illucidate is a static landing page and interactive web dashboard for early signal discovery in bacterial detection. It visualizes plate-reader kinetics data (OD600, luminescence, ratio) using D3.js. Research context: bioluminescent reporter phages for E. coli O157:H7 detection at Purdue University.

## Tech Stack

- Vanilla JavaScript (ES6 modules), HTML5, CSS3 — no build tool, no npm
- D3.js v7 via CDN for charts and heatmaps
- Supabase for contact form submissions (public anon key in `scripts/config.js`)
- Azure Static Web Apps for deployment
- Python/PowerShell dev servers for local development

## Repository Structure

- `index.html` — Main dashboard with interactive controls and D3 visualizations
- `designer.html` — Interactive plate layout builder
- `rationale.html`, `bio.html`, `roadmap.html`, `cite.html` — Content pages
- `scripts/app.js` — Dashboard controller (state, DOM, fetch, render loop)
- `scripts/analysis.js` — Statistical analysis (mean, variance, regression, Cohen's d, z-scores)
- `scripts/charts.js` — D3 rendering (series chart, feature ranking, plate heatmap)
- `scripts/plate-designer.js` — Interactive plate builder with multi-format support
- `scripts/config.js` — Supabase configuration
- `styles/site.css` — Full design system (tokens, components, responsive layout)
- `data/demo-dataset.json` — Synthetic kinetics dataset (96 wells, 37 timepoints)
- `staticwebapp.config.json` — Azure routing (clean URLs, SPA fallback)

## Development

```bash
# Start local dev server (default port 5500)
python ./scripts/dev_server.py [--port 5501]
```

No build step required — files are served and deployed as-is.

## Key Patterns

- All pages share a consistent nav bar and layout template
- Dashboard data flow: fetch JSON → extract wells/groups → analysis functions → D3 render
- CSS uses design tokens (custom properties) with a 4/8px spacing rhythm
- Clean URL routing configured in `staticwebapp.config.json` with 301 redirects from `.html`
- Contact form posts directly to Supabase `contact_leads` table

## Deployment

GitHub Actions deploys to Azure Static Web Apps on push to `main`. No build or API step — purely static content with CDN distribution.
