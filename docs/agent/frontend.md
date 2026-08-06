# Frontend, UI & Accessibility

Stack: Next.js 15 App Router, React 19, Tailwind v4 (PostCSS), Framer Motion, Lenis, Phosphor Icons.

## CI colors (exact hex)

| Token | Hex | Use |
|-------|-----|-----|
| primary / accent / ring | `#493687` | CTAs, active nav, focus |
| secondary | `#7e1e37` | Secondary buttons, promo |
| background | `#101010` | Page background |
| card / muted / popover | `#292929` | Surfaces |
| border / input | `#383838` | Borders, inputs |
| foreground | `#ffffff` | Primary text |

Defined in `app/globals.css` `@theme {}`. `tailwind.config.js` is IDE-only — runtime tokens live in CSS only.

## Lenis smooth scroll

Single `LenisProvider` in `Providers.tsx`. No second instance; no CSS `scroll-behavior: smooth`. Import `useLenis` from `LenisProvider.tsx`.

**Dashboard routes:** `LenisProvider` does **not mount** Lenis on `/admin/*`, `/portal/*`, or `/editor` (`src/lib/scroll/dashboardRoutes.ts`) so wheel events reach native scroll inside dashboard shells. Public pages keep Lenis active.

**Dashboard scroll shell:** Admin and portal layouts use `ScrollableAppShell` (`src/components/layout/ScrollableAppShell.tsx`). Contract: outer `h-dvh overflow-hidden` → inner `flex-1 min-h-0 overflow-y-auto` with `data-lenis-prevent`. List routes set `lockScroll` so only `AdminListShell` scrolls internally.

**Admin list pages** (Artists, Releases, News, Submission Form, future CRUD lists): use `AdminPageShell layout="list"` + `AdminListShell` (`src/components/admin/AdminListShell.tsx`). The shell passes viewport height down the flex chain; `AdminListShell` keeps toolbar/pagination fixed and scrolls the table pane internally with sticky headers via `AdminDataTable stickyHeader`.

**Horizontal table scroll:** Use `horizontalScrollClass` from `scroll-panel.tsx` (`overflow-x-auto overflow-y-clip overscroll-x-contain`) on wide tables. Never pair bare `overflow-x-auto` with `overscroll-contain` — that creates a scrollport with no vertical overflow and blocks wheel chaining to the parent pane.

| Do | Don't |
|----|-------|
| `AdminPageShell layout="list"` + `AdminListShell` on CRUD lists | Put `min-h-screen` on admin/portal content pages |
| `AdminPageShell fill` for full-bleed tools (e.g. `/admin/assets` file explorer) | Ad-hoc root `overflow-y-auto` on list managers |
| `horizontalScrollClass` on wide table wrappers (`Table`, `AdminDataTable`) | `overflow-x-auto overscroll-contain` without `overflow-y-clip` on nested wrappers |
| Preserve `min-h-0` through the flex height chain | Break the chain with `h-screen` / rogue `overflow-hidden` |

CI enforces this via `npm run check:scroll` (`scripts/check-scroll-contract.mjs`). Fullscreen auth/loading gates (`items-center justify-center`) may still use `min-h-screen`.

**CI scroll guard coverage:** `npm run check:scroll` dynamically scans `app/admin/`, `app/portal/`, `app/press/dashboard/`, `app/editor/`, all `*Manager.tsx` in `src/components/admin/` and `src/components/portal/`, and all `src/components/` public files for `overflow-y-auto` without `data-lenis-prevent`. New pages and managers are covered automatically — no manual registration needed.

**Scrollable containers:** Always use `<ScrollPanel>` (`src/components/ui/scroll-panel.tsx`) for scrollable content areas — it applies `overflow-y-auto overscroll-contain min-h-0` and `data-lenis-prevent` automatically. For inline usage, the `scrollPanelClass` constant is available.

## WCAG 2.1 AA (mandatory)

- Skip link → `#main-content` in `app/layout.tsx`
- Semantic lists: `<ul>/<li>` for grids; `<section aria-labelledby>`
- `useReducedMotion` in animated components
- Dialogs: `aria-labelledby`; icon-only controls: `aria-label` + `aria-hidden` on icons
- Touch targets: `min-w-[44px] min-h-[44px]` on icon-only controls
- Focus: `focus-visible:ring-2` — never bare `focus:outline-none`
- Toggle buttons: `aria-pressed`; external links: `rel="noopener noreferrer"`
- Contrast: 4.5:1 normal text; `text-muted-foreground` is AA-safe

## Images

