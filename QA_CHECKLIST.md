# Pre-Release QA Checklist

## Functional Tests

- [ ] Validate all public routes load successfully (`/`, `/about`, `/artists`, `/releases`, `/news`, `/contact`, `/press`, `/offline`)
- [ ] Crawl internal links and confirm no broken links / 404 pages
- [ ] Validate dynamic routes for artist and release detail pages
- [ ] Validate newsletter submission flow and confirmation message
- [ ] Validate media and upload features from admin/portal areas

## Security

- [ ] Verify unauthenticated users are blocked or redirected from protected routes (`/admin/*`, `/portal/*`, `/press/dashboard/*`, `/promo-pool/*`)
- [ ] Validate protected API endpoints reject missing/invalid authentication
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is never exposed in client HTML
- [ ] Validate RLS is enabled for sensitive database tables
- [ ] Review CSP and security headers in production deployment
- [ ] Run vulnerability scan (`npm audit --production --audit-level=high`)

## Corporate Identity

- [ ] Validate only approved CI colors are hardcoded in components
- [ ] Validate primary/secondary/background colors in rendered UI
- [ ] Verify icon usage is consistent with brand guidelines
- [ ] Verify typography and font hierarchy are consistent

## Accessibility (WCAG 2.1 AA)

- [ ] Verify keyboard-only navigation for header and main journeys
- [ ] Verify visible focus state for interactive elements
- [ ] Verify mobile touch targets meet 44×44 minimum
- [ ] Verify reduced motion preference is respected
- [ ] Run automated accessibility checks and manual spot checks

## Responsive Design

- [ ] Validate mobile navigation behavior and menu access
- [ ] Validate key layouts on desktop/tablet/mobile breakpoints
- [ ] Verify touch interactions and scrolling remain functional
- [ ] Verify no horizontal overflow issues

## Performance

- [ ] Verify homepage LCP remains below budget threshold
- [ ] Verify shared root bundle remains under configured budget
- [ ] Run Lighthouse CI assertions
- [ ] Validate performance tests in CI (`npm run perf:test`)

## Database & Sync

- [ ] Validate schema parity with `supabase/reset.sql`
- [ ] Validate artist/release/news sync jobs and cron triggers
- [ ] Validate RLS and role permissions for new tables/features

## Documentation

- [ ] README reflects current setup and QA commands
- [ ] DEPLOYMENT guide is up to date
- [ ] AGENTS.md conventions remain aligned with implementation

## Test Execution

- [ ] Run unit tests (`npm run test`)
- [ ] Run E2E tests (`npm run test:e2e`)
- [ ] Run performance tests (`npm run perf:test`)
- [ ] Review visual regression outputs when relevant

## GDPR & Consent

- [ ] Cookie consent banner appears on first visit
- [ ] Spotify and YouTube iframes are blocked until consent is given
- [ ] Accepting consent loads embedded players
- [ ] Declining keeps embeds blocked indefinitely (until browser storage cleared)

## Internationalisation (i18n)

- [ ] Language switch EN↔DE in header works and persists via NEXT_LOCALE cookie
- [ ] All UI strings use dictionary keys (no hard-coded EN strings visible in DE mode)
- [ ] Locale-specific legal pages (/impressum, /datenschutz) reflect correct language

## PWA

- [ ] /manifest.webmanifest is accessible and valid
- [ ] Service worker registers without errors (DevTools → Application → Service Workers)
- [ ] Offline page /offline is served when network is unavailable
- [ ] PWA install prompt appears on Android/Chrome after 3 seconds (no errors in console)

## Newsletter DOI Flow

- [ ] Subscribe form submits → success message shown (no error)
- [ ] Pending row created in newsletter_subscribers table with status='pending'
- [ ] DOI email arrives within 2 minutes (check Resend dashboard)
- [ ] Clicking confirmation link flips status to 'subscribed'
- [ ] Re-submitting same email shows silent success (anti-enumeration)

## Artist Portal

- [ ] Artist user can log in at /portal
- [ ] PortalAccessGate shown for unlinked users (role=user)
- [ ] Profile edit saves bio, photo uploads to R2
- [ ] Feature-flagged modules hidden when flag is disabled

## Journalist Dashboard

- [ ] /press/login accessible, /press/dashboard/* redirects to login when unauthenticated
- [ ] Role=journalist can access dashboard, role=user cannot
- [ ] Promo track stream URL expires after 5 minutes

## Schema Parity

- [ ] Every column in supabase/reset.sql exists in src/types/database.ts
- [ ] Every table in database.ts has a corresponding CREATE TABLE in reset.sql

## Security Rules

- [ ] Open DevTools Network tab — confirm SUPABASE_SERVICE_ROLE_KEY is never in any response
- [ ] /admin redirects to /admin/login for unauthenticated requests
- [ ] /portal/* redirects to /portal/login for unauthenticated requests
- [ ] /promo-pool/* requires journalist or admin role

## Edge Function

- [ ] Supabase Edge Function 'newsletter-confirm' is deployed and active
- [ ] Edge Function appears in Supabase Dashboard → Edge Functions
