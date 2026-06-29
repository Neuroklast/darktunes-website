# Reprtoir vs. darkTunes — Gap-Analyse

Stand: Juni 2026 · Zweck: Priorisierung für Believe-Readiness und SaaS-Produktisierung.

## Kurzfazit

| Kategorie | Gewinner |
|-----------|----------|
| Klassische Label-Operationen (Accounting, Rechte, Distributor-Delivery) | **Reprtoir** |
| Artist Experience & Self-Service | **darkTunes** |
| Visuelles Design & Brand Experience | **darkTunes** |
| EPK & Marketing-Tools | **darkTunes** |
| SaaS-Reife & Skalierbarkeit | **Reprtoir** |
| Technische Modernität (Stack) | **darkTunes** |

Reprtoir ist das bessere **Label-Betriebssystem** für Buchhaltung und Release-Abwicklung.
darkTunes ist das bessere **Artist-zentrierte Portal** mit starkem Frontend.

## Was Reprtoir deutlich besser macht

| Bereich | Reprtoir | darkTunes (Ist) | Gap |
|---------|----------|-----------------|-----|
| Royalty Accounting | 180+ Provider, Auto-Mapping, Advances, Splits | SOS mit manuellem CSV-Upload; Believe = CSV-Ingest | **Sehr groß** |
| Release Builder | Distributor-kompatible Meta-Pakete (Believe, Orchard) | Submission + interne Freigabe; kein Distributor-Push | **Groß** |
| Contracts & Rights | Rights-Holders, Territories, Chain-of-Rights | Nicht vorhanden | **Sehr groß** |
| SaaS-Reife | 350+ Teams, Pricing-Tiers, Migration-Support | Single-Label, kein Billing | **Groß** |
| Audio AI | Auto-Tagging, Similarity Search | Nicht vorhanden | Mittel (für Believe zweitrangig) |
| Playlists & Sharing | Traffic-Tracking | Nicht vorhanden | Klein |

## Was darkTunes deutlich besser macht

| Bereich | darkTunes (Ist) | Reprtoir | Vorteil |
|---------|-----------------|----------|---------|
| Artist Self-Service Portal | 24 Routen: Submission, Tour, Vault, Inbox, Onboarding | Kein Artist-Portal | **Einzigartig** |
| EPK Builder | Konva-Canvas, PDF, Share-Links, View-Analytics | Nicht vorhanden | **Einzigartig** |
| Artist Analytics | 11 Tabs: Streaming, Territories, Revenue Mix, EPK, Merch | Basic Sales Analytics | **Stark** |
| Public Website | Immersives Frontend, Releases, Artists, News, Tours | Kein Public Frontend | **Stark** |
| Data Sync | iTunes, Spotify, Discogs, Odesli, YouTube + R2 | Metadata Collector (v.a. Spotify) | **Stark** |
| UX / Design | Modern, visuell, genre-passend | Klassisches Business-SaaS | **Stark (Zielgruppe)** |

## Hybrid-Strategie (empfohlen)

Nicht Reprtoir 1:1 kopieren. Stattdessen:

1. **Stärken ausbauen:** Artist Portal, EPK, Analytics, Public Site
2. **Kritische Lücken intelligent schließen:**
   - Release-Export-Assistent (Believe-Metadaten-Paket) — nicht voller Distributor-API
   - Multi-Label-Tenancy + White-Label
   - Partner-API v1 + Webhooks
3. **Accounting nicht nachbauen:** Gute Import-Tools + optional Integration mit Reprtoir/anderen Tools
4. **Contracts/Rights:** Phase 3+ oder bewusst out of scope für MVP

## Roadmap-Verknüpfung

Siehe [`product-roadmap.md`](product-roadmap.md) für die konkrete Umsetzungsreihenfolge.