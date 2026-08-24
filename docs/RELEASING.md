# Releasing (SemVer)

darkTunes deploys continuously from `main` (Vercel). **Git tags + `package.json` version** label product releases for support, changelog, and Admin → System Health.

## Source of truth

| Item | Authority |
|------|-----------|
| Current product version | `package.json` → `"version"` (mirrored in lockfile root) |
| Historical releases | Annotated git tags `vX.Y.Z` + `CHANGELOG.md` sections |
| Deploy identity | Commit SHA (`VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`) |
| Runtime display | `GET /api/health?mode=full` → `app.version` / `app.commit`; Admin System Health |

Do **not** confuse with domain versions (`portal_terms_version`, EPK document schema version, Dependabot dependency bumps).

## When to bump

| Bump | Use for |
|------|---------|
| **MAJOR** (`X.0.0`) | Breaking product/API for staff or artists; forced re-auth; incompatible schema requiring coordinated downtime/reset semantics |
| **MINOR** (`x.Y.0`) | User-facing features, new routes/surfaces, new integrations |
| **PATCH** (`x.y.Z`) | Bugfixes, a11y, performance, safe dependency updates, product-visible docs fixes |

Still merge and deploy anytime; cut a version when you want a labeled release (end of feature wave, hotfix, support milestone).

## Ritual

1. **Land the product work** on a branch; keep bullets under `CHANGELOG.md` → `[Unreleased]` while developing (user-facing only — see `docs/agent/workflow.md`).
2. **Cut the changelog:** move Unreleased bullets into `## [X.Y.Z] — YYYY-MM-DD`. Leave `[Unreleased]` empty (or only post-cut WIP).
3. **Bump package version** (if not already set for this release):

   ```bash
   npm run release -- bump minor   # or patch | major
   ```

   Or set `"version"` in `package.json` / lockfile root by hand to match the changelog section.
4. **Verify:**

   ```bash
   npm run release:check
   npm run ci   # or at least typecheck + unit tests
   ```

5. **Commit** version + changelog + code together (Conventional Commits welcome: `chore(release): 1.6.0`).
6. **Tag:**

   ```bash
   npm run release:tag
   # creates annotated tag vX.Y.Z when tree is clean and CHANGELOG has ## [X.Y.Z]
   ```

7. **Push branch/PR as usual**, then push the tag after merge (or from main):

   ```bash
   git push origin vX.Y.Z
   ```

8. Optional: GitHub Release

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file - <<'EOF'
   See CHANGELOG.md section [X.Y.Z].
   EOF
   ```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run release:check` | package version has a CHANGELOG section; local tag not already present |
| `npm run release -- bump <major\|minor\|patch>` | bump package + lockfile; prints next steps |
| `npm run release:tag` | annotated `v$version` (refuse dirty tree unless `--allow-dirty`) |

Implementation: `scripts/release.mjs`.

## Historical tags

Versions before package.json was authoritative (`v1.0.0`–`v1.5.0`) are **annotated tags on historical commits**. Those commits may still show `0.0.0` in package.json; trust the **tag name + CHANGELOG** for history. From **1.6.0** onward, package version and tags stay in sync.

## Admin UI

System Health (full mode) shows `v{version} · {shortSha}` when the deploy env provides a commit. Locally without env, only `v{version}` appears.
