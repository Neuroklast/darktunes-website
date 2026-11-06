# SOS Accounting Contract (SSOT)

Binding contract for the Statement-of-Sales generator, settlement, invoices, payments, and
the related admin/portal surfaces. This file is the **single source of truth**; the GitHub
issues #615–#632 mirror the sections relevant to them. If an issue excerpt and this file
disagree, this file wins and the issue must be corrected.

- **Scope:** `sales_statements`, `artist_invoices`, `settlement_periods`,
  `artist_settlement_ledger`, `period_carry_forwards`, `distributor_import_batches`,
  SOS workspace/presets, exports (PDF/Excel/ZIP/SEPA), portal views.
- **Basis:** main `701155a3` (epic review basis `5e2abf0a`), 2026-09-17.
- **Language:** German (matches the issues). Code identifiers, paths, and enum values stay
  as in code.
- **Status values:** "MUSS" = binding acceptance criterion, "SOLL" = binding unless a
  documented technical reason is accepted in the PR, "IST" = current behavior that is
  explicitly preserved.
- **Normative keywords** refer to the implemented target state, not to today's behavior.
  Where the target differs, the owning issue is named in the section header.

Related: [features.md](features.md) · [data-and-schema.md](data-and-schema.md) ·
[backend.md](backend.md) · [testing-performance.md](testing-performance.md) ·
[portal-write-auth.md](portal-write-auth.md) · epic #627.

---

## §A Status and action contract

Owner issues: #616, #621, #622, #623, #628. Mirror into #622/#623/#621/#628.

### A.1 Entities and status values

