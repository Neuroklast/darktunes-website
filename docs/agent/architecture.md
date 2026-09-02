# Architecture & Code Conventions

## Core principles

- No god-object files — split UI, hooks, and DAL into focused modules
- Strict TypeScript — no `any` in production code or test mocks
- `React.lazy()` + `Suspense` for heavy UI (3D, admin panels, galleries)
- Reuse hooks/utilities; prop-drill at most two levels
- Prefer native HTML/JS over heavy NPM packages when practical
- No speculative features (YAGNI)

## Artist navigation

Roster cards, tiles, and list items **must** link to `/artists/[slug]` via Next.js `<Link>`. Modals for artist detail are forbidden. SSOT: `app/artists/[slug]/page.tsx`.

## Inversion of control

- UI components receive data and callbacks as props — no direct global state reads
- Page sections extend `SectionProps` / `EditableSectionProps<T>` from `src/lib/component-contracts.ts`
- Admin sub-forms extend `AdminPanelProps<T>` — no direct `AdminSettings` storage reads
- Dialogs extend `DialogProps` (`open` / `onClose`)

## Domain layer (`src/domain/`)

- Repository interfaces in `src/domain/repositories/` — implementations in `src/lib/api/`
- `eventBus` in `src/domain/events/eventBus.ts` — typed pub/sub (`artist.synced`, `release.synced`, etc.)

## Web workers

SOS CSV processing uses `src/workers/sos-csv-processor.worker.ts` (spawned from `useSosCSVProcessor`). Instantiate with `new Worker(new URL(…, import.meta.url))`, terminate on unmount.

## Error handling

All Route Handlers use `withErrorHandler` from `src/lib/errors.ts`. Throw `ApiError` instead of manual `NextResponse.json({ error })`. Boundaries: `app/error.tsx`, `app/global-error.tsx`.

## Server vs client components

Default to RSC. Add `"use client"` only for event handlers, browser APIs, hooks, Framer Motion, `useLenis()`, or Supabase Realtime. Pattern: RSC parent fetches → client leaf animates/interacts.

## CQRS

| Context | Pattern |
|---------|---------|
| Public reads | RSC + `unstable_cache` |
| Portal writes | Route Handlers under `app/api/portal/**` — `withPortalMembershipWrite` + `portalMemberWrite` (Bearer preferred; cookie dual-auth fallback) |
| Admin writes | Route Handlers under `app/api/admin/**` — `requireAdminFromRequest` / `requireAdminWithServiceClient` (Bearer or cookie) |
| Cron / webhooks | Route Handlers |
| SOS statement upload | Server Action `uploadStatement.ts` (portal/admin PDF path) |

Admin bronze CSV: never browser presigned R2 — use `/api/admin/sos/import-batches/*` (see `backend.md`).

## Metadata & loading

- Every `page.tsx` exports `metadata` or `generateMetadata()` — never `<title>` in JSX
- Async route segments need `loading.tsx` with skeleton parity (`src/components/skeletons/`)
- `generateStaticParams()` on `artists/[slug]`, `releases/[id]`, `news/[slug]`; `dynamicParams = true`; `revalidate = 60`

## Naming & structure

| Kind | Convention |
|------|------------|
| Components | `PascalCase.tsx` |
| Hooks | `useCamelCase.ts` |
| DAL | `camelCase.ts`, `verbNoun` functions |
| Tests | co-located `*.test.ts` |

`@/` → `src/`. Files under `app/` use relative imports.

## shadcn/ui

Do not edit `src/components/ui/` directly. Extend via wrappers in `src/components/`. Add primitives: `npx shadcn@latest add [name]`.

## Package manager

npm only. CI uses `npm ci`. No yarn/pnpm lock files.

## State management

No global state library. Server state → RSC/ISR. Shared UI → `Providers.tsx` context. Forms → `react-hook-form` + Zod (admin/portal).

## HTML sanitization

`dangerouslySetInnerHTML` requires DOMPurify in client components. Applies to `label_messages.body_html`, `artist_replies.body_html`, CMS rich text.

## i18n message splitting

Messages are split into per-route bundles in `src/i18n/loadMessages.ts`.  `request.ts` calls `resolveBundle(pathname)` to load only the namespaces the current route tree needs.

| Bundle prefix | Namespaces loaded |
|---|---|
| `/portal` | `portal`, `portalHelp`, `errors`, `pwa` |
| `/admin` | `admin`, `adminSubmissions`, `errors`, `pwa` |
| `/press` | `press`, `pressLanding`, `pressLogin`, `apply`, `pressContact`, `pressDashboard`, `pressReleases`, `pressKit`, `pressProfile`, `promoPool`, `errors`, `pwa` |
| `/promo-pool` | `promoPool`, `navigation`, `errors`, `pwa` |
| `*` (public) | `navigation`, `hero`, `artists`, `releases`, `news`, `videos`, `concerts`, `spotify`, `footer`, `newsletter`, `consent`, `releaseDetail`, `artistDetail`, `pages`, `newsPage`, `about`, `datenschutz`, `impressum`, `contact`, `errors`, `pwa` |

**Rule:** When adding a new namespace file, add it to `NAMESPACES` in `loadMessages.ts` **and** to each bundle that contains routes using that namespace.

## Cross-references

- ISR tags, R2 keys, schema rules → [data-and-schema.md](data-and-schema.md)
- Tailwind, a11y, modals, Lenis → [frontend.md](frontend.md)
- Admin auth, sync, cron → [backend.md](backend.md)
