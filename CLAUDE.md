# CLAUDE.md

## Project Overview

Illucidate is primarily an interactive web dashboard for early signal discovery in bacterial detection kinetics (bioluminescent reporter phages for E. coli O157:H7 detection, Purdue University research). The `index.html` currently serves a temporary corporate landing page (institutional compliance firm facade) — this is intentional and short-lived. The research dashboard is linked from the landing page via `/research`. D3.js powers the dashboard visualizations.

## Tech Stack

- Vanilla JavaScript, HTML5, CSS3 — no build tool, no npm
- Landing page (`index.html`) is fully self-contained: all CSS and JS inline
- D3.js v7 via CDN for the research dashboard charts and heatmaps
- Google Fonts: DM Mono (monospace UI) + Cormorant Garamond (serif headings)
- Supabase for backend data (public anon key in `scripts/config.js`)
- Azure Static Web Apps for deployment
- Python/PowerShell dev servers for local development

## Repository Structure

### Landing Page
- `index.html` — Corporate landing page with inline CSS/JS, i18n (DE/EN/FR), dark theme, secure access modal
- `assets/illucidate_logo_nav.svg` — Nav logo
- `assets/07_45_42AM.png` — Hero background image
- `assets/illucidate_logo*.svg` — Logo variants

### Research Dashboard (linked from landing via `/research`)
- `designer.html` — Interactive plate layout builder
- `rationale.html`, `bio.html`, `roadmap.html`, `cite.html` — Content pages
- `scripts/app.js` — Dashboard controller (state, DOM, fetch, render loop)
- `scripts/analysis.js` — Statistical analysis (mean, variance, regression, Cohen's d, z-scores)
- `scripts/charts.js` — D3 rendering (series chart, feature ranking, plate heatmap)
- `scripts/plate-designer.js` — Interactive plate builder with multi-format support
- `scripts/xlsx-parser.js` — Excel file parsing
- `scripts/experiment-browser.js` — Experiment browser component
- `scripts/config.js` — Supabase configuration
- `styles/site.css` — Dashboard design system (tokens, components, responsive layout)
- `data/demo-dataset.json` — Synthetic kinetics dataset (96 wells, 37 timepoints)
- `data/default-plate-map.json` — Default plate map configuration

### Infrastructure
- `staticwebapp.config.json` — Azure routing (clean URLs, SPA fallback, 301 redirects)
- `.github/workflows/` — Azure Static Web Apps CI/CD
- `scripts/dev_server.py` / `scripts/dev-server.ps1` — Local dev servers
- `scripts/contact_leads_schema.sql`, `scripts/illucidate_schema_v1.sql` — Database schemas

## Development

```bash
# Start local dev server (default port 5500)
python ./scripts/dev_server.py [--port 5501]
```

No build step required — files are served and deployed as-is.

## Key Patterns

### Landing Page (`index.html`)
- Fully self-contained: inline `<style>` and `<script>` — no external CSS/JS dependencies
- Tri-language i18n system (German default, English, French) via inline `L` translation object
- `data-i` attributes on elements map to translation keys; `data-nav` for nav link text
- Dark theme with CSS custom properties (`--bg`, `--bge`, `--brd`, `--ac`, etc.)
- Fonts: `--sf` (Cormorant Garamond serif) for headings, `--mn` (DM Mono) for UI text
- Sections: hero, capabilities (6 cards in 3-col grid), jurisdictions, status indicators, research CTA, footer
- Secure access modal (agent number + client ID) — always returns "authentication failed"
- Responsive: single-column layout below 900px, hero image hidden on mobile
- Reveal animations via `.rv` class with staggered delays (`.d1`–`.d5`)

### Research Dashboard
- Dashboard data flow: fetch JSON → extract wells/groups → analysis functions → D3 render
- Dashboard CSS uses design tokens with a 4/8px spacing rhythm

### Shared
- Clean URL routing configured in `staticwebapp.config.json` with 301 redirects from `.html`

## Deployment

GitHub Actions deploys to Azure Static Web Apps on push to `main`. No build or API step — purely static content with CDN distribution.
