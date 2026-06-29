# Believe — Pitch-Struktur

Zweck: Gespräch mit Believe Label Services / Partner-Labels — **Pilot & Integration**, nicht Code-Verkauf.

## 1. Hook (30 Sekunden)

> „Wir haben ein Artist Self-Service Portal gebaut, das Reprtoir nicht hat: Releases einreichen, EPKs erstellen, Analytics sehen, Tourdaten pflegen — ohne dass euer Team jeden Artist einzeln betreut. Das reduziert Support-Last bei skalierten Label-Rostern.“

## 2. Problem

- Believe und Partner-Labels (z.B. Nuclear Blast) betreuen tausende Artists
- Reprtoir löst Accounting — aber **kein Artist-Portal**
- Support-Anfragen zu Releases, EPKs, Analytics binden Label-Teams
- Artists erwarten moderne Self-Service-Tools

## 3. Lösung

**White-Label Artist Portal** als Erweiterung für Label-Services:

| Feature | Nutzen für Believe |
|---------|-------------------|
| Release-Submission mit Checkliste | Weniger fehlerhafte Metadaten |
| EPK-Builder + PDF + Share-Analytics | Artists erstellen Promo-Material selbst |
| 11-Tab-Analytics (Territories, Revenue Mix) | Transparenz ohne manuelle Reports |
| Believe-Metadaten-Export | Schnellere Weiterleitung an Distribution |
| Partner-API v1 + Webhooks | Integration in bestehende Believe-Systeme |

## 4. Beweise (mitbringen)

- **Live-Demo:** Portal-Flow Release → EPK → Analytics → Export
- **ROI-Hypothese:** „X Stunden/Monat Support gespart bei Y Artists“ (mit echten darkTunes-Zahlen füllen)
- **Technik:** OpenAPI-Doku, RLS-Isolation, WCAG 2.1 AA
- **Referenz:** darkTunes als Production-Instanz (1.262 Commits, Enterprise-SOS)

## 5. Ask

**Nicht:** „Kauft unser Repo für 50k.“

**Sondern:**
- **Pilot** mit 1–2 Partner-Labels (3–6 Monate)
- **White-Label** unter Believe-Label-Services
- Optional: **Integrations-Auftrag** (API-Anbindung + Anpassungen)

## 6. Alternativer Pfad

Falls kein Pilot:
- Consulting/Integrations-Auftrag (Next.js + Supabase + Musik-Domain)
- Showcase für andere Distributoren / Label-Services

## 7. Einwände & Antworten

| Einwand | Antwort |
|---------|---------|
| „Wir bauen das selbst.“ | Prototyp spart 6–12 Monate; Fokus auf Artist-UX, nicht Accounting |
| „Zu klein / Nischen-Label.“ | Architektur skalierbar (Multi-Tenancy in Roadmap); Genre-UX ist Differentiator |
| „Reprtoir reicht.“ | Reprtoir hat kein Artist-Portal — ergänzend, nicht konkurrierend |
| „Integrations-Aufwand.“ | Partner-API v1 + Webhooks von Tag 1; schrittweise Anbindung |

## 8. Nächste Schritte

1. 30-Min-Demo terminieren
2. Technische Due-Diligence (API-Doku, Security-Overview aus [`SECURITY.md`](../../SECURITY.md))
3. Pilot-Scope definieren (1 Label, 10–20 Artists, 3 Monate)
4. Erfolgsmetriken: Support-Tickets, Submission-Qualität, Artist-Retention