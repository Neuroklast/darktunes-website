# Testing & Performance

## Unit tests (Vitest)

- `npm test` / `npm run test:watch`
- Setup: `src/test/setup.ts`
- Co-located: `src/**/*.{test,spec}.{ts,tsx}`
- Mock external APIs; no network in unit tests
- Supabase mock: chain methods return `this`; builder is thenable via bound `Promise.resolve`

## E2E (Playwright)

- `npm run test:e2e` — specs in `tests/e2e/`
- Projects: Desktop Chrome, Mobile Safari, Mobile Chrome, Performance Chrome
- Hide CRT/noise overlays before screenshots (`page.addStyleTag`)
- `SKIP_BUILD=1` to reuse existing build
- Skip gracefully when Supabase unconfigured
- CI workers: 2 by default (`PLAYWRIGHT_WORKERS` override)

### GitHub Actions CI layout (speed)

| Workflow | PR | main / other | Notes |
|----------|----|--------------|--------|
| `ci.yml` | always | always | Parallel jobs: lint+contracts+tsc · unit · build. Concurrency cancel-in-progress. Next + ESLint caches. |
| `qa.yml` | Full E2E matrix (Chrome + Mobile Safari + Mobile Chrome), docs paths ignored | Full E2E matrix (same) | No duplicate lint/unit/security. `/e2e` PR comment (`e2e-comment.yml`) runs the same matrix on demand. |
| `security.yml` | only lockfile/package changes | same + weekly schedule | Sole npm audit owner |
| `lighthouse-ci.yml` | path-filtered (`app`/`src`/…) | same | Next cache |
| `performance-budget.yml` | path-filtered | same | Next cache |
| `performance-tests.yml` | **not on PR** | path-filtered push + weekly + `workflow_dispatch` | Avoids double Playwright perf on every PR |

## Performance

- `npm run perf:test` — `tests/performance/`
- Use `budget(production, ci)` for timing assertions (CI needs higher thresholds)
- LCP: `waitForLoadState('networkidle')` before reading PerformanceObserver
- Bundle budget: `scripts/check-bundle-budget.js` — route keys from `app-build-manifest.json` (hash chunk names, not dependency names)
- Lighthouse: `lhci collect` + `lhci assert` separately (not `autorun`)
- Scripts: `npm run analyze`, `perf:lighthouse`, `perf:build`

## Cleanup coverage targets (2026-06 baseline)

Baseline after Phase 0 foundation (main @ 14da8b1):

| Metric | Count |
|--------|------:|
| Vitest files (`**/*.{test,spec}.{ts,tsx}`) | 307 |
| Vitest tests | 1812 |
| Playwright E2E specs (`tests/e2e/`) | 12 |
| `eslint-disable` in production TS | 5 files (6 suppressions reduced from 14 — remaining are `@next/next/no-img-element` for DOM APIs needing naturalWidth/naturalHeight or canvas crop, and `@typescript-eslint/no-require-imports` removed via async dynamic import) |
| `as unknown as` in production DAL | 0 (Phase 2) |

### Module matrix (target: co-located test per module >100 lines)

| Module | Status | Next phase |
|--------|--------|------------|
| `src/lib/sos/data-processor/` | **Done** (split + pipeline tests) | Phase 1.2 `export-utils` |
| `src/lib/sos/export/` | **Done** (shared + PDF/Excel/ZIP split) | — |
| `src/lib/api/settlementRegister.ts` | **Done** (register + carry-forward tests) | — |
| `src/components/admin/sos/SettlementCenter*` | **Done** (panel smoke test + `settlementCenterApi`) | — |
| `app/api/admin/settlements/*` | **Done** (register, periods, lock, archive route tests) | — |
| `src/hooks/useSosCSVProcessor.ts` | **Done** (194-line test file) | — |
| `src/lib/api/epkDocument.ts` | **Done** (`toSupabaseJson`) | — |
| `src/lib/types/jsonColumns.ts` | **Done** (adopted in DAL Phase 2) | — |
| `src/lib/api/settlementCenterApi.ts` | **Done** (fetch helper tests) | — |
| `src/lib/i18n/accountingFallbacks.ts` | **Done** (Phase 0) | — |
| `src/components/admin/forms/ArtistForm.tsx` | **Done** (admin/artist tabs, slug, save smoke tests) | — |
| `app/portal/profile/_components/EPKPreview.tsx` | No tests | Phase 4.1 |
| `src/components/epk-builder/` | Partial (EpkCanvas, EpkCanvasElementNode, EpkFontLoader, EpkGroupNode, EpkPageBackgroundPanel, EpkTemplatePicker, EpkGoogleFontPicker, EpkImageCropDialog, EpkAssetPicker, EpkPagesPanel, EpkToolbar) | Phase 7 (EpkTextEditor, EpkPropertyPanel, EpkSidebar) |
| `src/hooks/` (30 files) | **All 30 have tests** ✅ | — |

Re-run `npm test 2>&1 | grep "Tests "` after each phase to update the Vitest count.