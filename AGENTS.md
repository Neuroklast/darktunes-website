Developer & Agent Guidelines (AGENTS.md)
MANDATORY: All developers and AI agents working on this project MUST strictly adhere to the following guidelines. This ensures code quality, security, legal compliance (GDPR), perfect UI/UX, and maintainability.

Clean Code & Architecture (ISO/IEC 25010)
Single Responsibility Principle (SRP): No "God Objects". Files like App.tsx must not contain thousands of lines of code. Split functionality into small, focused, and reusable components.
Separation of Concerns: Keep UI components (React), state management (Hooks/Context), and business logic (API calls/Lib functions) separate.
Code Splitting & Lazy Loading: Use React.lazy() and Suspense for heavy components (e.g., 3D models, admin panels, complex galleries) to keep the initial JavaScript bundle small and performant.
Strict Typing: Avoid the use of any in TypeScript. All variables, function parameters, API responses, and test mocks MUST be strictly typed.
Dry Principle: Do not repeat code. Use reusable hooks and utility functions.

Test Driven Development (TDD): Define conditions through tests before implementing complex logic.
Avoid Anti-Patterns: Absolutely avoid anti-patterns like prop-drilling over more than two levels and massive monolithic files.
YAGNI (You Aren't Gonna Need It): Do not generate speculative code for hypothetical features. Keep the codebase lean.
KISS (Keep It Simple, Stupid): Prefer native HTML/JS solutions over the importation of heavy NPM packages.

Technology Stack & Styling
Core Infrastructure: Next.js (App Router), React, Supabase (PostgreSQL), Cloudflare R2, Vercel deployment, and Vite build system.
UI & Design: Exclusively use Tailwind CSS and ensure the CSS output is minified.
Motion & UX: Implement fluid page transitions and shared layout animations with Framer Motion, and utilize Lenis for smooth scrolling. Use Phosphor Icons for all vector graphics.

CI Color System (darkTunes Brand)
The following exact hex values MUST be used. They are mapped to CSS custom properties in src/index.css and must not be replaced with approximations:
  --primary / --accent / --ring: #493687  (violet – primary CTAs, active nav, focus rings)
  --secondary:                   #7e1e37  (pink – secondary buttons, hover effects, promo badges)
  --background:                  #101010  (near-black – global page background, immersive dark mode)
  --card / --muted / --popover:  #292929  (surface – cards, modals, dropdowns, player bar)
  --border / --input:            #383838  (subtle borders, input frames, disabled states)
  --foreground / text:           #ffffff  (primary text – maximum contrast on dark surfaces)

Smooth Scrolling (Lenis)
The LenisProvider (src/components/animations/LenisProvider.tsx) is the single global smooth-scroll implementation.
It is mounted once at the root level in src/main.tsx and wraps the entire React tree.
Do NOT add a second LenisProvider instance anywhere else in the tree.
Do NOT use CSS scroll-behavior: smooth as a replacement – Lenis overrides this at the JS layer.

Unit Testing & Quality Assurance
Unit Testing: Write unit tests for all new utilities, API routes, and complex hooks using Vitest.
Test runner: `npm test` (runs `vitest run`), watch mode: `npm run test:watch`.
Test setup file: src/test/setup.ts – imports @testing-library/jest-dom matchers.
Test files live alongside their source files: src/**/*.{test,spec}.{ts,tsx}.
Test Isolation: Tests must not rely on external network requests. Mock all external APIs (including iTunes, Bandsintown, Odesli, Spotify, and Discogs).
Supabase Mock Pattern: In DAL tests, create a mock builder where all chain methods (select, order, insert, update, delete, upsert, eq, single) return `this` via `vi.fn().mockReturnThis()`. The builder object has `then`, `catch`, `finally` bound to a `Promise.resolve({data, error})`. This makes the entire chain thenable — `await db.from('x').select().order()` resolves correctly.

Data Access Layer (DAL)
All database queries live in `src/lib/api/` — one file per table (artists.ts, releases.ts, news.ts, videos.ts, assets.ts, syncLogs.ts, concerts.ts).
Every DAL function receives `SupabaseClient<Database>` as its first argument. Never import the global `supabase` singleton inside a DAL file.
DAL functions throw `new Error(error.message)` when Supabase returns an error. For `.single()` queries, error code `PGRST116` (not found) returns `null` instead of throwing.
Row-to-domain mappers: Use `rowTo*` functions to convert snake_case DB rows to camelCase domain types. Nullables map to `undefined` (optional fields) or `''` (required string fields) using `?? undefined` / `?? ''`.
Hook Pattern: Hooks in `src/hooks/` wrap DAL functions. Each hook checks `isSupabaseConfigured` at load time — if false, immediately sets `isLoading = false` and returns empty data. This prevents Supabase calls when env vars are not set.
Vercel API Routes: Serverless functions live at `api/` (repo root, not `src/`). Both `api/upload.ts` and `api/sync-artist.ts` use `SUPABASE_SERVICE_ROLE_KEY` to verify Bearer tokens. `sync-artist.ts` also checks the caller's role (admin/editor) before running the sync pipeline.

Image Optimisation: All images shown on the public site MUST be routed through `getOptimizedImageUrl(url, width)` from `src/lib/imageUtils.ts` (wsrv.nl proxy → WebP output). Never embed raw external image URLs in `<img>` src attributes.

Rate Limiting: Server-side calls to external APIs (iTunes, Spotify, Songkick, Discogs) MUST use `withExponentialBackoff()` from `src/lib/rateLimiter.ts`. Throw `HttpError(status, message)` for HTTP errors so the retry logic can distinguish retryable (429, 5xx) from non-retryable (4xx) failures.

Sync Service Pattern: Complex multi-source sync logic lives in `src/lib/sync/` (not in API route handlers). Dependencies (db, fetch, uploadToR2) are injected via a `SyncDeps` interface, making the logic fully unit-testable without HTTP context.

Inversion of Control (IoC) & Component Contracts
Props Over State: UI components MUST receive all data and callbacks as props — they must not directly access global state, context, or external stores.
No Direct Context Reads: Components that render UI (sections, cards, widgets) must receive their data via props. Context access is only permitted in top-level wiring components (e.g., App.tsx, AdminPanel.tsx, use-app-state.ts).
Section Contracts: All page sections must extend SectionProps (or EditableSectionProps<T>) from src/lib/component-contracts.ts. The editMode, sectionLabels, and onLabelChange props are mandatory.
Admin Panel Contracts: All admin sub-forms must extend AdminPanelProps<T> from src/lib/component-contracts.ts. No sub-form should import or read AdminSettings directly from storage/context.
Dialog Contracts: All modals must extend DialogProps (with open / onClose). No dialog should manage its own visibility state internally.

Agent Workflow Requirements
These rules apply specifically to AI agent runs on this project:
Update AGENTS.md: AGENTS.md is the living specification of this project and serves as a dedicated, predictable place for context. If new conventions, patterns, or architectural decisions were introduced, add or update the relevant section in this file after every run.
Review & Update All Docs and Scripts: At the END of EVERY agent session, review each of the following files for accuracy and update any section that is stale or inconsistent with the actual codebase:
  - README.md (quick start, scripts table, env-var table, project structure)
  - DEPLOYMENT.md (env-var names must match .env.example and scripts/vercel-install.sh exactly)
  - INTEGRATION-SUMMARY.md (reflect the current implemented vs. pending state)
  - ADMIN.md (admin panel features and setup steps)
  - SECURITY.md (security practices relevant to the actual code)
  - scripts/vercel-install.sh (env-var list must match .env.example)
  - .env.example (must list every variable the app actually reads)
This review is MANDATORY, not optional, even when no documentation changes were part of the original task.
Update Documentation: If new public APIs, components, or utilities were added, update the relevant docs in the docs/ directory or inline JSDoc comments.
Minimal Changes Principle: Make the smallest possible change that fully addresses the requirement. Do not refactor unrelated code in the same PR. Do not add new dependencies unless absolutely necessary — check npm audit for any new package.

Database Schema Management
The SQL migration files and the TypeScript database types are the dual source of truth for the database structure. They MUST always be in sync.

MANDATORY RULE — Schema Change Checklist:
Every PR that adds, removes, or renames a column / table / enum MUST include ALL of the following:
  1. A new SQL migration file in supabase/migrations/ named YYYYMMDDHHMMSS_short_description.sql.
  2. Updated src/types/database.ts to reflect the new schema (Row, Insert, Update shapes).
  3. If applicable: updated application hooks (src/hooks/use*.ts) that query the affected table.

Never edit the initial migration (20240101000000_initial_schema.sql) directly — always add a new migration file.
Apply migrations to Supabase cloud: npm run db:push (requires Supabase CLI and supabase link).
Generate a diff between local and remote schema: npm run db:diff.
Migration naming: use UTC timestamp prefix, e.g. 20240601120000_add_artist_bandcamp_url.sql.

Vercel Deployment
Install script: scripts/vercel-install.sh runs npm ci and validates all required environment variables.
Required env vars are split into two groups:
  - Client-side (must have VITE_ prefix to be exposed to the browser):
      VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  - Server-side (never exposed to the browser; used only in Vercel Serverless Functions):
      SUPABASE_SERVICE_ROLE_KEY,
      CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
      CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME,
      CLOUDFLARE_R2_PUBLIC_URL
Configure all variables in Vercel Dashboard → Project → Settings → Environment Variables.
See DEPLOYMENT.md for full variable descriptions and setup instructions.