Public images via `getOptimizedImageUrl` / `getSquareThumbnail` (`imageUtils.ts`). Brand logos/wordmarks: `getOptimizedLogoUrl` (higher `q`, wider width). Use `next/image` with `unoptimized` — wsrv.nl handles resize/WebP; `next.config.ts` sets `images.unoptimized: true` so Vercel Image Optimization never runs (Hobby limit → HTTP 402). Rich-text HTML: `processHtmlImages()`. Icon name clash: import Phosphor `Image` as `ImageIcon`.

## i18n

`en.json` / `de.json`; type from English baseline. RSC loads dict → props to clients. Locale: cookie → Accept-Language → `de`. New strings: both JSON files + prop chain.

**Locale UI:** `LocaleFlagSwitcher` — current flag + DE/EN/FR menu; sets `NEXT_LOCALE`. Locales: `en` | `de` | `fr` (`src/i18n/locales.ts`). Use on every shell (public, admin, portal, press). Date formatting: `toBcp47(locale)`. Legal CMS fields are DE/EN only — FR falls back to English body text; Impressum labels use `next-intl`.

**Enterprise contract (mandatory):** `npm run check:i18n` — en/de parity, static key existence, zero hardcoded `toast.*`/`confirm` in portal/admin, admin/editor must load `portal` bundle, residual UI hardcodes only via shrinkable baseline (`scripts/i18n-hardcode-baseline.json`). See [i18n-audit-notes.md](./i18n-audit-notes.md).

## Responsive layout

Mobile-first; fluid widths (`w-full`, `max-w-*`); no hardcoded structural pixels. Skeletons match loaded layout (zero CLS). `truncate` / `break-words` for overflow.

## Modals (mandatory)

| Rule | Pattern |
|------|---------|
| Width | `max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-xl lg:max-w-2xl` |
| Height | Body `overflow-y-auto max-h-[70vh]` (forms); `max-h-[92vh]` (media) |
| Spacing | 8px grid: `p-2`–`p-12`; default body `p-6` |
| z-index | Radix default `z-50`; never above `z-[9900]` (effects at 9996+) |
| Dismiss | Close button (44px), ESC, backdrop click via `onOpenChange` |
| Motion | Spring `{ stiffness: 400, damping: 40 }`; duration 0 when reduced motion |

## Visual effects

`VisualEffectsOverlay` in `NavHidingWrapper` — public routes only. Props from CMS `site_settings`. Raw, dark, industrial — no neon. `ThemeEffectsClient` cleans `data-fx-*` on unmount.

## Color theme admin

`ColorThemeManager`: single `useReducer` draft; live preview via `<style data-id="ctm-live-preview">` — no `documentElement.style` mutations. `ThemeStyleInjector` for SSR saved theme. `BroadcastChannel('theme-updates')` for cross-tab refresh; single `ThemeBroadcastListener`.

Typography tokens in `themeConfig.ts`; `--font-serif` wired in `ThemeStyleInjector` (never inline on `<html>`).

## Hero & gallery

`Hero.tsx`: `heroItem?: Release | NewsPost`; carousel every 6s; Explore → `#releases` or `#news`. `ReleasesCoverflow`: Swiper coverflow; direct R2 thumbnails; no Virtual module; iOS `pagehide` stops autoplay.

## Class names

Always `cn()` from `@/lib/utils` — never template literal class merging.

## Notification bells (admin + portal)

Shared primitives in `src/components/notifications/` (`NotificationBellTrigger`, `NotificationPanel`, `NotificationListItem`). Relative timestamps via `src/lib/formatRelativeTime.ts`.

**Platform (required for new events):** `src/lib/notifications/` — `NOTIFICATION_CATALOG` + `emitNotification(serviceDb, …)`. Do **not** insert into `notifications` / `editor_notifications` from route handlers. Service role only. Add catalog entry + i18n keys when shipping a new workflow.

**Read semantics:** Opening the popover does **not** mark items read. A click marks the item read in the DB, then navigates. Header button runs bulk read (`markAllEditorNotificationsRead` / `markAllPortalMessagesRead`). Badge counts always reconcile from the DB after mutations — never hard-set to zero when more unread rows may exist.

**Admin:** `DashboardNotificationBell` + unified `notifications` table via `src/lib/api/editorNotifications.ts` / `src/lib/api/notifications.ts`. Realtime on `notifications` filtered by `user_id`.

**Portal:** `PortalNotificationBell` + composite feed (`portalNotifications`): messages, interviews, statements, plus durable platform rows (`kind: platform`, e.g. fan-page decisions). Badge field `alerts` counts unread platform rows. `PortalNotificationProvider` refreshes on messages, interviews, statements, and `notifications`.

**History + preferences:** Shared `NotificationCenter` and `NotificationPreferencesForm` under `src/components/notifications/`. Routes: `/admin/notifications` (+ `/preferences`), `/portal/notifications` (+ `/preferences`).