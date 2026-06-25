# Homestead Hub PWA Scope Fix

Replace these files at the root of `homestead_hub/`:

- `service-worker.js`
- `manifest.json` (included unchanged for completeness)
- `index.html` (included unchanged for completeness)
- `styles.css` (included unchanged for completeness)
- `app.js` (included unchanged for completeness)
- `icons/` (included unchanged for completeness)

## What changed

The root Homestead Hub service worker now ignores:

- `/finance_hub/`
- `/solar_hub/`
- `/tiny_tenant_hub/`

This prevents the Homestead Hub home-screen PWA from interfering with the individual dashboard apps.

## After upload

1. Commit and push.
2. Open `https://f4jm9gtgyc-ui.github.io/homestead_hub/` in Safari/Chrome once.
3. Refresh the page.
4. Delete the old Homestead Hub home-screen icon.
5. Add Homestead Hub to the home screen again.
6. Open Homestead Hub from the home screen and tap Tiny Tenant.

If Tiny Tenant still shows sync errors, open Tiny Tenant directly once and refresh. Its own service worker may also need to update.
