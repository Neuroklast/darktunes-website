# darkTunes Platform — Realistische Bewertung

Stand: Juni 2026 · Codebase: 1.262 Commits, ~168 API-Handler, 96 DB-Tabellen, 4 authentifizierte Surfaces.

## Zusammenfassung

| Kriterium | Bewertung | Realistischer Wert |
|-----------|-----------|-------------------|
| Technische Qualität | Sehr hoch | — |
| Entwicklungswert (Ersatzkosten) | Sehr hoch | **90.000 – 220.000 €** |
| Marktwert (as-is) | Niedrig–Mittel | **10.000 – 35.000 €** |
| Verkaufswert an Believe | Niedrig–Mittel | **15.000 – 50.000 €** (max. ~80k mit Pitch + Know-how-Transfer) |
| Persönlicher Opportunity Cost | Hoch | **50.000 – 120.000 €** |

## 1. Entwicklungswert

### Was im Repo steckt

- **Public Website:** ISR, i18n EN/DE, PWA, WCAG 2.1 AA, Spotify-Player, CRT-Ästhetik
- **Admin CMS:** ~20 Module inkl. Accounting (SOS/Abrechnungszentrale), Label-Analytics, RBAC
- **Artist Portal:** 24 Routen — EPK-Builder (Konva), 11-Tab-Analytics, Release/Video-Submission, Tour-Planner (offline), Document Vault, Settlement-Ledger
- **Press/Journalist:** EPK-Sharing, Promo-Pool, Download-Audit
- **Platform:** Multi-API-Sync (Spotify, iTunes, Discogs, Odesli, YouTube), R2-Assets, Cron-Queue
- **QA/CI:** Vitest (~1.300 Tests), Playwright E2E, Lighthouse CI, Bundle-Budgets, Security-Hardening

### Ersatzkosten-Schätzung

| Faktor | Schätzung |
|--------|-----------|
| Vollzeit-Äquivalent | 8–16 Monate |
| Stundensatz Agentur (DE/EU) | 80–120 €/h |
| Gesamtstunden (konservativ) | 900–1.800 h |
| **Marktpreis Neubau** | **90.000 – 220.000 €** |

Das ist kein MVP. Allein Artist Portal + SOS/Settlement + EPK-Builder wären bei einer Agentur jeweils eigene Projekte.

## 2. Marktwert (aktuell als Asset)

### Warum der Marktwert deutlich unter dem Entwicklungswert liegt

1. **Proprietär & single-label:** Kein `organization_id` auf Kern-Tabellen (Stand Branch-Start); `label_id` nur auf `api_credentials`
2. **Kein PMF nach außen:** 0 GitHub-Stars, keine SaaS-Kunden, keine öffentlichen Case Studies
3. **Labels kaufen selten fremde Custom-Systeme:** Entweder SaaS (Reprtoir) oder Eigenbau
4. **Hoher Übernahme-Aufwand:** Branding, Workflows, deutsche Accounting-Logik sind darkTunes-spezifisch

### Als fertiges Produkt für ein einzelnes Label

**10.000 – 35.000 €** (realistisch eher unteres Drittel ohne Multi-Label-Nachweis)

### Als productisiertes SaaS (Zukunft)

Reprtoir-ähnliche Tools: Starter ~49 $/Mo, Professional ~129 $, Business ~299 $. Langfristiges Potenzial deutlich höher — aber das wäre ein **neues Produkt**, kein Verkauf des aktuellen Repos.

## 3. Verkaufswert an Believe

### Kontext

Believe (~988 Mio. € Umsatz, 2.000+ MA) kauft große Player (TuneCore, Sentric) oder baut selbst. Kleine Custom-Label-Systeme sind für sie kein strategischer Kauf.

### Was Believe interessieren könnte

- **Artist Self-Service Portal** (ihr größter Vorteil vs. Reprtoir)
- **API-Integrationsfähigkeit** (aktuell fehlend)
- **Release-Workflows** mit weniger manueller Nacharbeit
- **White-Label für Partner-Labels** (Nuclear Blast etc.)

### Realistischer Verkaufspreis

| Szenario | Preis |
|----------|-------|
| Nur Code, ohne Traktion | 15.000 – 25.000 € |
| Code + Know-how-Transfer (3–6 Monate) | 30.000 – 50.000 € |
| Starker Pitch + ROI-Nachweise + Pilot | bis ~80.000 € |

### Was den Preis nach oben treibt

- Messbare ROI-Daten aus darkTunes-Betrieb (Stunden/Monat gespart, Artist-Retention)
- Pilot mit 1–2 Partner-Labels unter Believe
- Verkauf als **Prototyp + Entwickler**, nicht nur Repo

## 4. Empfehlung

1. **Primär:** Portfolio/Showcase für Job, Consulting oder Integrations-Auftrag bei Believe/Labels
2. **Sekundär:** Productisierung (Multi-Label SaaS) — siehe [`product-roadmap.md`](product-roadmap.md)
3. **Nicht erwarten:** Sechsstelliger Exit durch Code-Verkauf allein

## Referenzen

- Technischer Scope: [`INTEGRATION-SUMMARY.md`](../../INTEGRATION-SUMMARY.md)
- Gap-Analyse: [`reprtoir-gap-analysis.md`](reprtoir-gap-analysis.md)
- Believe-Plan: [`believe-readiness.md`](believe-readiness.md)