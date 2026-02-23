# illucidate-landing

Static landing page + interactive dashboard for Illucidate.

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


## Plate Designer flow

- Main dashboard: `index.html`
- Dedicated layout workspace: `designer.html`
- The designer saves the current layout into browser `localStorage`, supports JSON download, and provides a quick "Use on main page" handoff.

This architecture works well on Azure Static Web Apps because both pages are static assets and require no server-side runtime for routing.
