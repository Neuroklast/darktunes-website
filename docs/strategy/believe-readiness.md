# Believe-Readiness — Begeisterungsfaktoren

Stand: Juni 2026 · Ohne KI-Features (realistische Priorisierung).

Believe bewertet primär: Skalierbarkeit, Support-Reduktion, Datenqualität, Integrationsfähigkeit, professionelle Prozesse — nicht Design-Ästhetik.

## Top-Prioritäten

| Rang | Faktor | Ist-Stand | Ziel | Aufwand | Wirkung |
|------|--------|-----------|------|---------|---------|
| 1 | Artist Self-Service Portal | ✅ Produktionsreif | Polish + Demo-Flow | Mittel | Sehr hoch |
| 2 | API + Webhooks | ❌ Fehlt | Partner-API v1 + Events | Hoch | Sehr hoch |
| 3 | Release-Submission + Export | ⚠️ Intern only | Believe-Metadaten-Export | Mittel | Sehr hoch |
| 4 | Analytics + Export | ⚠️ Portal-CSV im Code, Admin-CSV live | API + UI vollständig | Mittel | Hoch |
| 5 | Multi-Tenancy + White-Label | ❌ Fehlt | `organizations` + RLS | Hoch | Hoch |
| 6 | SOS / Statements | ✅ Believe-CSV-Ingest | Profile erweitern | Mittel | Mittel |
| 7 | Custom Domains | ❌ Fehlt | Cloudflare + Subdomains | Mittel | Mittel |
| 8 | Audit Logs | ⚠️ `rbac_audit_log` teilweise | Org-scoped Audit | Mittel | Mittel |

## Ist-Stand (codebase-verifiziert)

### Bereits stark

- **Artist Portal:** `/portal/*` — EPK-Builder, Analytics (11 Tabs), Release/Video-Submission, Checklisten, Statements, Tour-Planner
- **Believe Accounting:** CSV-Auto-Detect (`Sales Month` + `ISRC`), Revenue-Splits in [`fees.ts`](../../src/lib/sos/data-processor/fees.ts)
- **Auth/RBAC:** `role_permissions`, `custom_roles`, Portal-Bearer-Auth
- **OpenAPI:** [`docs/openapi.yaml`](../../docs/openapi.yaml) — intern, Session/JWT

### Kritische Lücken

- Kein `organization_id` auf Daten-Tabellen (nur `label_id` auf `api_credentials`)
- Keine Partner-API (`/api/v1/*`)
- Keine outbound Webhooks für Release/Artist-Events
- Release-Submission endet bei `accepted` — kein Distributor-Export
- Kein Stripe/Billing, keine Subdomains

## Zweitrangig für Believe

- CRT-Ästhetik / Genre-Look (Professionalität > Style)
- Tour-Planner, Promo-Pool, Presseportal
- Audio-AI, Playlist-Sharing

## Umsetzungsphasen

| Phase | Inhalt | Branch-Status |
|-------|--------|---------------|
| 0 | Strategie-Docs | Dieser Branch |
| 1 | Multi-Tenancy-Grundlage (`organizations`) | In Arbeit |
| 2 | Believe-Export, Partner-API v1, Analytics-Export | In Arbeit |
| 3–6 | SaaS Billing, Domains, Polish | Geplant |

Details: [`product-roadmap.md`](product-roadmap.md)