# Public portfolio variants

The public portfolio has one canonical URL: `/`. The CMS draft setting `portfolio_settings.active_variant` selects Main or Simple for the next publication. Visitors cannot select a variant through a query parameter. `/simple` redirects to `/`, and there is no public `/main` route.

Both presentations receive the same portfolio data through `PortfolioPresentation`. The public `/` reads the latest published snapshot through `get_published_site()`. The admin-only `/authpreview` reads the current complete draft through `get_draft_site()`, including profile, projects, social links, blog posts, and appearance. Changing the draft variant or other CMS content does not change `/` until **Publish changes** succeeds.

The CMS header opens `/authpreview` in a new tab. The route verifies the one-hour CMS session, valid Supabase user, and existing admin allowlist before loading draft data. Failed checks redirect to `/admin`. Preview has no bearer token, is marked noindex/nofollow, and receives private no-store cache headers. Old `/admin/preview` URLs redirect to `/authpreview` after the admin route guard.

`supabase/migrations/20261008000100_portfolio_settings.sql` creates the singleton Main-default variant setting and admin-only update policy. Two later publication migrations prepare atomic published snapshots and then restrict direct draft reads. None was applied by this repository change. Review the order and checks in [site-publication-rollout.md](site-publication-rollout.md) before activating the feature.
