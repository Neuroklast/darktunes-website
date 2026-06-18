# LESSONS LEARNED

> Continuously updated document distilling mistakes, anti-patterns and quality insights
> found across the entire git history of this project (853+ commits as of 2026-06-17).
> **Every agent session MUST append new findings to this file before opening a PR.**
> See `AGENTS.md → "Agent Workflow Requirements"` for the mandatory update rule.

---

## Table of Contents

1. [Database & Schema](#1-database--schema)
2. [Next.js Architecture – Server vs. Client Components](#2-nextjs-architecture--server-vs-client-components)
3. [CI / Build / TypeScript Discipline](#3-ci--build--typescript-discipline)
4. [Scroll & Lenis](#4-scroll--lenis)
5. [Image Handling](#5-image-handling)
6. [Security](#6-security)
7. [Accessibility (WCAG)](#7-accessibility-wcag)
8. [i18n / Internationalisation](#8-i18n--internationalisation)
9. [State Management & Data Loss Prevention](#9-state-management--data-loss-prevention)
10. [Content Security Policy (CSP)](#10-content-security-policy-csp)
11. [Merge Conflicts & Lockfile Drift](#11-merge-conflicts--lockfile-drift)
12. [Modal & Dialog Quality](#12-modal--dialog-quality)
13. [Performance](#13-performance)
14. [Auth, Roles & RLS](#14-auth-roles--rls)
15. [Icon Libraries & Component Imports](#15-icon-libraries--component-imports)
16. [Race Conditions & Async Bugs](#16-race-conditions--async-bugs)
17. [Dead Code & Technical Debt](#17-dead-code--technical-debt)
18. [Documentation Hygiene](#18-documentation-hygiene)
19. [Session-by-Session Additions](#19-session-by-session-additions)

---

## 1. Database & Schema

### ❌ Creating migration files

**Problem:** On at least three occasions agents created files under `supabase/migrations/`
despite the explicit prohibition in `AGENTS.md`. Each time a follow-up commit was required
to delete the file and fold the change back into `reset.sql`.

*Evidence commits:*

- `fix: delete forbidden migration, fold OAuth into reset.sql` (2026-05-29)
- `fix: move pg_cron schedule from migration into reset.sql, delete migration` (2026-05-29)
- `fix: add 'artist' to user role enum in PATCH schema; delete migration` (2026-05-12)

**Lesson:** `supabase/migrations/` MUST NOT EXIST. Every schema change goes into
`supabase/reset.sql` as an idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` guard.
Check `git status` before committing — if a file under `supabase/migrations/` appears,
delete it immediately.

---

### ❌ Helper functions defined after the tables that reference them

**Problem:** `get_my_role()` and `has_permission()` were defined *after* the `TABLES`
section, causing Supabase to fail when creating RLS policies that call those helpers.

*Evidence commits:*

- `fix: move get_my_role() and has_permission() before TABLES section in reset.sql` (2026-06-13)

**Lesson:** The required definition order in `reset.sql` is:
`EXTENSIONS → ENUM TYPES → HELPER FUNCTIONS → TABLES → RLS POLICIES → DATA BACKFILLS`.
Never place a `SECURITY DEFINER` function below the first `CREATE TABLE` that depends on it.

---

### ❌ Duplicate column declarations

**Problem:** Columns declared inside the `CREATE TABLE` block were *also* added as
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` guards, creating duplicate declarations that
confuse readers and can break tooling.

*Evidence commits:*

- `fix(schema): complete reset.sql audit — add all missing columns to CREATE TABLE definitions` (2026-06-15)

**Lesson:** A column declared inside the `CREATE TABLE` block must NOT have a redundant
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` guard. Guards are only for columns that did not
exist in the original table definition and were added later.

---

### ❌ 3NF violations (denormalised columns duplicated across tables)

**Problem:** Fields like `artist_name`, `bio`, `genres`, and `founding_year` were
replicated in both `artists` and `artist_profiles`, violating 3NF and causing data
divergence.

*Evidence commits:*

- `DB 3NF refactoring: Track 1 + Track 2 — remove artist_name, consolidate social URLs` (2026-06-06)
- `fix: 3NF/GDPR/TS schema violations — remove bio/genres/founding_year from artist_profiles` (2026-06-12)

**Lesson:** Before adding a column to any table, verify it does not already exist in a
related table. Always consult `supabase/DB_REQUIREMENTS.md` first.

---

### ❌ Incorrect `has_permission()` call signature

**Problem:** The function was called as `has_permission(auth.uid(), 'permission_name')`
(two arguments) rather than the correct `has_permission('permission_name')` (one argument).

*Evidence commits:*

- `fix reset.sql permission calls and helper ordering` (2026-06-06)

**Lesson:** `public.has_permission(perm TEXT)` retrieves `auth.uid()` internally.
Always call with exactly one argument.

---

### ❌ `CREATE TYPE IF NOT EXISTS` not supported in Supabase SQL Editor

**Problem:** Standard PostgreSQL allows `CREATE TYPE IF NOT EXISTS`, but the Supabase
Dashboard SQL Editor rejects this syntax.

*Evidence commits:*

- `fix: replace CREATE TYPE IF NOT EXISTS with DO-blocks for Supabase Dashboard compatibility` (2026-06-01)
- `fix: create enums directly in reset.sql` (2026-05-29)

**Lesson:** Use `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '…')
THEN CREATE TYPE … ; END IF; END $$;` for idempotent enum creation in `reset.sql`.

---

## 2. Next.js Architecture – Server vs. Client Components

### ❌ Client-only libraries imported in Server Components

**Problem:** `@phosphor-icons/react` and similar packages that require a browser DOM were
imported directly inside Server Components, causing build-time or runtime errors.

*Evidence commits:*

- `fix: remove @phosphor-icons/react import from Server Component promo-log page` (2026-06-15)
- `fix: replace phosphor icon import with AdminPageShell in promo-log server component` (2026-06-15)

**Lesson:** If a component or library touches the DOM or uses `useState`/event handlers
it is a Client Component. Use `"use client"` leaf components; Server Components must
receive pre-rendered content or server-safe primitives as props.

---

### ❌ `cookies()` / `createServerSupabaseClient()` called inside `unstable_cache`

**Problem:** Next.js 15 forbids dynamic APIs such as `cookies()` inside `unstable_cache`
callbacks. Calls to `createServerSupabaseClient()` (which internally calls `cookies()`)
inside a cached callback silently return `null`, resulting in 404 pages.

*Evidence commits:*

- `fix: 404 routing bugs (cookies() in unstable_cache)` (2026-05-12)
- `fix: use createPublicSupabaseClient inside unstable_cache callbacks in app/page.tsx` (2026-05-11)

**Lesson:** Inside *every* `unstable_cache` callback, use the cookie-free anon client:

```ts
createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

Never call `createServerSupabaseClient()` inside a cached callback.

---

### ❌ Missing `loading.tsx` skeletons / CLS

**Problem:** Async data-fetching route segments without a `loading.tsx` sibling caused
layout shifts (CLS) because the page went from blank to fully populated instantly.

**Lesson:** Every route segment with async data fetching MUST have a `loading.tsx`
sibling whose skeleton uses the exact same grid/flex structure as the loaded content.

---

## 3. CI / Build / TypeScript Discipline

### ❌ Not running the full check sequence before committing

**Problem:** The most frequent single cause of follow-up "fix" commits was code merged
without passing all four checks in sequence. On 2026-05-12 alone, 20 fix commits were
pushed in a single day.

**Most common failures identified from commit messages:**

- Unused variables / imports (ESLint)
- Missing `data` / stale mock types in test fixtures
- `RouteHandler` type mismatch for Next.js 15
- `any` shortcuts introduced to silence TypeScript without fixing root cause

**Lesson:** Run ALL of the following in order before every commit or PR:

```bash
npm run lint       # zero errors, zero warnings
npx tsc --noEmit   # zero errors
npm test           # all tests green
npm run build      # successful production build
```

Do not open a PR until all four commands exit with code 0 in a single clean run.

---

### ❌ Lockfile drift causing `npm ci` failures in CI

**Problem:** `package-lock.json` became out of sync with `package.json` after manual
dependency edits, breaking the `npm ci` step in GitHub Actions.

*Evidence commits:*

- `fix: sync package-lock.json to fix CI npm ci failure` (2026-05-29)
- `fix: resolve CI failure from lockfile drift and duplicated modules` (2026-06-15)

**Lesson:** Always run `npm install` (not just editing `package.json`) so `package-lock.json`
is regenerated. Commit the updated lockfile alongside any dependency change.

---

### ❌ Suppression shortcuts (`as any`, `@ts-ignore`, `// eslint-disable`)

**Problem:** Several sessions introduced type-cast shortcuts purely to silence CI errors
rather than fixing the root cause, creating hidden runtime risks.

**Lesson:** `as any`, `@ts-ignore`, and `// eslint-disable` shortcuts added solely to
silence failing checks are FORBIDDEN. Always fix the root cause.

---

## 4. Scroll & Lenis

### ❌ Missing `data-lenis-prevent` on overflow containers in admin layouts

**Problem:** Lenis runs in root mode and intercepts ALL wheel/touch events at the
document level. Any `overflow-y-auto` element inside a layout that sets `overflow-hidden`
on the root container (like `AdminClientLayout`) silently blocked mouse-wheel scrolling
because Lenis grabbed the event and tried to scroll the non-scrollable window.

*Evidence commits:*

- `fix: resolve all scroll bugs (#1–#6) — Lenis/Hero conflict, getComputedStyle reflow` (2026-06-08)
- `fix: improve Lenis scroll performance — 4 targeted fixes` (2026-06-12)
- `fix: suppress visual effects & fix Lenis scroll block in admin` (2026-06-10)
- `feat: add data-lenis-prevent to carousels` (2026-06-12)

**Lesson:** Every `overflow-y-auto` / `overflow-auto` element inside admin/portal/press
layouts MUST carry the `data-lenis-prevent` HTML attribute.
Do NOT use `CSS scroll-behavior: smooth` as a replacement for Lenis.
Do NOT instantiate a second `LenisProvider` anywhere in the tree.

---

### ❌ `getComputedStyle` reflow inside scroll handlers

**Problem:** Calling `getComputedStyle()` or reading layout properties inside a
scroll-tick callback caused forced synchronous reflows, degrading scroll performance.

**Lesson:** Read layout/style properties outside the scroll callback (cache them in a
ref), not inside it.

---

## 5. Image Handling

### ❌ Using bare `<img>` tags instead of `next/image`

**Problem:** Raw `<img>` tags appeared repeatedly across the codebase, each triggering the
`@next/next/no-img-element` ESLint error and degrading LCP scores.

*Evidence commits:*

- `fix: admin data loss, img→Image` (2026-05-29)
- `fix: replace raw img with next/image in ReleasePreviewModal` (2026-06-03)
- `AB5f788: Fix no-img-element lint warnings` (2026-05-29)

**Lesson:** ALWAYS use `<Image />` from `next/image`. For wsrv.nl-proxied images, add
`unoptimized`. For fill-mode images inside `position:relative` containers, use the
`fill` prop.

---

### ❌ Double-proxying through wsrv.nl

**Problem:** Images already stored as wsrv.nl URLs in the database were being passed
through `getOptimizedImageUrl()` a second time, creating double-encoded URLs that broke
image loading.

*Evidence commits:*

- `fix: resolve video visibility, artist slug fallback, favicon, contact order and coverflow UX` (2026-05-14)

**Lesson:** `getOptimizedImageUrl()` / `getSquareThumbnail()` must only be called on
raw origin URLs (R2, iTunes CDN, etc.), never on URLs already containing `wsrv.nl`.

---

## 6. Security

### ❌ Vulnerable dependency left in place (SheetJS CE / xlsx)

**Problem:** The `xlsx` (SheetJS Community Edition) package contained known security
vulnerabilities and was only replaced with `exceljs` after a dedicated audit.

*Evidence commits:*

- `fix: replace vulnerable xlsx (SheetJS CE) with exceljs` (2026-06-06)

**Lesson:** Before adding ANY npm package, run `runtime-tools-gh-advisory-database`
(the security advisory check tool). Replace vulnerable packages proactively.

---

### ❌ XSS via unsanitised `dangerouslySetInnerHTML`

**Problem:** Rich-text HTML from the database was rendered with `dangerouslySetInnerHTML`
without sanitisation, enabling potential XSS.

*Evidence commits:*

- `fix: XSS SSR sanitization, GDPR PII logs, news data integrity, slug consistency` (2026-06-15)
- CodeQL alerts: `js/incomplete-multi-character-sanitization`, `js/incomplete-url-substring-sanitization`

**Lesson:** ALL `dangerouslySetInnerHTML` usage MUST go through `sanitizeHtml()` from
`src/lib/sanitizeHtml.ts` (which uses DOMPurify on the client and regex sanitisation on
the server). This is non-negotiable.

---

### ❌ CodeQL: incomplete URL sanitisation

**Problem:** URL checks using `includes()` or `indexOf()` are insufficient — a URL like
`https://evil.com/trusted.example.com` passes naïve substring checks.

*Evidence commits:*

- `fix: precise URL startsWith checks in ThemeStyleInjector tests` (2026-06-07)

**Lesson:** Use `startsWith('https://trusted.example.com')` or parse the URL and check
`hostname` for all security-sensitive URL validation. Always run `codeql_checker` before
finalising PRs.

---

### ❌ GDPR: PII written to application logs

**Problem:** User email addresses and other PII were being logged to `app_logs`, violating
GDPR requirements.

*Evidence commits:*

- `fix: XSS SSR sanitization, GDPR PII logs, news data integrity, slug consistency` (2026-06-15)

**Lesson:** Never log PII (email, name, IP combined with identity) to `app_logs` or
`console`. Log only anonymised identifiers (UUIDs, redacted strings).

---

## 7. Accessibility (WCAG)

### ❌ Repeated WCAG 2.1 violations across multiple sessions

**Problem:** Icon-only links without `aria-label`, missing `DialogTitle` on modals,
`aria-pressed` absent on toggle buttons, and missing `useReducedMotion` on animated
components were introduced in feature commits and caught only in later fix commits.

*Evidence commits:*

- `fix: add DialogTitle to ReleasePreviewModal, ArtistModal, VideoModal for a11y` (2026-05-29)
- `fix: code-contract violations and WCAG 2.1 AA/AAA accessibility compliance` (2026-05-11)
- `fix: WCAG compliance, impressum SSOT, releases clickability & scroll` (2026-05-29)
- `fix: address all AGENTS.md violations (nav, reduced-motion, WCAG focus)` (2026-05-29)
- `fix(a11y): add useReducedMotion to UniversalFileUploadZone animations` (2026-06-06)

**Lesson:** Treat every WCAG 2.1 AA requirement as a pre-merge gate, not an afterthought:

- Every icon-only interactive element → `aria-label`
- Every `<Dialog>` → `aria-labelledby` pointing to `DialogTitle`
- Every animated component → `useReducedMotion` check with `duration: 0` fallback
- Every toggle button → `aria-pressed`
- Minimum touch target: `min-w-[44px] min-h-[44px]`

---

## 8. i18n / Internationalisation

### ❌ Hardcoded strings bypassing the dictionary system

**Problem:** UI strings were added directly in components as hardcoded English text instead
of going through the `getDictionary()` / prop-injection chain.

*Evidence commits:*

- `fix: double arrow, i18n strings, ArtistModal UI, Spotify URL parser` (2026-05-12)
- `fix: 7 bugs - RLS recursion, i18n labels, button hover, logo squash` (2026-05-11)
- `feat: canonical TiptapEditor, bilingual privacy policy, fix all i18n violations` (2026-06-04)

**Lesson:**

1. Add new user-facing strings to BOTH `src/i18n/dictionaries/en.json` AND `de.json`.
2. Server Components call `getDictionary(locale)` and pass sub-objects as props.
3. Client Components MUST NOT call `getDictionary()` themselves.
4. Never use `alert()`, `window.confirm()`, or hardcoded English strings in UI code.

---

## 9. State Management & Data Loss Prevention

### ❌ Admin form data loss on state update

**Problem:** Admin forms lost unsaved user input when a related list re-rendered because
internal component state was not properly separated from the editing state.

*Evidence commits:*

- `fix: admin data loss, img→Image, ESLint flatConfig` (2026-05-29)

**Lesson:** Editing state in admin forms must be local to the form component (not derived
from parent list state on each render). Use a controlled form pattern with
`react-hook-form` and only sync to parent on explicit save.

---

### ❌ Identical commits for the same bug fix (AccreditationManager)

**Problem:** The AccreditationManager state-loss bug was "fixed" with five identical
commits (`Fix AccreditationManager UI and state loss bug`) pushed in sequence on
2026-06-14 because each previous commit failed silently or was incomplete.

**Lesson:** Before committing a fix, run the full check suite to confirm the fix actually
resolves the issue. Do not push speculatively hoping it works.

---

### ❌ `ColorThemeManager` imperative DOM mutations causing hydration mismatches

**Problem:** The color theme live-preview was implemented with imperative
`document.documentElement.style.setProperty` calls. This caused React hydration
mismatches because server-rendered HTML used different style values than the
client-patched DOM.

*Evidence commits:*

- `refactor(ColorThemeManager): useReducer + declarative style-tag live preview` (2026-06-10)

**Lesson:** Live previews must use a `<style dangerouslySetInnerHTML>` tag managed
declaratively by React, not imperative DOM mutations. Keep all state in a single
`useReducer` — no per-field `useState` hooks.

---

## 10. Content Security Policy (CSP)

### ❌ New domains added without updating `next.config.ts` CSP headers

**Problem:** Every time a new external resource was integrated (wsrv.nl, R2 CDN, Google
Fonts, Bandcamp, darkmerch.com iframe) the CSP header needed a matching update, and
this was consistently forgotten.

*Evidence commits:*

- `fix(csp): add wsrv.nl to connect-src to allow Service Worker fetch` (2026-06-05)
- `fix: admin scroll and CSP for Google Fonts` (2026-06-08)
- `fix: hide navbar on all press pages, add Bandcamp CSP` (2026-06-04)
- `fix: CSP fonts SW error, admin users 500, DB 3NF cleanup` (2026-06-10)
- `feat(newsletter): restore darkmerch iframe + allow frame-src in CSP` (2026-06-15)

**Lesson:** Any time you add an external URL (image CDN, font, iframe, API), immediately
update the CSP `Content-Security-Policy` header in `next.config.ts`. Treat CSP as part
of the feature, not as a post-merge fix.

---

## 11. Merge Conflicts & Lockfile Drift

### ❌ Long-lived branches accumulating conflicts

**Problem:** Branches running more than a few days behind `main` regularly produced merge
conflicts in `app/admin/layout.tsx`, `package-lock.json`, `reset.sql`, and
`src/types/database.ts` — the most frequently changed files.

*Evidence:* 15+ "resolve merge conflicts" commits throughout the history.

**Lesson:**

- Rebase or merge `main` into your branch at least daily.
- `package-lock.json` conflicts: always regenerate via `npm install` on `main`-merged code.
- `reset.sql` conflicts: resolve carefully — the schema is the single source of truth.

---

## 12. Modal & Dialog Quality

### ❌ Fixed-width modals without responsive breakpoints

**Problem:** Modals hardcoded a single `max-w-*` class without responsive context,
causing them to overflow on mobile screens.

*Evidence commits:*

- `fix: Modal & Dialog Quality Standards violations across all modal/dialog components` (2026-06-03)

**Lesson:** Follow the 7-principle Modal & Dialog Quality Standards from `AGENTS.md`:

1. Viewport-relative sizing with breakpoints: `max-w-[calc(100%-2rem)] sm:max-w-lg ...`
2. Body: `overflow-y-auto max-h-[70vh] p-6`
3. Spacing on the 8 px grid only (`p-2`, `p-4`, `p-6`, `p-8`)
4. Z-index: `z-50` (never override unless documented)
5. Backdrop: `bg-black/80` with `pointer-events-auto` and `onClick={onClose}`
6. Enter/exit animation using the `MODAL_SPRING` preset with `useReducedMotion`
7. Three dismiss paths: close button + ESC key + backdrop click

---

## 13. Performance

### ❌ Heavy libraries included in the initial bundle

**Problem:** `recharts`, `three`, and `d3` were included in the initial JS bundle,
inflating first-load size significantly.

*Evidence commits:*

- `perf(bundle): dynamically import recharts and remove unused three, d3` (2026-06-14)

**Lesson:** Heavy libraries (charts, 3D, data visualisation) MUST use `React.lazy()` /
`next/dynamic({ ssr: false })`. Verify with `npm run analyze` after adding any new
significant dependency.

---

### ❌ Bundle budget script using chunk-name patterns (always returns 0 KB)

**Problem:** A bundle-size check searched for `"framer-motion"` in chunk filenames.
Next.js uses hash-based chunk names, so these checks always returned 0 KB and gave
false confidence.

*Evidence commits:*

- `fix: resolve all CI failures (llms.txt empty-string, bundle budget, SOCIAL_ICON_MAP extraction)` (2026-06-06)

**Lesson:** Bundle budget checks MUST measure file sizes from `app-build-manifest.json`
using URL segment paths (e.g., `/page`, `/artists/[slug]/page`). Never rely on
chunk filename patterns.

---

### ❌ URLSearchParams encodes commas as `%2C` — Spotify API rejects this

**Problem:** Using `new URLSearchParams({ include_groups: 'album,single' })` encoded the
comma as `%2C`, which Spotify's API rejected with HTTP 400.

*Evidence commits:*

- `fix(spotifyApi): construct URL query string manually to avoid URLSearchParams comma encoding` (2026-06-14)

**Lesson:** Build Spotify API URLs as manual template literals when the query includes
comma-separated values. Do not use `URLSearchParams` for parameters that must preserve
literal commas.

---

## 14. Auth, Roles & RLS

### ❌ RLS recursion / infinite loops

**Problem:** RLS policies that called `get_my_role()` were applied to the `profiles`
table itself, creating circular calls that caused infinite recursion.

*Evidence commits:*

- `fix: 7 bugs - RLS recursion, i18n labels, button hover, logo squash` (2026-05-11)

**Lesson:** RLS policies on the `profiles` (or `users`) table must use
`auth.uid() = id` directly, never `get_my_role()` which reads from `profiles`. Use
`SECURITY DEFINER` helper functions carefully to avoid circular reads.

---

### ❌ Service-role client not used for operations that bypass RLS

**Problem:** Some admin operations used the anon client, which is subject to RLS
restrictions. This caused silent permission failures.

*Evidence commits:*

- `fix: service-role client bypasses RLS + add admin UPDATE policy on profiles` (2026-05-29)

**Lesson:** Operations requiring full table access (admin mutations, server-side sync,
SOS statement upload) MUST use the service-role client. Never use the anon or user
client for such operations in Route Handlers.

---

### ❌ Role column altered without dropping dependent policies first

**Problem:** Changing the `role` column type from `TEXT` to the `user_role` enum failed
because existing RLS policies referenced the old column type.

*Evidence commits:*

- `fix: drop all policies on affected tables before role type migration` (2026-05-28)
- `fix: drop stale profiles_role_check constraint and migrate role column to enum` (2026-05-12)

**Lesson:** When altering a column type in `reset.sql`, always `DROP POLICY` / drop
constraints on the affected table before the `ALTER COLUMN`, then recreate them. Use
`DROP POLICY IF EXISTS` to make the script idempotent.

---

## 15. Icon Libraries & Component Imports

### ❌ Naming conflict between `next/image` and `@phosphor-icons/react` `Image` export

**Problem:** `@phosphor-icons/react` exports an icon named `Image` which shadows
`import Image from 'next/image'` when both are imported in the same file.

**Lesson:** When importing from `@phosphor-icons/react` alongside `next/image`, alias
the icon: `import { Image as ImageIcon } from '@phosphor-icons/react'`.

---

### ❌ Non-existent icon names used (e.g., `Vinyl` instead of `VinylRecord`)

**Problem:** Icon names changed between Phosphor versions without a corresponding code
update, causing runtime errors.

*Evidence commits:*

- `fix: replace Vinyl with VinylRecord from @phosphor-icons/react` (2026-05-29)

**Lesson:** Verify icon names against the installed version of `@phosphor-icons/react`
before using. Do not assume icon name from memory.

---

## 16. Race Conditions & Async Bugs

### ❌ `setTimeout` used to defer drag-detection in carousel

**Problem:** A `setTimeout` was used to detect whether a pointer event was a drag vs.
a click in `ReleasesCarousel`. This is inherently fragile — timing-dependent logic
breaks on slow devices.

*Evidence commits:*

- `fix: remove setTimeout race condition in ReleasesCarousel drag detection` (2026-06-04)

**Lesson:** Use pointer-event delta tracking (`pointerdown` → `pointermove` distance)
to distinguish drag from click, not time-based heuristics.

---

### ❌ Portal login race condition

**Problem:** The portal login page had a race condition where the auth state check
completed before the router was ready, causing intermittent redirect failures.

*Evidence commits:*

- `fix: mobile admin nav, portal login race, sign-out redirect, artist linking` (2026-06-06)

**Lesson:** Auth redirects must wait for the Supabase session to fully resolve before
triggering `router.push()`. Use `useEffect` with an explicit `loading` guard.

---

## 17. Dead Code & Technical Debt

### ❌ Accumulation of dead branches / unused state / unreachable code

**Problem:** Several components grew dead code branches (unused props, unused state
variables, unreachable conditions) that were only cleaned up in dedicated technical-debt
sessions.

*Evidence commits:*

- `fix: technical debt cleanup — config, lenis, test, slugify, alert/confirm, icons, rate limiting` (2026-06-15)
- `fix: remove dead SSR branch in htmlToText, always use DOM-based extraction` (2026-06-06)

**Lesson:** Apply the YAGNI and KISS principles during feature development. Remove dead
code in the same PR that adds the feature, not in a later cleanup. Unused variables /
imports must not be committed (they fail ESLint immediately).

---

### ❌ Using `alert()` / `window.confirm()` for user feedback

**Problem:** Native browser `alert()` and `confirm()` dialogs appeared in admin and
portal code and had to be replaced with toast notifications.

**Lesson:** NEVER use `alert()`, `window.confirm()`, or `console.error()` for user-facing
feedback. Use `toast.success()` / `toast.error()` from `sonner` exclusively.

---

## 18. Documentation Hygiene

### ❌ AGENTS.md, README, DEPLOYMENT.md, ADMIN.md falling out of sync

**Problem:** Architecture decisions, new API routes, new env variables, and new
conventions were implemented without updating the corresponding documentation files.

*Evidence commits:*

- `docs: fill all documentation gaps across AGENTS.md, DEPLOYMENT.md, SECURITY.md, QA_CHECKLIST.md, ADMIN.md` (2026-06-05)

**Lesson:** The AGENTS.md agent workflow rules mandate reviewing and updating:

- `README.md` (quick start, scripts, env-var table, project structure)
- `DEPLOYMENT.md` (env-var names must match `.env.example`)
- `INTEGRATION-SUMMARY.md` (implemented vs. pending state)
- `ADMIN.md` (admin panel features and setup)
- `SECURITY.md` (security practices)
- `scripts/vercel-install.sh`
- `.env.example`

This review is MANDATORY at the end of EVERY agent session.

---

## 19. Session-by-Session Additions

> Agents: append your session's new findings here with a date prefix.

### 2026-06-17 — Initial population

- All findings above were derived from a full analysis of 853 commits from
  2026-05-07 to 2026-06-16.
- The top recurring failure categories by frequency:
  1. CI failures (lint / TypeScript / build): ~120 fix commits
  2. Schema/migration violations: ~15 fix commits
  3. Lenis scroll bugs: ~10 fix commits
  4. CSP header gaps: ~8 fix commits
  5. `img` → `next/image` regressions: ~6 fix commits
  6. WCAG accessibility violations: ~12 fix commits
  7. Merge conflicts / lockfile drift: ~15 commits

### 2026-06-17 — ESLint violations sweep + full documentation update

**ESLint `argsIgnorePattern` was missing from the base config:**
Next.js's default ESLint config does NOT inherit `_`-prefixed parameter ignoring. The `argsIgnorePattern: '^_'` rule must be explicitly added as an override in `eslint.config.js`. Before this fix, all `_`-prefixed function parameters (deprecated stubs, unused destructured props, unused catch bindings) produced warnings. Adding the rule also caused previously manual `// eslint-disable-next-line @typescript-eslint/no-unused-vars` directives to become stale — ESLint itself emits "Unused eslint-disable directive" warnings for them. Always remove stale directives after adding a matching `*IgnorePattern` rule.

**Dead state in `ArtistsManager.tsx`:**
`editingArtist` / `setEditingArtist` was vestigial from before editing moved to `/admin/artists/[id]/edit`. The setter was declared but never called, so the state was always `null`. Removing it required deleting `artistToFormData()` (a function that was only ever referenced in the now-removed conditional expression), hardcoding `formValue = EMPTY_FORM`, and hardcoding the dialog title "New Artist". Pattern: when a state setter appears in a component but is never called, the feature that relied on it has moved and the state should be removed entirely.

**Intentionally unused props should use `_` prefix in destructuring, not in the interface:**
`DocumentVault.tsx` receives `artistId` from its parent (the API derives it from the session cookie, not the prop). The fix was to rename to `_artistId` in the destructuring only — not in the prop interface or the parent call site. This documents the intent without losing the type contract.

**Documentation hygiene: AGENTS.md gap vs. actual codebase:**
After this maintenance session, AGENTS.md was found to be missing several major features: Document Vault (`artist_documents`), Video Submission portal, Accounting admin tab, System admin tab (Maintenance), and the Supabase Read Replica client. These were undocumented because they were implemented in separate feature sessions without back-filling the living spec. Rule: every feature session MUST update AGENTS.md before the PR is created (already in AGENTS.md "Agent Workflow Requirements" — but was not being enforced).

**Upload size discrepancy in SECURITY.md:**
SECURITY.md listed `/api/portal/upload-release-cover` as 10 MB and `/api/portal/upload-asset` as 50 MB. The actual route constants were `MAX_RELEASE_COVER_SIZE_BYTES = 5 * 1024 * 1024` (5 MB) and `MAX_ASSET_SIZE_BYTES = 20 * 1024 * 1024` (20 MB). Always derive size limits from source code constants, not from memory.

---

### Last updated: 2026-06-17 | Session count: 2 | Total commits analysed: 853+
