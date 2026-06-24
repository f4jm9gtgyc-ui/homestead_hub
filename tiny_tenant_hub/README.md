[README.md](https://github.com/user-attachments/files/29309770/README.md)
# Tiny Tenant

A responsive, mobile-first pregnancy dashboard with:

- Pregnancy Overview
- Baby Development
- Nursery & Baby Prep Checklist
- Budget Tracker
- Tiny House + Baby Footprint app icon
- Dark mode
- Local storage backup
- PWA support
- Supabase-ready schema using `pregnancy_*` tables

## Recommended URL

Use a folder like:

```text
/tiny_tenant
```

## Supabase setup

Since this is going inside your existing Finance Supabase project, run:

```text
supabase-schema.sql
```

This creates only pregnancy-specific tables:

- `pregnancy_profile`
- `pregnancy_nursery_checklist`
- `pregnancy_budget_expenses`
- `pregnancy_budget_settings`

It does not modify your finance tables.

## App setup

1. Upload these files to your dashboard folder, such as `/tiny_tenant`.
2. Open `index.html` locally or deploy to GitHub Pages, Netlify, Vercel, or your domain host.
3. In Supabase, open SQL Editor and run `supabase-schema.sql` inside the Finance project.
4. In `app.js`, replace:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
5. Add Supabase Auth before using cloud sync in production.

## Notes

The current starter app saves to localStorage immediately. Supabase schema and client placeholders are included so the database layer can be connected cleanly after authentication is configured.

[README.md](https://github.com/user-attachments/files/29310835/README.md)
# Tiny Tenant Update Files

Replace these files in:

`homestead_hub/tiny_tenant_hub/`

## Files to upload

- `index.html`
- `app.js`
- `manifest.json`
- `service-worker.js`
- `icons/icon-192.png`
- `icons/icon-512.png`

## Supabase

Run `tiny_tenant_supabase_update.sql` in the Finance Supabase project SQL Editor.

## What was fixed

- Fixed `Identifier 'supabase' has already been declared`
- Renamed the JavaScript client to `supabaseClient`
- Added complete Tiny Tenant dashboard logic
- Added localStorage fallback so the due date saves even if Supabase blocks a request
- Added real PNG icons so the manifest icon error is fixed
- Added Supabase table/RLS SQL for the pregnancy tables

