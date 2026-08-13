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

**Public feel (desktop):** `LENIS_OPTIONS` — **lerp only** (`0.08`), `smoothWheel: true`, `autoRaf: true`, `wheelMultiplier: 0.9`, `syncTouch: false`. Do **not** set `duration`/`easing` on the instance: Lenis then eases each wheel notch as a timed tween (steppy on Windows). Anchor `scrollTo` passes `LENIS_ANCHOR_SCROLL` (duration 1.15). Import `lenis/dist/lenis.css` in `globals.css`.

**Dashboard routes:** `LenisProvider` does **not mount** Lenis on `/admin/*`, `/portal/*`, or `/editor` (`src/lib/scroll/dashboardRoutes.ts`) so wheel events reach native scroll inside dashboard shells.

**Touch:** Lenis always uses `syncTouch: false` so phones keep native touch scroll (syncTouch caused rubber-band ghosting with VFX GPU layers). Wheel/trackpad still get smooth Lenis on desktop. Do **not** mount/unmount Lenis from media queries — remounting the tree detaches focused nodes and flakes keyboard e2e.

**Scroll VFX budget:** `ScrollFxController` sets `html[data-scrolling="1"]` while Lenis has velocity. CSS pauses CRT pulse, hides grain, drops chromatic/`will-change` on overlays and `.glow-card` during scroll so expensive GPU layers do not fight Lenis. Do **not** paper over jank with blanket `data-lenis-prevent` on carousels/sections.

**Carousels (Swiper coverflow, related-artist strips):** Vertical wheel stays on Lenis. No `data-lenis-prevent` on the wrapper. Use `touch-action: pan-y` (or pan-x pan-y for horizontal strips) and optional axis-aware `onWheel` for horizontal slide changes only.

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
- Touch targets: `min-w-[44px] min-h-[44px]` on icon-only controls **on public UI** (do not globally enlarge `Button` `size="icon"` — breaks dense admin)
- Contact forms: `aria-invalid` + `aria-describedby` on fields with errors; success/error `role="status"` / `role="alert"`
- Focus: `focus-visible:ring-2` — never bare `focus:outline-none`
- Toggle buttons: `aria-pressed`; external links: `rel="noopener noreferrer"`
- Contrast: 4.5:1 normal text; `text-muted-foreground` is AA-safe

## Images

Public images via `getOptimizedImageUrl` / `getSquareThumbnail` (`imageUtils.ts`). Brand logos/wordmarks: `getOptimizedLogoUrl` (higher `q`, wider width). Use `next/image` with `unoptimized` — wsrv.nl handles resize/WebP; `next.config.ts` sets `images.unoptimized: true` so Vercel Image Optimization never runs (Hobby limit → HTTP 402). Rich-text HTML: `processHtmlImages()`. Icon name clash: import Phosphor `Image` as `ImageIcon`.

## i18n

`en.json` / `de.json`; type from English baseline. RSC loads dict → props to clients. Locale: cookie → Accept-Language → `de`. New strings: both JSON files + prop chain.

**Locale UI:** `LocaleFlagSwitcher` — SVG flags (not emoji; Windows otherwise shows DE/GB/FR letters) + DE/EN/FR menu; sets `NEXT_LOCALE` and **reloads** (not `router.refresh()` — unreliable/slow on force-dynamic admin/portal). Locales: `en` | `de` | `fr` (`src/i18n/locales.ts`). One switcher per shell chrome (header), not also in sidebar footers. Date formatting: `toBcp47(locale)`. Legal CMS fields are DE/EN only — FR falls back to English body text; Impressum labels use `next-intl`.

**Admin/editor chrome:** Every label in `AdminSidebarNav` and `AdminDashboard` tab strip must go through `admin.nav` keys (`labelKey`). Hardcoded English makes language switches look broken even when the cookie + reload work. Active state: `isAdminNavActive` (`adminNavActive.ts`) — exact path or `path/` prefix, editor tabs via `?tab=`. Wrap `AdminSidebarNav` in `<Suspense>` (uses `useSearchParams`).

**Enterprise contract (mandatory):** `npm run check:i18n` — en/de parity, static key existence, zero hardcoded `toast.*`/`confirm` in portal/admin, admin/editor must load `portal` bundle, residual UI hardcodes only via shrinkable baseline (`scripts/i18n-hardcode-baseline.json`). See [i18n-audit-notes.md](./i18n-audit-notes.md).

## Artist profile preview rows (`/artists/[slug]`)

Videos and news on the **regular** artist page (not Personal/Fan page) show a CMS-configured number of **grid rows** before an in-place Show all control.

| Setting keys | Defaults | Visible count |
|--------------|----------|---------------|
| `artist_profile_video_rows` / `artistProfileVideoRows` | 2 | rows × cols (1 / md 2 / xl 3) |
| `artist_profile_news_rows` / `artistProfileNewsRows` | 2 | rows × cols (1 / md 2) |

Helpers: `src/lib/artistProfilePreview.ts`. Admin fields: Site Settings next to homepage pagination. RSC passes clamped values from `getCachedSiteSettings()`.

## Responsive layout

Mobile-first; fluid widths (`w-full`, `max-w-*`); no hardcoded structural pixels. Skeletons match loaded layout (zero CLS). `truncate` / `break-words` for overflow.

### Multi-column builders (EPK / Personal Artist Page)

`react-resizable-panels` sets **inline** `display: flex` on `Group` — Tailwind `hidden` / `lg:flex` **cannot** hide it. Always:

1. Gate with `useIsLg()` (`src/hooks/useMediaQuery.ts`, Tailwind `lg` = 1024px).
2. **Mount** `ResizablePanelGroup` only when `isLg`; below `lg` render one full-width panel + tab chrome.
3. Default media hooks to mobile-safe (`false`) until `matchMedia` runs (avoid desktop flash).
4. Compact toolbars on mobile (`compact` prop): primary actions + overflow menu, not a wrapped desktop icon wall.
5. Portal full-bleed: `lockScroll` + `contentClassName p-0` for `/portal/epk-builder` **and** `/portal/fan-page`.

CI: `npm run check:mobile-layout` (`scripts/check-mobile-layout-contract.mjs`) — in `ci:contracts`.

### Public footer (legal links)

Legal row must `flex-wrap` with `min-h-[44px]` touch targets. Never `overflow-x-hidden` + non-wrapping link row (clips Impressum on ~360px).

## Modals (mandatory)

| Rule | Pattern |
|------|---------|
| Width | `max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-xl lg:max-w-2xl` |
| Height | Body `overflow-y-auto max-h-[70vh]` (forms); `max-h-[92vh]` (media) |
| Spacing | 8px grid: `p-2`–`p-12`; default body `p-6` |
| z-index | Stacking contract below (do not invent ad-hoc layers) |
| Dismiss | Close button (44px), ESC, backdrop click via `onOpenChange` |
| SOS Excel export | `ExcelExportDialog` — body `max-h-[70vh] overflow-y-auto` + `data-lenis-prevent`; column presets on workspace, not localStorage |
| Motion | Spring `{ stiffness: 400, damping: 40 }`; duration 0 when reduced motion |

### Overlay stacking contract

Portaled pickers/menus must sit **above** Dialog/Sheet or they open “invisibly” behind the modal backdrop (user sees “click does nothing”).

| Layer | z-index | Components |
|-------|---------|------------|
| Dialog/Sheet overlay | `z-[9998]` | `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx` |
| Dialog/Sheet content | `z-[9999]` | same |
| Portaled pickers & menus | `z-[10000]` | `select`, `popover` (DateField/MonthField), `dropdown-menu`, `hover-card`, `context-menu`, `tooltip` |
| Drawer | Overlay `z-[9998]` / content `z-[9999]` | Same stack as Dialog/Sheet |

CI: `npm run check:overlay` (`scripts/check-overlay-stack-contract.mjs`).

**Date pickers:** Always use `DateField` / `MonthField` — never raw `type="date"` for shared UX. They rely on Popover; the Popover z-index is what keeps calendars usable inside admin modals (e.g. New Release → Release Date).

### Lenis `prevent` contract

`shouldPreventLenis` (`src/lib/scroll/lenisPrevent.ts`):

1. Explicit `data-lenis-prevent` / scroll-area viewport → yield to native.
2. Else: ancestors that **actually overflow vertically** only (`overflow-y` + `scrollHeight > clientHeight`). Horizontal-only overflow must not block document Lenis.
3. Never gate only on class substrings (`overflow-x-auto` in a Tailwind string) — homepage Videos used that pattern and dead-zoned vertical scroll on desktop.
4. `data-lenis-prevent` = “this is a nested vertical scrollport”, not “this widget is expensive”.

**Mailbox UX:** Thread detail uses `MessageChatThread` (chat bubbles). Live arrivals can play `playNewMessageSound()`; users toggle via `MessageSoundToggle` (`localStorage` key `dt-message-sound-enabled`).

## Visual effects

`VisualEffectsOverlay` in `NavHidingWrapper` — public routes only. Props from CMS `site_settings`. Raw, dark, industrial — no neon. `ThemeEffectsClient` cleans `data-fx-*` on unmount.

**Mobile / coarse pointer:** `vfx-mobile-lite` — static vignette only; no CRT scanline animation, chromatic aberration, or permanent `will-change` (scroll ghosting). `ScrollReveal` clears `will-change` after intro animation.

**While scrolling (desktop):** `html[data-scrolling="1"]` dimms/pauses grain, CRT animation, chromatic, and colour wash; `.glow-card` drops `will-change` (see `ScrollFxController` in `LenisProvider`).

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

**Admin nav badges (sidebar counts + push badge):** Single owner `AdminNavBadgesProvider` in `AdminClientLayout` → `useAdminNavBadges` once. Consumers (`AdminSidebarNav`, `AdminPushBootstrap`) read `useAdminNavBadgesContext()` — never mount the subscription hook twice against the singleton browser Supabase client. Realtime rules: all `.on('postgres_changes', …)` **before** `.subscribe()`; unique channel topics per instance (`useId`); keep refresh callbacks in a **ref** so effect re-runs do not re-attach listeners after subscribe. Same dual-mount class of bug hit `EditorNotificationBell` / `DashboardNotificationBell` historically.

**Portal:** `PortalNotificationBell` + composite feed (`portalNotifications`): messages, interviews, statements, plus durable platform rows (`kind: platform`, e.g. fan-page decisions). Badge field `alerts` counts unread platform rows. `PortalNotificationProvider` refreshes on messages, interviews, statements, and `notifications`.

**History + preferences:** Shared `NotificationCenter` and `NotificationPreferencesForm` under `src/components/notifications/`. Routes: `/admin/notifications` (+ `/preferences`), `/portal/notifications` (+ `/preferences`).