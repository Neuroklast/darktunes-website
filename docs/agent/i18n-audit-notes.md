# i18n — enterprise contract

## CI enforcement

```bash
npm run check:i18n          # parity, key refs, zero toast/confirm hardcodes, baseline growth
npm run check:i18n:baseline # rewrite residual UI hardcode allowlist after fixes
```

Wired into `npm run ci` and `.github/workflows/ci.yml`.

Also covered by Vitest: `src/i18n/i18n-contract.test.ts`.

## Rules (fail the build)

1. **en/de parity** for `portal` and `admin` (full flat key trees).
2. **Static key existence** — `t('…')` / `tToast('…')` / `portalKey('…')` must resolve.
3. **Zero hardcoded toasts/confirms** in portal/admin/login UI (`toast.*('English')`, `window.confirm('…')`).
4. **Route bundles** — `/admin` and `/editor` must load the `portal` namespace (shared components).
5. **Hardcode baseline** — other UI hardcodes (placeholders, labels) may exist only if listed in `scripts/i18n-hardcode-baseline.json`. **New** hardcodes fail CI; shrink the baseline when fixing.

## Conventions

| Surface | Namespace |
| --------- | ----------- |
| Portal copy | `useTranslations('portal')` |
| Admin copy | `useTranslations('admin')` / nested (`admin.events`) |
| Shared toast API | Admin: `useTranslations('admin.toast')` → `tToast('key')` |
| Portal toasts | flat keys `toast_*` on portal dict: `useTranslations('portal')` + `tToast('toast_…')` |

Never call `useTranslations` inside nested handlers — only at component top level.

Shared components that use `portal.*` must only mount on routes whose `ROUTE_BUNDLES` include `portal`.

## Historical fixes

- Admin/editor omitted `portal` → raw `portal.tour_heading` in EventManager (fixed in `loadMessages.ts`).
- Dead `TourList`/`TourManager` removed; Events + Tour Production retained.

## Tooling helpers

| Script | Purpose |
| -------- | --------- |
| `scripts/check-i18n-contract.mjs` | CI contract |
| `scripts/audit-i18n-keys.mjs` | static key scan |
| `scripts/list-hardcoded-toasts.mjs` | list toast/confirm literals |
| `scripts/find-hardcoded-ui.mjs` | broader UI hardcode scan |
| `scripts/i18n-toast-map.json` | toast EN→DE map for migrations |