| Entity | Status values | Source |
|---|---|---|
| `sales_statements.status` | `draft`, `label_approved`, `artist_notified`, `viewed`, `invoiced`, `paid`, `acknowledged`, `superseded`, `cancelled` | `src/types/database.ts`, `statementStatusTransitions.ts` |
| `sales_statements.document_type` | `original`, `correction`, `storno` | `src/types/database.ts` |
| `artist_invoices.status` | `draft`, `sent`, `received`, `partially_paid`, `paid`, `cancelled` | `src/types/database.ts` |
| `artist_invoices.delivery_status` (neu, #623) | `not_sent`, `sent`, `failed` | target |
| `settlement_periods.status` | `open`, `under_review`, `approved`, `locked`, `archived` | `src/types/database.ts` |
| `distributor_import_batches.status` | `uploaded`, `processing`, `completed`, `failed` | `src/types/database.ts` |
| `artist_settlement_ledger.entry_type` | `statement_payout`, `invoice_liability`, `payment`, `partial_payment`, `carry_in`, `carry_out`, `correction` | `src/types/database.ts` |

Period opening is `carry_in` (from archive). `opening_balance` was an unused reserve and is removed from the ledger enum.

### A.2 Statement transitions (binding)

Allowed edges (same-status is a no-op). No reverse, no unlock, no unpay.

| From | Allowed to |
|---|---|
| `draft` | `label_approved` |
| `label_approved` | `artist_notified`, `viewed`, `invoiced`, `superseded` |
| `artist_notified` | `viewed`, `invoiced`, `superseded` |
| `viewed` | `invoiced`, `paid`, `superseded` |
| `invoiced` | `paid`, `superseded` |
| `acknowledged` | `paid`, `superseded` |
| `paid` | terminal |
| `superseded` | terminal |
| `cancelled` | terminal |

MUSS-Regeln:

1. Jeder Statuswechsel läuft über `assertStatementTransition`
   (`src/lib/sos/statementStatusTransitions.ts`). Ausnahme: `recordStatementView`
   nutzt die atomare RPC `record_statement_view` (`COALESCE(first_viewed_at)`,
   monotoner Zähler, `CASE` auf dem aktuellen Status). `viewed` ist ein
   Ansichtsereignis und kein Finanzvorgang: Es darf auch in `locked`/`archived`
   Perioden geschrieben werden, jedoch nur aus `label_approved`/`artist_notified`
   und nur einmal (Idempotenz über `first_viewed_at`).
2. Optimistische Nebenläufigkeit: `updateSalesStatementStatus` und
   `approveSalesStatement` prüfen `.eq('status', expected)`. 0 Treffer/`PGRST116`
   MUSS als HTTP 409 `STATEMENT_STATUS_CONFLICT` (problem+json) enden, nicht als 500.
3. `label_approved` ohne Zustellung: Schlägt die Benachrichtigung fehl, bleibt der
   Statement-Status `label_approved` (IST, bestätigt). Wiederholung:
   `POST /api/admin/sales-statements/{id}/notifications` (`label_approved → artist_notified`).
4. `acknowledged` ist ein Migrationsaltwert. Kein neuer Writer; Leser behandeln ihn wie
   `invoiced` (IST, `statementWorkflow.ts`).
5. `cancelled` hat keinen Writer. Entscheidung: kein Statement-Storno in der App.
   Entwürfe werden gelöscht. `cancelled` bleibt Enum/Terminal für Altzeilen, ist aber
   aus dem Übergangsgraph entfernt (kein erreichbarer Zielstatus).

### A.3 Action contract (statements)

| Ausgangszustand | Aktion | Voraussetzungen | Ergebnis | Nebenwirkungen |
|---|---|---|---|---|
| — | Entwurf anlegen (`uploadStatement`) | Admin-only (`canPublishStatement`), Artist existiert, Periode schreibbar, kein offener Entwurf je Artist+Periode (Partial-Index) | `draft` + R2-PDF + Line Items | R2-Objekt; bei DB-Fehler R2-Löschung (IST) |
| `draft` | Freigeben | Admin, Periode schreibbar, Status exakt `draft` | `label_approved` + `label_approved_at` + Notiz | E-Mail-Versuch; bei Erfolg `artist_notified`; `linkApprovedStatementToSettlement` bucht `statement_payout`; Audit |
| `label_approved` | Benachrichtigung nachholen (#623) | Admin, Status exakt `label_approved` | `artist_notified` | Notification; Audit |
| `label_approved`/`artist_notified` | Ansicht erfassen | Portal-Mitglied, Statement gehört zum Artist | `viewed` (einmalig) | `first_viewed_at`, `last_viewed_at`, `view_count+1` |
| `label_approved`/`artist_notified`/`viewed` | Rechnung anlegen (Portal) | Mitglied, Billing-Profil vollständig, Betrag stimmt exakt überein, keine bestehende Rechnung, Periode schreibbar | Rechnung `draft` | PDF + `pdf_url`/`pdf_sha256`; `status`/`delivery_status` gemäß §A.4; Statement → `invoiced`; Ledger `invoice_liability`; Notification; Mail |
| `draft` | Entwurf löschen | Admin, Periode schreibbar, kein Ledger-Bezug, `document_type != storno` | gelöscht | Line Items gelöscht, R2-PDF best effort, Audit |
| erlaubte Originalzustände | Korrektur anlegen | Admin, Periode schreibbar, Original in `label_approved`/`artist_notified`/`viewed`/`invoiced`/`acknowledged` | neuer `draft` `document_type=correction`, `correction_of_id`, `version+1` | R2-PDF; Audit |
| `draft` (Korrektur) | Korrektur freigeben | wie Freigabe | `label_approved`; Original → `superseded` | Ledger `correction` nur mit Delta ≠ 0 (|Δ| ≥ 0,005 EUR); Audit |
| `label_approved`…`invoiced` | Zahlungseingang auf verknüpfter Rechnung | Admin, Periode schreibbar | `paid`, wenn Rechnung `paid` | Ledger, Notification, Audit (§E) |

### A.4 Invoice transitions and delivery separation

Zielmodell (#621/#623): **Dokument-/Finanzstatus** (`status`) und **Zustellung**
(`delivery_status`) sind getrennte Informationen.

| `status` | Erlaubte Übergänge | Bedingung |
|---|---|---|
| `draft` | → `sent`, → `cancelled` | `sent` nur wenn `pdf_url` gesetzt und (`delivery_status='sent'` oder Versand ausdrücklich nicht angefordert) |
| `sent` | → `received`, → `partially_paid`, → `paid`, → `cancelled` | Teilzahlung setzt `partially_paid`; Vollzahlung `paid` |
| `received` | → `partially_paid`, → `paid`, → `cancelled` | — |
| `partially_paid` | → `partially_paid` (weitere Teilzahlung), → `paid`, → `cancelled` | Überzahlung wird abgewiesen |
| `paid` | terminal | keine Rückstufung |
| `cancelled` | terminal | keine Zahlung mehr möglich |

`delivery_status`:

- `not_sent`: kein Versand versucht.
- `sent`: Provider (Resend) hat den Versand bestätigt.
- `failed`: Versand fehlgeschlagen; Fehlergrund gespeichert; Wiederholungsaktion vorhanden. Label-UI (Settlement-Register, `/admin/invoices`) MUSS diesen Zustand sichtbar machen, unabhängig vom Finanzstatus.

MUSS-Regeln:

1. `status='sent'` wird erst nach Providerbestätigung gesetzt. Die Erstellung
   startet mit `delivery_status='not_sent'`; ein Mailfehler führt zu `draft` +
   `delivery_status='failed'` mit Fehlergrund und bleibt wiederholbar.
2. Mailfehler rollt weder Rechnung noch PDF zurück. Sie setzt `delivery_status='failed'`
   und ist gezielt wiederholbar.
3. Das PDF MUSS ausschließlich aus dem persistierten Rechnungsstand erzeugt werden
   (Zeilensummen, Empfänger, Nummer, Steuersatz, Fälligkeit, FX-Hinweis aus der
   DB-Zeile). Der Recovery-Pfad nutzt denselben Stand; Werte aus dem
   Wiederholungs-Request dürfen das Dokument nicht verändern.
4. Jede Einreichung führt einen clientseitigen `operation_id` (einmal je Versuch
   erzeugt, bei Retry wiederverwendet) in `settlement_operations`: gleiche ID +
   gleicher Payload = Replay der bestehenden Rechnung; gleiche ID + anderer
   Payload = 409; nach Teilfehler wird der Vorgang fortgesetzt statt dupliziert.
5. `received` ist ein Eingangsnachweis. Eine Zahlung darf `received_at`/`received_by`
   einmalig nachtragen (IST, dokumentiert), aber `received` nie zurücknehmen.
6. Artist-PATCH auf `paid` ohne Ledger, `paid_at` und Statement-Folge ist unzulässig.
    `PATCH /api/portal/invoices/{id}` erlaubt nur noch `cancelled` auf `draft`
    ohne Zahlung; `paid`/`sent` gehen über Admin-Zahlung bzw. Deliveries (#629).

### A.5 Settlement periods, carry-forward, archive

| Ausgangszustand | Aktion | Voraussetzungen | Ergebnis | Nebenwirkungen |
|---|---|---|---|---|
| beliebig | Periode anlegen (`getOrCreateSettlementPeriod`) | valide DATE-Grenzen | `open` (idempotent je Grenzen) | — |
| `open`/`under_review`/`approved` | Sperren | Admin, nicht `archived` | `locked` + `locked_at/by` | Audit; idempotent bei bereits `locked` |
| nicht `archived` | Archivieren | Admin; **keine** vorherige Sperre nötig (IST) | `archived` + `archived_at/by` | Statements `is_archived=true`; Audit; final |
| `archived` | jede Mutation | — | abgelehnt | 409 `SettlementPeriodNotWritableError` |

MUSS-Regeln:

1. Schreibbar sind exakt `open`, `under_review`, `approved`
   (`isPeriodWritable`, `settlementPeriods.ts:209-211`). Diese Prüfung MUSS für **alle**
   Finanzmutationen gelten, auch `POST /api/admin/sos/persist-analytics`
   (`persistSosAnalyticsCore`, wirft `SettlementPeriodNotWritableError` → 409) und
   `POST /api/admin/maintenance/purge-sos-data` (`assertSosPurgeAllowed` blockiert
   Sperrperioden-Daten → 409 `SETTLEMENT_PERIOD_LOCKED`).
2. `archiveSettlementPeriod` MUSS den Fehler der `sales_statements.is_archived`-Aktualisierung
   auswerten und bei Retry nach Teilerfolg heilen (statt früh zurückzukehren).
3. Periodenabschluss (Carry-out, `period_carry_forwards`, nächste Periode, Carry-in,
   Archivierung) MUSS atomar und idempotent sein: bei Retry genau ein Carry je
   `(from_period, artist)`; kein halb archivierter Zustand (#628).
4. `period_carry_forwards.applied_at` MUSS gesetzt werden, sobald der Carry angewendet ist
   (umgesetzt in #628, `settlementRegister.ts:258-286`).
5. `recordStatementView` und Downloads bleiben in gesperrten Perioden erlaubt.

### A.6 Import batch states

`uploaded → processing → completed | failed`. MUSS: `file_hash` wird ausschließlich beim
Confirm nach SHA-256 des endgültigen R2-Objekts persistiert; aktive Hashes sind eindeutig;
identische Datei wird wiederverwendet statt erneut verarbeitet; `failed` gibt den Hash für
einen Retry frei; Wiederholungen erzeugen keine doppelten Umsätze (#618/#631).

Jeder Bronze-Upload erhält vor der Registrierung eine stabile UUID `operation_id`. Ein Retry
desselben Dateivorgangs verwendet dieselbe ID. Registrierung und Bestätigung sind dadurch
wiederholbar, ohne einen zweiten Batch anzulegen. Die Batch-Zeile speichert
`multipart_upload_id` und `multipart_started_at`, bevor die Init-Antwort an den Browser geht.
Fehler und Batch-Löschung brechen bekannte Multipart-Sitzungen ab. Der vollständige R2-Scan
bricht verwaiste Sitzungen ab, die älter als 24 Stunden sind, und zeigt die Anzahl im
Speicherbericht.

Presigned PUTs schreiben nur auf den temporären Schlüssel der Batch-Zeile. Confirm kopiert
die Bytes auf einen endgültigen Schlüssel, prüft dessen SHA-256 und aktualisiert erst danach
`r2_key`, `file_hash` und `status` gemeinsam. Alte URLs können den temporären Schlüssel
ändern, nicht das bestätigte Archiv. Ein fehlgeschlagener Confirm lässt den Batch
wiederholbar und `uploaded`.

### A.7 Fehlersemantik (HTTP)

| Klasse | Status | Body |
|---|---|---|
| Eingabe ungültig (Zod, Periode, Datum) | 400 | problem+json |
| nicht authentifiziert | 401 | problem+json |
| nicht berechtigt | 403 | problem+json |
| nicht gefunden | 404 | problem+json |
| Voraussetzung verletzt (Status, gesperrte Periode, Überzahlung, Betragsabweichung) | 409 oder 422 | problem+json mit konkretem Grund |
| Konflikt (paralleler Statuswechsel, Revision) | 409 | problem+json |
| Serverfehler | 500 | generisch, Details nur im Log |

DAL-Fachfehler nutzen `BusinessRuleError` (`src/lib/errors.ts`) mit 404/409/422;
`withErrorHandler` emittiert `application/problem+json` (`type/title/status/detail`) und
behält `error`/`code` als Legacy-Extensions. REST-Konvention:
`skills/rest-guidelines/SKILL.md`.

### A.8 Invarianten (verbotene Fälle)

1. Keine Rückstufung von `paid`, `superseded`, `cancelled`; kein Unpay/Unlock.
2. Kein `statement_payout` ohne freigegebenes Statement; kein zweiter Payout je Statement
   (Idempotenz über Ledger-Referenz).
3. Kein `sent` ohne gespeichertes PDF; kein Mailversand ohne gespeicherten Rechnungsstand.
4. Keine Zahlung auf `draft`, `cancelled` oder über den Bruttobetrag hinaus; keine
   stillschweigende Teilzahlung als Vollzahlung.
5. Keine Ledger-Buchung ohne `reference_type`/`reference_id`.
6. Keine Archivierung ohne vollständigen Carry-forward-Zustand.
7. Keine erfundenen Ansichts-/Versand-/Zahlungszeitpunkte.
8. Keine stillen Ersatzwerte für Periode, Betrag oder Zahlenformat.
9. Keine Mutation in `locked`/`archived` Perioden außer Ansicht/Download/Audit.

---

## §B Screen and interaction contract

Owner issues: #624, #625. Mirror into #624/#625/#622.

### B.1 Informationsarchitektur

Ein Ablauf: **1 Dateien → 2 Beträge → 3 Statements** (inkl. SEPA). Regeln bleiben
erreichbar; Auswertungen (Archive, Portal, Trends) liegen außerhalb des Geldwegs.
Nach Freigabe wird dieselbe Abrechnung direkt zur Rechnungs-/Zahlungsbearbeitung
geöffnet; kein erneuter Wizard. Moduswahl Quick/Assistant/Advanced entfällt
(`/admin/accounting` öffnet den Arbeitsbereich direkt; Periode auf Dateien).
Vorschau/Excel dürfen ohne vollständiges Bronze-Archiv laufen; das Anlegen eines
Statement-Entwurfs nicht.

### B.2 Ansichten

Jede Ansicht hat genau **eine primäre Aktion**; weitere Aktionen liegen unter „Mehr“.
PDF-/Rechnungslinks bleiben direkt erreichbar.

| Ansicht | Immer sichtbar | Sekundär/aufgeklappt | Primäraktion |
|---|---|---|---|
| Abrechnungen | Zeitraum, Status, Künstlerzahl, offene Aufgaben, letzte Änderung | Suche, Statusfilter, archivierte Vorgänge | Neue Abrechnung |
| Dateien | Zeitraumwahl (verbindlich), ein Uploadbereich, je Datei Name/Quelle/Zeilen/Speicherstatus | Quelldetails, Zeitraumabweichung, Datei entfernen | Daten prüfen |
| Prüfung | Blockerzahl, betroffene Quelle/Künstler, Betrag soweit bestimmbar, konkrete Reparatur | bestandene Prüfungen, bewusst ausgeschlossene Zeilen | Beträge prüfen |
| Beträge | Künstler, Periodenertrag, Vortrag, rechnerischer Gesamtbetrag, Prüfstatus | Quellen, Splits, Kosten, manuell, Belegzeilen | Statements vorbereiten |
| Statements | Auswahl, Künstler, Dokumentstatus, Betrag, Vorschau/Download | Exportoptionen, Freigabehistorie | Ausgewählte freigeben |
| Nach Freigabe | Künstler, Statement, tatsächliche Ansicht, Rechnung, offener Rechnungsbetrag, nächste Aktion | Verlauf, Versanddetails, Korrekturen | kontextabhängig |
| Einstellungen | effektiver Wert je Regel + Herkunft | Nur diese Abrechnung / Als Standard speichern | Speichern |
| Korrektur | Originalbetrag, korrigierter Betrag, Differenz, betroffene Rechnung, Sperre, Begründung | Positionen/Überleitung | Korrektur freigeben |
| Sammelaktion | Anzahl und Umfang der Auswahl vor Ausführung | Einzelergebnisse nach Ausführung | Ausführen |

Regeln:

1. Auswahlkennzahlen („n ausgewählt“, Summen) beziehen sich auf **ausgewählte** Zeilen,
   nicht auf die sichtbare Seite. „Alle auswählen“ betrifft die aktuelle Seite; „alle
   gefilterten Treffer“ ist eine eigene Aktion mit Gesamtzahl.
2. Zeilen behalten stabile IDs über Sortierung/Filterung.
3. Die Settlement-Ansicht MUSS auch ohne hochgeladene Dateien aus der DB öffnen
   (Register + Payout/SEPA bei gesetzter Periode; CSV-Session ist nicht Voraussetzung).
4. Der manuell gewählte Zeitraum ist die verbindliche Abrechnungsperiode und MUSS in
   allen Ansichten sichtbar sein (Periodenfelder auf Dateien, Banner bei gesetzter Periode).

### B.3 View states (für jede Ansicht verbindlich)

| Zustand | Pflichtverhalten |
|---|---|
| Laden | Skeleton passend zur Ansicht; keine irreführende Nullsumme |
| Leer | Grund sichtbar + nächste Aktion (Neue Abrechnung / Dateien hinzufügen / Filter zurücksetzen) |
| Lesefehler | Fehler sichtbar, Daten nicht als leer tarnen, „Erneut laden“ |
| Teilfehler | erfolgreiche Daten bleiben sichtbar; betroffene Datei/Zeile markiert; gezielter Retry |
| Speichern | dauerhafter kompakter Zustand; Toast nur zusätzliche Rückmeldung |
| Gesperrt/archiviert | lesbar, Downloads verfügbar; Bearbeitungsaktionen mit sichtbarem Grund |
| Kein Zugriff | klare Meldung ohne fremde Dokumentdetails |
| Veraltete Revision | Hinweis + „Neu prüfen“; keine Freigabe alter Revision |

Ladefehler werden nicht als leere Liste getarnt: Settlement-Register, Bronze-Archive, Payout/SEPA, Trends, Portal-Statements und Portal-Rechnungen zeigen den Fehler mit Retry.

### B.4 Sammelaktionen

1. Vorher: Anzahl + Umfang (z. B. Summe) anzeigen.
2. Nachher: pro Element Erfolg/Fehler ausweisen.
3. Retry nur für fehlgeschlagene Elemente; keine doppelte Buchung/Freigabe.
4. Berechtigungen gelten pro Element (§D).
5. Teilfehler dürfen bereits erfolgreiche Elemente nicht erneut ausführen.

### B.5 Darstellung und Barrierefreiheit

- Primäre Tabellen-/Formtexte ≥ 14px; Geldbeträge rechtsbündig, lokal mit Währung.
- Bedeutung nie nur über Farbe.
- Touchziele ≥ 44px; sichtbarer Tastaturfokus.
- Bei 390px Breite maximal eine notwendige horizontale Scrollfläche je Ansicht;
  aufklappbare Künstlerdetails statt abgeschnittener Bedienung.
- 200% Zoom ohne Verlust wesentlicher Aktionen.
- Kein Auto-Advance nach Upload; Fehlerfokus auf die erste betroffene Stelle.
- Keine doppelten Coach-/Playbook-/Alert-Blöcke mit derselben Information.
- WCAG 2.1 AA (AGENTS.md); Scroll-/Overlay-Regeln aus `AGENTS.md` und
  `docs/agent/frontend.md` gelten.

---

## §C Change-consequence and invalidation contract

Owner issues: #616, #617, #618, #620, #631. Mirror into those issues.

### C.1 Begriffe

- **Verkaufsdatum** (`sales_month`): Herkunftsinformation aus der Quelle.
- **Berichtszeitraum** (`source_reporting_period`): Zeitraum, den ein Bericht abdeckt.
- **Abrechnungsperiode** (`period_id`, `period_start`, `period_end`): verbindliche,
  validierte Identität des Vorgangs. Manuelle Wahl schlägt Erkennung.
- **Revision**: Stand aus Regeln, Kursen und Quellbatches, der in ein Dokument eingeflossen
  ist. Eine Revision ist entweder `aktuell` oder `veraltet`.

### C.2 Matrix: Eingabeänderung → Pflichtfolge

| Eingabeänderung | Betroffene Ergebnisse | Pflichtfolge |
|---|---|---|
| Datei hinzugefügt | Berechnung, Prüfung, Beträge, Entwürfe | Neu parsen/verarbeiten; Prüfung neu bewerten; betroffene Entwürfe als veraltet markieren; Quellenzuordnung aktualisieren |
| Datei entfernt | Berechnung, Prüfung, Beträge, Quellenzeilen | Ergebnisse invalidieren; Entwürfe nicht mehr freigebbar, bis neu geprüft; Archiv unberührt lassen; Hinweis mit Quelle |
| Datei ersetzt (gleicher Name/ID) | alles | **Erneut parsen** (`planCsvWorkerFileSync`: gleiche ID mit neuem Inhalt → remove + add) |
| Split/Kosten/manuelle Einnahme geändert | Beträge, Dokumente | Neu berechnen; Entwürfe veraltet; freigegebene Dokumente unverändert |
| Künstlermapping/Alias geändert | Zuordnung, Beträge | Neu berechnen; uneindeutige Namen nie automatisch zuordnen |
| Compilation-Filter geändert | Beträge | Neu berechnen; Entwürfe veraltet |
| CSV-Profil/Quellenformat geändert | Parsing | Rohdaten erneut prüfen; Prüfung neu bewerten |
| Abrechnungsperiode geändert | Workspace, Export, Settlement, Vorträge, SEPA | Verbindliche Periode neu auflösen; Workspace der neuen Periode laden; Carry-forward neu abfragen; keine alten Antworten übernehmen |
| Preset/Standard geändert | zukünftige Vorgänge | Laufender Vorgang nur über ausdrückliche Aktion mit Vorher/Nachher-Vorschau |
| Quelle nach Freigabe geändert | freigegebenes Dokument | Dokument bleibt unverändert; Korrekturworkflow (§A.3); Revision als veraltet anzeigen |

### C.3 Snapshots freigegebener Dokumente

1. Jedes freigegebene Statement MUSS seinen Berechnungsstand nachvollziehbar tragen:
   Regeln/Fingerprint, verwendete Kurse, Quellbatch-IDs, `period_id`, Betrag,
   Line Items, Dokument-Hash. Die Felder (`rules_fingerprint`, `fx_snapshot`,
   `calculation_snapshot`, `revision`) werden beim Veröffentlichen aus demselben
   verbindlichen Zeitraum und Ergebnisstand gefüllt, den Export und Buchung nutzen.
2. Rundung: Beträge werden in voller Gleitkommapräzision aggregiert und genau
   einmal an der Buchungs-/Formatgrenze (DB `NUMERIC(10,2)`, Anzeige) gerundet —
   keine zeilenweise Cent-Rundung (100.000 × 0,00001 EUR = 1 EUR).
2. Ein freigegebenes Dokument wird nie still neu berechnet oder überschrieben.
3. Die Portal-Ansicht liefert das gespeicherte PDF, nie eine Neuberechnung (IST).
4. Excel/SEPA sind Ableitungen; sie dürfen jederzeit neu erzeugt werden, müssen aber den
   gespeicherten Stand verwenden, wenn sie freigegebene Daten darstellen.
5. Die Vorschau im Generator ist ausdrücklich **nicht** freigegeben und trägt keinen
   Dokumentstatus.

### C.4 Überlappende Quellen

1. Identischer bestätigter Datei-Hash: vorhandenen Import wiederverwenden, keine neuen
   Umsätze.
2. Eindeutige Provider-Transaktions-ID: `(Quelle, Konto, ID)` ist die Geschäftsidentität.
   Wiederholung wird übersprungen und nachgewiesen; gleiche ID mit anderem Betrag ist ein
   Korrekturkonflikt (nicht still überschreiben, nicht doppelt buchen).
3. Ohne stabile ID: ähnliche Zeilen/überlappende Zeiträume nur als mögliche Überschneidung
   anzeigen; keine globale `Set(JSON.stringify(row))`-Dedupe, die legitime Verkäufe löscht.
4. Nutzerentscheidung in der Prüfung: „ergänzende Quelle“ oder „Ersatz für Bericht X“ mit
   Begründung und Dateireferenz; Entscheidung wird gespeichert.
5. Ersatz nur bei nicht freigegebenem Vorgang sofort neu berechnen; danach Korrektur.
6. Shopify/Printful sind komplementär (Erlös vs. Kosten), keine Duplikate; mehrere
   Kosteneinträge derselben Bestellung werden summiert, nicht per `Map.set(last)`
   überschrieben.
7. Source lineage (Datei, Zeilenposition, Provider-ID) bleibt über Alias- und
   Split-Verarbeitung erhalten.

### C.5 Nebenläufigkeit und veraltete Antworten

1. Finanzmutationen sind nie Last-write-wins. Statuswechsel nutzen bedingte Updates
   (`.eq('status', expected)`), Zahlungen laufen über eine Transaktion/RPC (§E).
2. Ladevorgänge (Workspace, Register, Listen) MÜSSEN Anfragen sequenzieren oder abbrechen;
    eine verspätete Antwort für Periode A darf Periode B nicht überschreiben
    (`periodLoadSeqRef`, Register-`refreshSeqRef`).
3. Worker-Ergebnisse tragen eine Sequenz; nur das Ergebnis der letzten Konfiguration darf
    angewendet werden (`process` `requestId` / `processSeqRef`).
4. Änderungen an `bronze_batch_ids` sind Workspace-Änderungen und werden ebenfalls
   gespeichert. Statements werden erst erstellt, wenn das serverseitige Workspace-Manifest
   jede übermittelte Quelle enthält und jeder Batch `completed`, gehasht und für den Zeitraum
   relevant ist. PDF-only-Statements übermitteln keine Quellen.
5. Bei Konflikt gewinnt der Serverzustand; die UI zeigt „Neu laden“ statt zu raten.

### C.6 Persistenz und Fortsetzen

| Zustand | Speicherort | Überlebt Reload |
|---|---|---|
| Einstellungen/Regeln je Periode (inkl. Manual/Ausgaben/Ignore) | `sos_accounting_workspaces.config` | ja |
| Standard-/Namens-Preset (ohne Perioden-Einmalposten) | `sos_rules_presets` | ja |
| Bronze-Archiv + Hash + `operation_id` + aktive Multipart-ID | `distributor_import_batches` + R2 | ja |
| Datei-Metadaten (Name, Zeilen, `bronzeBatchId`) | IndexedDB je Quelle | ja |
| Roh-CSV, Parse-Zustand, Worker-Cache | Speicher | nein (Re-Upload oder Bronze-Load) |
| Berechnete Ergebnisse | Speicher | nein |
| Workspace `bronze_batch_ids` | DB | ja; wird gelesen und als „Archivierte Quellen laden“ angeboten |
| Workspace `revision` | DB | ja; optimistische Nebenläufigkeit (409 bei veralteter Revision) |
| Wizard-Schritt, Auswahl, Dialoge | Speicher | nein (bewusst) |

MUSS-Regeln:

1. Nach Reload MUSS der Vorgang mit Zeitraum, Dateien (Metadaten + Bronze-Verweis),
   Einstellungen und Fortschritt fortsetzbar sein; der Nutzer erhält eine ausdrückliche
   Wiederaufnahme-Aktion.
2. Ungespeicherte Zustände dürfen nicht wie gespeicherte aussehen: Dirty-Anzeige +
   ausdrückliche Bestätigung vor Verwerfen/Neuladen.
3. Automatischer Periodenwechsel darf lokale ungespeicherte Änderungen nicht still
   überschreiben: dirty Periode A wird gespeichert, bevor Periode B geladen wird.

---

## §D Permissions matrix

Owner issue: #629. Mirror into #629.

### D.1 Rollen

`admin`, `editor`, `journalist`, `artist`, `user` (`src/types/users.ts`). SOS-Abrechnung ist
ein Finanzbereich: alle Finanzmutationen sind **admin-only**, sofern kein ausdrückliches
granulares Recht eingeführt wird. `editor` darf keine Beträge, Freigaben, Korrekturen,
Zahlungen oder Periodenabschlüsse ausführen.

### D.2 Action matrix

| Aktion | admin | editor | artist (Mitglied) |
|---|---|---|---|
| Abrechnung/Workspace lesen | ja | nein | nein |
| Dateien hochladen/archivieren | ja | nein | nein |
| Beträge/Regeln ändern | ja | nein | nein |
| Statement freigeben/benachrichtigen | ja | nein | nein |
| Statement-Entwurf löschen | ja | nein | nein |
| Korrektur anlegen/freigeben | ja | nein | nein |
| Periode sperren/archivieren | ja | nein | nein |
| Zahlung erfassen | ja | nein | nein |
| SEPA erzeugen | ja | nein | nein |
| Gold/Analytics persistieren | ja | nein | nein |
| Eigenes Statement ansehen | ja | nein | ja (nur eigenes, nur sichtbare Status) |
| Eigene Rechnung anlegen | — | — | ja (nur eigenes Statement, Betrag muss stimmen) |
| Eigenes PDF/Quell-CSV laden | ja | nein | ja (nur eigenes, Token/Stream) |
| Freie Rechnung (ohne Statement) | ja | nein | nein |

IST-Abweichungen, die #629 MUSS bereinigen:

1. Erledigt: `uploadStatement` erzwingt admin-only über `canPublishStatement`
   (`src/lib/sos/statementPublishAccess.ts`); alle Admin-SOS-Routen sind einheitlich.
2. `ADMIN_ONLY_PATH_PREFIXES` in `src/lib/rbac/routeRegistry.ts` ist ungenutzt.
3. Es existiert kein SOS-Finanzrecht (`can_manage_accounting` o. ä.) — entweder bewusst
   admin-only lassen und das testen, oder ein Recht einführen. Kein stiller Sonderweg.

### D.3 Dokumentzugriff

| Dokument | Mechanismus | Laufzeit | Anforderung |
|---|---|---|---|
| Rechnungs-PDF per Mail | HMAC-Token `/api/invoices/{id}/pdf?token=` | 30 Tage (IST) | Token bindet an Rechnung; nicht an Empfänger. Widerruf/Rotation dokumentieren; #629 prüft Missbrauchsgrenzen |
| Rechnungs-PDF admin | 10-min presigned URL | 600 s | admin-only |
| Rechnungs-PDF portal | 10-min presigned URL | 600 s | Mitglied + eigener Datensatz |
| Statement-PDF portal | Server Action, presigned URL | 300 s | Mitglied, Status nicht `draft`/`superseded`/`cancelled` |
| Statement-PDF admin | 10-min presigned URL `GET /api/admin/sales-statements/{id}/pdf` | 600 s | admin-only; auch Entwürfe/Storno mit vorhandenem R2-Objekt; kein View-Tracking |
| Quell-CSV portal | servergestreamt | Session | Mitglied + Status-Allowlist + `file_hash` |
| Bronze-CSV admin | presigned GET für den Browser (`…/presign-download`) | 300 s | admin-only; R2-Bucket-CORS erforderlich (Architekturentscheidung #618: Direktstrecke Browser → R2) |

### D.4 Sammelaktionen

Jede Sammelaktion prüft Berechtigung und Voraussetzungen pro Element. Ein globaler
Admin-Check genügt für die Autorisierung, nicht für die fachliche Voraussetzung. Vor
Ausführung werden Anzahl und Umfang angezeigt; danach Einzelergebnisse (§B.4).

---

## §E Payments and existing data

Owner issues: #628, #630. Mirror into #628/#630.

### E.1 Zahlungsregeln

1. Zahlung erfolgt gegen den Rechnungs**brutto**betrag (Netto + gerundete Steuer,
   `invoiceGrossCents`).
2. Teilzahlungen sind erlaubt; Überzahlung wird abgewiesen (422/409 mit konkretem Grund).
3. `paid` nur bei `paid_amount_cents >= gross`; dann `paid_at`/`paid_by` setzen.
4. Zahlungen sind read-modify-write-frei: die RPC `record_invoice_payment`
   sperrt die Rechnungszeile (`FOR UPDATE`), prüft Status und Bruttogrenze und
   schreibt Bezahlt/Offen/Status in einer Anweisung; zwei parallele Zahlungen
   30 + 20 auf 100 ergeben 50 bezahlt / 50 offen und zwei Ereignisse.
5. Jede Finanzoperation erhält eine dauerhafte `operation_id` in
   `settlement_operations` (Client-Key, kein 24h-TTL). Gleiche ID + gleicher
   Payload = Replay; gleiche ID + anderes Ziel/Betrag = 409.
6. Ein fehlgeschlagener Folgeschritt (Ledger, Statement, Audit, Notification)
   wird als Warnung geführt und darf die Zahlung weder zurückrollen noch den
   Idempotenzschlüssel freigeben; der Vorgang wird mit der Rechnungs-ID
   abgeschlossen, ein Retry addiert die Zahlung nicht erneut.
7. Ledger: `payment`/`partial_payment` nur, wenn keine `invoice_liability` besteht (IST);
   bei verknüpften Rechnungen wird die Verbindlichkeit netto gebucht, Zahlungen werden
   gegen brutto geprüft. Die Differenzbehandlung (VAT) MUSS in #628 dokumentiert und
   getestet werden; keine zweite Belastung.
8. `cancelled`/`draft`/`paid` erhalten keine neue Zahlung; Null/negativ/NaN/Infinity werden
   abgewiesen.
9. Fremdwährung wird nie als EUR-Betrag ausgegeben; nicht unterstützte SEPA-Währung sperrt
   den Zahlungsweg.

### E.2 SEPA

1. Eine erzeugte SEPA-Datei bedeutet **nicht** „bezahlt“.
2. SEPA-Aufträge werden als gespeicherter Auftrag mit dokumentierter Auswahl und
   eindeutigen `MsgId`/`EndToEndId` erzeugt; erneuter Download desselben Auftrags liefert
   identische IDs und Beträge.
3. Änderungen erzeugen eine neue Version mit Warnung vor doppelter Bankeinreichung.
4. `ControlSum` ist die Summe der tatsächlich gerundeten Einzelbeträge; XML wird mit einem
   echten Parser auf Wohlgeformtheit geprüft; Freitext wird vor dem XML-Escaping begrenzt.
5. Zahlungsbereite Rechnungen und Ledger-Saldo werden übergeleitet, nicht blind
   gleichgesetzt (#628).

### E.3 Bestandsdaten: Audit und Reparatur

1. Read-only-Auditor mit maschinenlesbarem und verständlichem Report; Kategorien:
   fehlende/verwaiste `period_id`, abweichende Statement-/Invoice-Künstler, Rechnung ohne
   PDF, PDF ohne Datensatz, unbestätigter Archivbatch, Hash-/Größenabweichung, doppelte
   Fachoperation, fehlendes/mehrfaches `carry_in`, Ledger-/Rechnungssaldoabweichung,
   fehlender View-/Mailnachweis.
2. Dry-run ist Standard und verändert 0 Zeilen/Objekte. Reparaturplan nennt erwartete
   Vorzustände und begründete neue Werte; eindeutige, unklare und nicht automatisch
   reparierbare Fälle sind getrennt.
3. Nur nachgewiesene eindeutige Zuordnungen werden automatisch repariert;
   Namensähnlichkeit allein reicht nicht; unbekannte Vergangenheitszeitpunkte werden nicht
   erfunden.
4. Anwendung pro kohärentem Vorgang transaktional/idempotent und auditiert; Stop bei
   geändertem Vorzustand. Kein `reset.sql` gegen Produktion, kein massenhaftes Löschen.
5. Vor Anwendung: Wiederherstellung der betroffenen Zeilen und referenzierten Objekte in
   einer getrennten Testumgebung erproben; Restore-Nachweis (Referenzen, Summen,
   Dokument-Hashes) im PR.

Umsetzungsstand (#630): Read-only-Auditor, Dry-run-Reparaturplan und idempotente Anwendung
sind umgesetzt (`settlementAuditCore.ts`, `settlementRepair.ts`,
`GET /api/admin/sos/settlement-audits`, `POST /api/admin/sos/settlement-repairs`,
`/admin/accounting/data-audit`); jeder Schritt wird auditiert, ein Restore-Artefakt wird
im `settlement_operations`-Journal gespeichert. Ausstehender Betriebsnachweis: Live-R2-
Prüfungen (Hash/Größe, PDF ohne Datensatz — Detektoren nehmen Ergebnisse injiziert
entgegen) sowie die Restore-Übung in einer getrennten Testumgebung mit Produktionsdaten
(Runbook in `ADMIN.md`).

---

### AI import profile guidance

The upload path is deterministic for known system and confirmed custom profiles.
Unknown CSV formats are sampled from a maximum 256 KiB local Blob slice,
and only headings and the first three rows can reach the optional AI endpoint.
XLSX previews are parsed locally, never uploaded in full for AI analysis.
The AI has no import tool and cannot modify accounting data or rules.
Its profile proposal must be edited/confirmed by an admin before being saved.
Confirmed profiles are matched by normalized structural header fingerprint and
their mappings are applied inside the CSV worker. Updating a profile invalidates
cached parses. A disabled/unavailable AI service retains manual mapping.

## §F Performance contract

Owner issues: #619, #626. Mirror into #619/#626.

### F.1 Referenzlast

| Last | Datei/Umfang |
|---|---|
| Believe Q4 2025 | `test data/Believe_Q4_2025.csv` (60,72 MB) |
| Believe Q1 2026 | `test data/Believe_Q1_2026.csv` (68,36 MB) |
| Bandcamp | `test data/20251001-20260331_bandcamp_raw_data_darkTunes.csv` (2,29 MB) |
| Darkmerch | `statement of sales examples/…/Darkmerch_Q4_2025-Q1_2026.xlsx` |
| Viele Vorgänge | synthetisch: 50 Abrechnungen, 100 Künstler, 20 Rechnungen je Vorgang |
| Kleiner Export | Bandcamp + Darkmerch der Referenzperiode |

Die Referenzdateien sind **nicht** im Repository zu committen (Testdaten-Verzeichnis
bleibt untracked; Ablage und Zugriff werden in #626 dokumentiert).

Darkmerch-Reportzeiträume (z. B. `Q4 2025 - Q1 2026` oder `Q2 - Q3 2026`)
sind Dateiprovenienz, keine einzelnen Verkaufsmonate. Sie werden aus der
DATE-Spalte auch dann ermittelt, wenn die Datumszeile keinen Umsatz enthält.
Fehlen die Metadaten nach der Worker-Verarbeitung, kann der Bronze-Archivweg
sie aus den noch geladenen Quelldaten zurückgewinnen. Für übersprungene
Archive ist Retry sichtbar. Dateiname und aktueller Monat sind keine
zulässigen Ersatzquellen für einen Abrechnungszeitraum.

### F.2 Budgets (verbindliche Abnahmeziele, endgültige Werte werden in #626 gemessen)

| Vorgang | Budget |
|---|---|
| Import + Verarbeitung beide Believe-Dateien | ≤ 120 s p95 auf Referenzgerät |
| Peak-Browser-Speicher Import | ≤ 2,0 GB |
| Excel-Export Referenzperiode | ≤ 90 s p95, abbrechbar |
| PDF je Künstler | ≤ 10 s p95 |
| Listenladen (50 Vorgänge/100 Künstler) | ≤ 2 s p95 |
| Sammelaktion 200 Einträge | ≤ 60 s mit Einzelergebnis je Eintrag |
| UI-Blockade | keine Long Task > 500 ms ohne Yield während Import/Export |
| Parallelität | max. 1 Excel-Build, Bronze-Uploads laufen streng seriell (eine Warteschlange, `enqueueBronzeArchive`) |

Bestehende harte Grenzen bleiben: 1,5 Mio. Rohzeilen (Excel-Abbruch), 1 Mio. Zeilen je
Sheet, 500 Breakdown-Zeilen je PDF, 5-min-Worker-Timeout, 1 GB maximale Bronze-Datei,
32 MB Single-PUT, 16 MB Direkt-Multipart-Teile (Nicht-Endteile ≥ 5 MiB) und ein
Server-Proxy-Einzelrequest ≤ 4 MB ohne Multipart (`src/lib/sos/bronzeUploadLimits.ts`).
Jeder direkte PUT wiederholt sich bis zu 4-mal mit frisch signierter URL bei
Verbindungsabbruch oder abgelaufener Signatur.

### F.3 Diagnose und Instrumentierung

1. Jeder Import und Export erhält eine `operation_id` (UUID). Protokolliert werden
   Phase, Dauer, Datenmenge (Zeilen/Dateien), Ergebnis und Fehler — zusammen
   nachvollziehbar über Client-Log und `app_logs`.
2. Phasen sind sichtbar: Lesen, Parsen, Verarbeiten, Berechnen, Dokument erzeugen,
   Speichern, Versenden.
3. Fehlermeldungen nennen Datei/Zeile/Feld/Grund, keine Bankdaten und keine vollständigen
   Rohdateien in Logs.
4. Die Vorgangs-ID wird in UI, Log und (soweit vorhanden) Audit referenzierbar angezeigt.

Bronze-Uploads protokollieren Registrierung, Transfer und Confirm mit derselben
`operation_id`, Dauer, Dateigröße, Zeilenzahl und Ergebnis. CSV-Inhalte und Finanzzeilen
bleiben aus Logs ausgeschlossen. Ein Confirm-Fehler lässt die ID und den Batch für einen
idempotenten Retry bestehen.

### F.4 Abbruch und lange Aufgaben

1. Import/Export sind abbrechbar; ein Abbruch hinterlässt keinen halb gespeicherten
   Finanzzustand (Serveraktionen atomar, Clientzustand verwerfbar).
2. Ab einer definierten Grenze (Vorschlag: > 2 min erwartete Laufzeit, > 250 MB Eingabe
   oder > 1,5 Mio. Zeilen) MUSS der Lauf als gespeicherter Hintergrundauftrag mit
   Vorgangs-ID ausgeführt werden; die Entscheidung wird in #619/#626 anhand der Messungen
   belegt.
3. Große Tabellen (> 200 Zeilen) werden virtualisiert; keine unbegrenzten DOM-Listen
   (heute keine Virtualisierung vorhanden, #619).

---

## Umsetzungszuordnung

| Vertragsteil | Issues |
|---|---|
| §A Status/Aktion | #616, #621, #622, #623, #628 |
| §B Bildschirmzustände | #624, #625, #622 |
| §C Invalidierung/Überlappung | #616, #617, #618, #620, #631 |
| §D Berechtigungen | #629 |
| §E Zahlung/Bestand | #628, #630 |
| §F Leistung | #619, #626 |
| Freigabetor | #626 |

## Änderungshistorie

| Datum | Änderung |
|---|---|
| 2026-09-21 | Parse-Fehler gibt pending Parses frei; Replace löscht bronzeBatchId; Periodenwechsel setzt prev-Key synchron |
| 2026-09-21 | Datei-Replace gleicher ID wird neu geparst; Worker-Results sind seq-guarded; dirty Periode wird vor Periodenwechsel gespeichert |
| 2026-09-21 | Payout/SEPA und Periodenbanner ohne CSV-Session, sobald die Periode gesetzt ist |
| 2026-09-21 | Portal-Statements/-Rechnungen: Listen-Ladefehler sichtbar + Reload, nicht leere Empty-States |
| 2026-09-21 | Trends: Perioden-Summaries-Ladefehler sichtbar + Reload, nicht „Noch keine Daten“ |
| 2026-09-21 | Payout/SEPA: Ledger-Ladefehler sichtbar + Reload, nicht „Keine Auszahlungen“ |
| 2026-09-21 | Bronze-Archive: Ladefehler sichtbar + Refresh, nicht als leere Archive-Meldung |
| 2026-09-21 | Settlement-Register: Ladefehler sichtbar + Retry, nicht als leere Tabelle |
| 2026-09-21 | Ledger-`opening_balance` entfernt; Eröffnung ist `carry_in` |
| 2026-09-21 | Statement-`cancelled` ist nicht mehr erreichbar; Entwürfe werden gelöscht, kein Storno-Writer |
| 2026-09-21 | Status-Write-Konflikt (`PGRST116`/0 Zeilen) → 409 `STATEMENT_STATUS_CONFLICT`, nicht 500 |
| 2026-09-21 | Admin-Statement-PDF: `GET /api/admin/sales-statements/{id}/pdf` (presigned, 10 min) |
| 2026-09-21 | Label sieht `delivery_status=failed` im Settlement-Register und in `/admin/invoices` |
| 2026-09-21 | Portal-PATCH setzt kein `paid` mehr; nur Draft-Storno ohne Zahlungsbetrag |
| 2026-09-21 | Rechnungsversand: `POST /api/portal/invoices/{id}/deliveries` wiederholt fehlgeschlagenen Versand ohne neues PDF |
| 2026-09-21 | `label_approved` hat eine Wiederholungsaktion: `POST /api/admin/sales-statements/{id}/notifications` → bei Erfolg `artist_notified` |
| 2026-09-21 | Accounting-Tabs: Dateien → Beträge → Statements (SEPA dort) → Regeln; Auswertungen zuletzt. `payout`/`trends` Query-Parameter werden umgeleitet |
| 2026-09-21 | Default-/Namens-Presets speichern nur dauerhafte Regeln; Manual/Ausgaben/Ignore bleiben auf dem Perioden-Workspace |
| 2026-09-21 | Berechnung: Sampler bleibt in der Auszahlung; Ignorieren entfernt Zeilen; Track-Split nur bei 100 %; globale Believe/Bandcamp-Splits schlagen Künstler-Digital-% ohne `sourceOverrides`. Referenztests: `calculationReference.test.ts` |
| 2026-09-21 | Excel-Export: max. 1 Build; Raw ohne Worker-Blob nicht als Summary herunterladen; `inputRevision` verwirft veraltete Workbooks; ZIP abbrechbar |
| 2026-09-17 | Erstfassung auf Basis main `701155a3` (Review-Basis `5e2abf0a`); Status-/Aktionsvertrag, Bildschirmzustände, Invalidierung, Berechtigungen, Zahlungen, Leistung |
| 2026-09-24 | `record_invoice_payment`/`record_statement_view` sind service-role-only (REVOKE von PUBLIC/anon/authenticated, GRANT an service_role); Aufrufer nutzen den Service-Client (§D.3) |
| 2026-09-24 | Periodenabschluss idempotent: eine bereits archivierte Periode wird nicht erneut abgeschlossen, genau ein `carry_out` je `(from_period, artist)` (§A.5) |
| 2026-09-24 | Partieller Unique-Index `artist_settlement_ledger_carry_unique` auf Carry-Zeilen macht auch zwei gleichzeitige Abschluss-Requests idempotent (DB statt nur App-Logik) (§A.5) |
| 2026-09-24 | Rechnungsnummer (MAX+1) wird bei Unique-Kollision neu vergeben; Nummern-Constraint wird vom Statement-Index unterschieden (§A.4) |
| 2026-09-24 | `received` nur aus `sent` (§A.4) |
| 2026-09-24 | CSV-Parsing läuft echt gestreamt (Papa-Chunk statt vollständigem Row-Array); Carry-forward-Berechnung lädt je Periode gebündelt statt je Künstler (§F) |
| 2026-10-15 | Bronze-Uploads erhalten eine persistierte `operation_id`, begrenzte Request-Zeiten und serverseitige Quellenprüfung. Confirm prüft den Hash am endgültigen R2-Schlüssel. Multipart-IDs werden gespeichert und bei Fehler, Löschung oder stale R2-Scan abgebrochen. |
