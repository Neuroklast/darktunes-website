# i18n — enterprise contract

## CI enforcement

```bash
npm run check:i18n          # parity, key refs, zero toast/confirm hardcodes, baseline growth
npm run check:i18n:baseline # rewrite residual UI hardcode allowlist after fixes
npm run audit:i18n          # inventory hardcoded UI across public, admin, portal, editor and shared components
npm run audit:i18n -- --json # machine-readable audit summary
```

Wired into `npm run ci` and `.github/workflows/ci.yml`.

Also covered by Vitest: `src/i18n/i18n-contract.test.ts`.

## Rules (fail the build)

1. **en/de/fr parity and variable placeholders** for every JSON namespace (all 36 catalogs, including AI, public website, portal, press and admin).
2. **Static key existence** — `t('…')` / `tToast('…')` / `portalKey('…')` must resolve.
3. **Zero hardcoded toasts/confirms** in portal/admin/login UI (`toast.*('English')`, `window.confirm('…')`).
4. **Route bundles** — `/admin` and `/editor` must load the `portal` namespace (shared components).
5. **Hardcode baseline** — other UI hardcodes (placeholders, labels) may exist only if listed in `scripts/i18n-hardcode-baseline.json`. **New** hardcodes fail CI; shrink the baseline when fixing.

## Repository-wide audit

The existing strict CI contract prevents missing keys, mismatched interpolation parameters and *new* tracked admin/portal hardcodes. It does not prove the entire website is translated. Run `npm run audit:i18n` to identify literal UI text and fixed date/number locales throughout `app`, `src/components` and `src/hooks`. This is a heuristic candidate inventory: review every finding before changing it. Brand names, user-generated content and technical IDs must not be blindly translated. The scan currently reports findings rather than failing CI because the legacy surface contains substantial unconverted UI copy. Prioritize high-traffic pages and grow strict enforcement as the baseline is reduced.

The AI Credits admin form, assistant credit balance and AI Credits tab now use `ai.admin.credits` in all three locales, including currency/date formatting.

## Conventions

| Surface | Namespace |
|---------|-----------|
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
|--------|---------|
| `scripts/check-i18n-contract.mjs` | CI contract |
| `scripts/audit-i18n-keys.mjs` | static key scan |
| `scripts/list-hardcoded-toasts.mjs` | list toast/confirm literals |
| `scripts/find-hardcoded-ui.mjs` | legacy partial portal/admin scan |
| `scripts/audit-full-i18n.mjs` | repository-wide user-facing literal and fixed-locale inventory |
| `scripts/i18n-toast-map.json` | toast EN→DE map for migrations |
