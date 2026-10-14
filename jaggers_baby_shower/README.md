# Jagger’s Baby Shower | Production candidate (Option B)

Static GitHub Pages website, prepared for `homestead_hub/jaggers_baby_shower/`. This build preserves the approved V11 visual composition and uses relative paths for assets.

## RSVP integration

The RSVP area embeds the **existing live RSVP form** from `/homestead_hub/jagger_rsvp/` in an iframe. This intentionally reuses the existing form, Supabase table and validation, without duplicating database credentials or creating a new database. A direct-link fallback is provided if an iframe is blocked by browser or hosting policies. Existing form's internal return links may still navigate to Canva and should be updated separately after deployment, subject to approval.

This package does **not** independently verify Supabase RLS, the iframe embedding policy, or successful RSVP writes. Test with a clearly identified test RSVP before launch and remove it only through the approved admin workflow. Do not expose service-role keys.

## Deploy

Copy the contents of this folder to `homestead_hub/jaggers_baby_shower/` without changing unrelated directories. GitHub Pages should already serve the `main` branch root. Final expected URL: `https://f4jm9gtgyc-ui.github.io/homestead_hub/jaggers_baby_shower/`. No deployment has been performed.

## QA

Verify homepage photo-strip animation once, final four-photo frame, link hotspots, invitation artwork, registry, map, return navigation, iframe on Safari/Chrome, successful RSVP, duplicate prevention, and desktop/mobile sizing. The approved artwork contains text as images; accessibility remains limited and should be enhanced in a future iteration without changing visual presentation.
