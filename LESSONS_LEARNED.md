# Lessons Learned

Distilled anti-patterns from project history. **Append session findings before opening a PR** when the session uncovered a recurring anti-pattern or process gap — see `docs/agent/workflow.md` → *Living docs*.

---

## Database & schema

| Anti-pattern | Rule |
|--------------|------|
| Files in `supabase/migrations/` | ⛔ Forbidden. Only `supabase/reset.sql` + `src/types/database.ts` |
| Helpers after tables that use them | Order: extensions → enums → **functions** → tables → RLS → backfills |
| Duplicate `ADD COLUMN` for columns already in `CREATE TABLE` | Guards only for columns added after initial definition |
| Denormalised columns across related tables | Check `supabase/DB_REQUIREMENTS.md` first (3NF) |
| `has_permission(auth.uid(), …)` | ✅ `has_permission('can_manage_releases')` — one arg only |
| `CREATE TYPE IF NOT EXISTS` in Supabase SQL Editor | Use `DO $$ … IF NOT EXISTS (pg_type) …` blocks |

## Next.js & RSC

| Anti-pattern | Rule |
|--------------|------|
| DOM libraries in Server Components | `"use client"` leaf; pass props from RSC |
| `createServerSupabaseClient()` in `unstable_cache` | Cookie-free anon client only (see `AGENTS.md`) |
| Async routes without `loading.tsx` | Skeleton must match loaded layout (zero CLS) |
| Missing `metadata` / `generateMetadata` | Never `<title>` in JSX |

## CI & TypeScript

| Anti-pattern | Rule |
|--------------|------|
| PR without full check sequence | `lint` → `tsc` → `test` → `build` — all green in one run |
| Lockfile not updated after dep change | Run `npm install`; commit `package-lock.json` |
| `as any` / `@ts-ignore` / `eslint-disable` to silence CI | Fix root cause |

## Lenis & scroll

| Anti-pattern | Rule |
|--------------|------|
| `overflow-y-auto` in admin/portal without `data-lenis-prevent` | Lenis blocks wheel scroll otherwise |
| Second `LenisProvider` or CSS `scroll-behavior: smooth` | Single root provider only |
| `getComputedStyle` inside scroll handlers | Cache layout reads in refs |

## Images & media

| Anti-pattern | Rule |
|--------------|------|
| Bare `<img>` | `next/image`; wsrv URLs → `unoptimized` |
| Double-proxy wsrv.nl URLs | Proxy only raw origin URLs |
| Phosphor `Image` + `next/image` clash | `import { Image as ImageIcon }` |

## Security

| Anti-pattern | Rule |
|--------------|------|
| Unsanitised `dangerouslySetInnerHTML` | `sanitizeHtml()` / DOMPurify on client |
| URL checks via `includes()` | Parse hostname or `startsWith` on origin |
| PII in `app_logs` | UUIDs only; no emails/names |
| Vulnerable deps without audit | `npm audit` before adding packages |
| Browser `fetch()` to bronze CSV presigned R2 URLs | Same-origin `/api/admin/sos/import-batches/*` only |

## Accessibility & i18n

| Anti-pattern | Rule |
|--------------|------|
| Icon links without `aria-label` | WCAG AA is a pre-merge gate |
| Dialogs without `aria-labelledby` | + `useReducedMotion`, `aria-pressed` on toggles, 44px targets |
| Hardcoded English strings | `en.json` + `de.json`; RSC passes dict as props |
| `alert()` / `confirm()` | `sonner` toasts |

## State & UI

| Anti-pattern | Rule |
|--------------|------|
| Admin form state derived from parent list on render | Local `react-hook-form` state; sync on save |
| `documentElement.style` for theme preview | Declarative `<style>` tag + `useReducer` (`ColorThemeManager`) |
| Fixed `max-w-lg` modals | Viewport-relative breakpoints — see `docs/agent/frontend.md` |
| `setTimeout` for drag-vs-click | Pointer delta tracking or library-native events (Swiper) |

## CSP & performance

| Anti-pattern | Rule |
|--------------|------|
| New external domain without CSP update | SSOT: `src/lib/security/contentSecurityPolicy.ts` |
| Heavy libs in initial bundle | `React.lazy()` / `next/dynamic`; verify with `npm run analyze` |
| Bundle checks by chunk filename | Use `app-build-manifest.json` route paths |
| `URLSearchParams` for Spotify `include_groups` | Manual query string (commas must not encode) |

## Auth & RLS

| Anti-pattern | Rule |
|--------------|------|
| `get_my_role()` on `profiles` RLS | Direct `auth.uid() = id` on profiles table |
| Anon client for admin bypass ops | Service-role in route handlers / Server Actions |
| Column type change without dropping policies | `DROP POLICY IF EXISTS` before `ALTER COLUMN` |

## Documentation

| Anti-pattern | Rule |
|--------------|------|
| Feature shipped without doc update | End-of-session review: `README`, `DEPLOYMENT`, `ADMIN`, `INTEGRATION-SUMMARY`, `docs/agent/*`, `CHANGELOG`, `QA_CHECKLIST` |
| Living docs orphaned after doc debloat | Keep `CHANGELOG`, `LESSONS_LEARNED`, `QA_CHECKLIST` in `workflow.md` docs-review table and `AGENTS.md` |
| Size limits from memory | Derive from source constants (e.g. upload route `MAX_*_BYTES`) |
| Bloated duplicate prose across agent docs | Progressive disclosure: `AGENTS.md` index + topic files |

---

## Session additions

### 2026-06-25 — Settlements guided workflow + doc debloat

**Guided wizard must be controlled, not self-contained:** `AccountingGuidedWizard` needs `activeStep` / `onActiveStepChange` from `AccountingPanel`. A Review-step CTA that called `setViewMode('guided')` without setting step to `settle` left operators on the wrong screen. Scroll targets (`#accounting-guided-settle-panel`) need explicit step state.

**Inline billing belongs at every invoice entry point:** Gating only `InvoiceForm` left `FreeInvoiceGenerator` and quick-invoice buttons able to generate PDFs without complete `artist_billing_profiles`. Every portal invoice surface must call `isBillingProfileComplete()` or render `InlineBillingProfileStep` first.

**Integration summary as status matrix, not implementation dump:** A 300-line feature inventory duplicated `README.md` and `docs/agent/features.md` and a table of 60 rows all marked ✅ added no signal. Prefer area × status tables and entry-point links.

**Lessons doc: rule tables over commit archaeology:** Evidence commit lists help once; recurring rules belong in compact anti-pattern → rule tables. Update stale references when SSOT moves (CSP → `contentSecurityPolicy.ts`, modals → `frontend.md`).

### 2026-07-03 — Living docs dropped from agent workflow after debloat

**Debloat removed the triggers, not the files:** `LESSONS_LEARNED.md` pointed at `workflow.md`, but `workflow.md` never listed `CHANGELOG`, `LESSONS_LEARNED`, or `QA_CHECKLIST`. Agents followed the slim `AGENTS.md` review list and stopped updating living docs. Rule tables are SSOT for recurring anti-patterns; session additions and changelog/QA updates still belong in their respective files — wire all three back into `workflow.md` and `AGENTS.md`.

---

*Last updated: 2026-07-03*