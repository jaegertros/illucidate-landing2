# illucidate-landing

Static landing page + interactive dashboard for Illucidate.

## Run locally (dev server)

From the repo root:

- PowerShell (Windows): `./scripts/dev-server.ps1`
- PowerShell custom port: `./scripts/dev-server.ps1 -Port 5501`
- Python (cross-platform): `python ./scripts/dev_server.py`
- Python custom port: `python ./scripts/dev_server.py --port 5501`

Then open `http://localhost:5500` (or your custom port).

## Pages

- Dashboard: `index.html`
- Plate designer (dedicated page): `designer.html`
- Rationale: `rationale.html`
- Bio: `bio.html`
- Roadmap: `roadmap.html`
- Cite: `cite.html`

## When to add Node tooling

You likely do **not** need Node tooling yet for this repo. Keep the current static-server workflow unless you need one or more of these:

- Automatic browser refresh (HMR/live reload) on save.
- Build/minify output for production bundles.
- Frontend linting/formatting pipelines managed with npm scripts.
- TypeScript, component frameworks, or multi-page build orchestration.

If those needs appear, add a minimal Vite setup intentionally. Until then, avoid extra complexity.

## Connect the contact form to Supabase

1. In your Supabase project, open SQL editor and run:
   - `scripts/contact_leads_schema.sql` for the contact table used by the landing page.
   - `scripts/illucidate_schema_v1.sql` if you also want the full experiment schema.
2. Edit `scripts/config.js` with your project values:
   - `supabaseUrl`: `https://<project-ref>.supabase.co`
   - `supabaseAnonKey`: your project's public anon key
   - `leadsTable`: defaults to `contact_leads`
3. Serve the site locally and submit the contact form.

### Security note

This app sends contact-form submissions directly from the browser using the public anon key.
If you need spam protection or stricter validation, place a server/edge function in front of the insert.
