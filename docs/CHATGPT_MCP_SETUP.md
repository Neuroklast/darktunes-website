# ChatGPT über OAuth 2.1 und MCP mit darkTunes verbinden

Stand: 28. Oktober 2026. Diese Anleitung gilt für die darkTunes-Website auf Next.js/Vercel mit Supabase Auth.

## Was diese Integration kann

* Der Remote-MCP-Server liegt unter `https://DEINE-DOMAIN/api/mcp` (Streamable HTTP, stateless).
* Supabase Auth ist OAuth-2.1-Authorization-Server. Die Website stellt die Consent-Seite `/oauth/consent`.
* Der Zugriff erfolgt **nur** mit einem echten, gültigen Supabase-OAuth-Token eines explizit freigeschalteten OAuth-Clients. Cookies, anon keys und service-role keys sind **keine** MCP-Anmeldedaten.
* Die vorhandenen internen AI-Werkzeuge werden nach dem angemeldeten Benutzer und dessen RBAC-Rechten und Künstlerzuordnungen freigegeben. Tools für Analytics, EPK, Veröffentlichungen, Support und Diagnostik behalten ihre bisherigen Rechte.
* Zusätzlich können Administratoren Redaktionseinträge `artists`, `news_posts`, `releases`, `concerts` lesen und Änderungen **vorschlagen**. Vorschläge landen in `mcp_editorial_requests`, nicht im Live-Inhalt.
* Redaktionelle Vorschläge werden in `/admin/mcp-requests` durch einen **MFA-verifizierten Admin** geprüft, angenommen oder verworfen. Es gibt kein automatisches Löschen oder Publizieren.
* `prepare_*`-Werkzeuge der bestehenden KI erstellen nur Bestätigungsvorschauen. Sie nehmen ihre Aktionen über MCP **nicht** eigenmächtig vor.

## 1. Supabase vorbereiten

1. Öffne **Supabase Dashboard → dein darkTunes-Projekt → Authentication → URL Configuration**.
2. Setze **Site URL** auf die **tatsächliche Produktionsdomain** (z. B. `https://darktunes.com`, ohne Pfad). Stelle sicher, dass die Website unter genau dieser Domain erreichbar ist.
3. Öffne **Authentication → OAuth Server** und aktiviere **OAuth 2.1 Server**.
4. Setze **Authorization Path** exakt auf `/oauth/consent`.
5. Empfohlen: Signatur auf **asymmetrische JWT Signing Keys (ES256/RS256)** umstellen, insbesondere wenn OIDC/`openid` benötigt wird. Bestehende Integrationen vor der Rotation prüfen.
6. Unter **Authentication → OAuth Apps** kann ein OAuth-Client für ChatGPT manuell angelegt werden. Verwende die **exakt** in ChatGPT angezeigte Callback-/Redirect-URI, keine vermutete URL und keine Wildcard. Lege den Client passend zur von ChatGPT verlangten öffentlichen oder vertraulichen Clientart an. Client Secret gehört nur in den OAuth-Einrichtungsdialog von ChatGPT, sofern benötigt.
7. Alternative: **Dynamic Client Registration** unter OAuth Server nur **vorübergehend** aktivieren, falls ChatGPT die eigene Clientregistrierung nutzen soll. Die Anwendung meldet sich zunächst an, bis der Client registriert ist. Anschließend seine `client_id` in Supabase unter OAuth Apps nachsehen und in Vercel freischalten. Die erste Zustimmung wird absichtlich verweigert, solange die `client_id` nicht freigeschaltet ist. Danach in ChatGPT die Verbindung neu starten. Dynamic Registration kann danach ausgeschaltet werden, wenn der Client registriert bleibt.
8. Richte für jedes Admin- oder Redakteurskonto **TOTP-MFA** ein und bestätige den Faktor. Auf der Consent-Seite wird AAL2 verlangt. Das Dialogfeld unterstützt eine authenticatorbasierte TOTP-Challenge. Künstlerkonten benötigen im aktuellen Code keine AAL2-Bestätigung für die Consent-Freigabe.

**Wichtig:** Normale Supabase-Redirect-URLs unter URL Configuration sind nicht dasselbe wie OAuth-Client-Callback-URIs. Letztere werden pro OAuth App festgelegt.

### Datenbankmigration

Führe die Datei `supabase/reset.sql` in der produktiven Datenbank aus. Möglich über den projektverknüpften Supabase-CLI-Migrationslauf (`supabase db push`) oder einmalig im SQL Editor, wenn die produktive Migrationsverwaltung danach sauber abgeglichen wird. Keine zweite Ausführung durch ein anderes Deploy-System ohne Abgleich.

Der Schema-Block legt an:
* `public.mcp_editorial_requests` mit RLS und ohne Zugriff für `anon`/`authenticated`.
* `public.mcp_review_editorial_request` als service-role-only RPC. Die Funktion prüft den Admin und prüft `updated_at` gegen den Stand bei Antragstellung. Änderungen und Review-Status werden innerhalb einer Datenbanktransaktion übernommen. Konflikte führen zu einem Fehler.

**Keine** service-role-, JWT- oder Datenbankschlüssel in ChatGPT eingeben oder im Quellcode committen.

## 2. Vercel Production konfigurieren

Unter **Vercel → Projekt → Settings → Environment Variables → Production** setzen:

```dotenv
DARKTUNES_MCP_ENABLED=true
DARKTUNES_MCP_PUBLIC_ORIGIN=https://darktunes.com
DARKTUNES_MCP_OAUTH_CLIENT_IDS=SUPABASE_OAUTH_CLIENT_ID
```

Ersetze die Domain durch die echte Produktionsdomain und `SUPABASE_OAUTH_CLIENT_ID` durch den **OAuth App Client ID** aus Supabase. Für mehrere explizit vertrauenswürdige Anbieter können IDs kommasepariert eingetragen werden. Keine Wildcards verwenden. Ein leeres `DARKTUNES_MCP_OAUTH_CLIENT_IDS` erlaubt keinen Zugriff.

Folgende **bereits für die Website vorhandene** Umgebungsvariablen müssen stimmen:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=DEIN_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=DEIN_SERVER_ONLY_SERVICE_ROLE_KEY
```

Den bestehenden Service-Role-Key nicht im Browser nutzen. Nach Änderungen der Vercel-Variablen **Production neu deployen**, damit diese im Serverprozess ankommen. Eine Preview-Deployment-Domain darf nicht versehentlich in `DARKTUNES_MCP_PUBLIC_ORIGIN` stehen.

Für zuverlässige **verteilte** Limitierung in mehreren Vercel-Instanzen sollten `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` bereits konfiguriert sein. Ohne sie greift die bestehende In-Memory-Fallback-Limitierung **pro Instanz**. Diese ist nicht als globale Produktionsquote zu verstehen.

## 3. ChatGPT anbinden

1. Im Webbrowser ChatGPT öffnen.
2. **Settings / Einstellungen → Plugins** öffnen, mit **+** einen **Custom MCP Server** hinzufügen. Je nach Konto/Workspace befindet sich der ältere Pfad unter Apps → Create (Developer Mode).
3. Name: `darkTunes`. **HTTPS MCP endpoint:** `https://DEINE-DOMAIN/api/mcp`.
4. Bei Authentifizierung **OAuth** wählen. Der MCP-Endpunkt antwortet ohne Bearer mit HTTP 401 und `WWW-Authenticate`, das auf die OAuth Resource Metadata und damit auf **Supabase Auth** verweist.
5. Falls ChatGPT eine **Redirect-/Callback-URI** anzeigt, diese exakt für den OAuth-Client unter **Supabase → Authentication → OAuth Apps** registrieren. Bei vertraulichen Clients `client_id` und `client_secret` in der dafür vorgesehenen ChatGPT-Einrichtung verwenden.
6. **Client-ID in Vercel erlauben**, Produktion neu deployen, dann ChatGPT-OAuth-Flow starten oder wiederholen. Bei dynamischer Registrierung zuerst die im Supabase-Dashboard angelegte `client_id` übernehmen.
7. Über die darkTunes-Seite anmelden, bei Admin/Redaktion TOTP bestätigen, angezeigten Client, Rücksprungadresse und Zugriffsrahmen prüfen und **Allow access** klicken.
8. **Scan Tools**/Verbindung prüfen und in einem neuen Chat einen lesenden Aufruf wie `editorial_collections` (Admin) oder `get_artist_profile` (Künstlerkonto) testen.

Die verfügbaren Plugin-, Developer-Mode- und Write-Funktionen hängen von ChatGPT-Plan, Workspace-Rollen und Rollout ab. Bei Konten ohne externe MCP-Write-Unterstützung sind vorbereitende Schreibwerkzeuge ggf. nicht ausführbar.

## 4. Technischer Smoke-Test

Mit einer Domain `https://DEINE-DOMAIN` und deinem Supabase-Projekt:

```bash
curl -i https://DEINE-DOMAIN/.well-known/oauth-protected-resource/api/mcp
# Erwartet HTTP 200 und resource /api/mcp, authorization_servers = Supabase /auth/v1

curl -i -X POST https://DEINE-DOMAIN/api/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# Erwartet 401 und WWW-Authenticate. Kein anonymer Zugriff.

# Nur mit tatsächlich über ChatGPT/Supabase OAuth ausgestelltem gültigem Token:
curl -sS https://DEINE-DOMAIN/api/mcp -X POST \
  -H "Authorization: Bearer $OAUTH_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'
# Erwartet resultType=complete, supportedVersions, serverInfo

curl -sS https://DEINE-DOMAIN/api/mcp -X POST \
  -H "Authorization: Bearer $OAUTH_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
# Erwartet nur die zum Account passenden Werkzeuge.
```

Prüfe zusätzlich: falsche oder nicht erlaubte OAuth-App-ID (403), abgelaufener Token (401), ungeeignete Rolle (keine Admin-Tools), fehlende Künstlerzuordnung (keine fremden Künstlerdaten), ungültiges Tool, zu großer Request (413), doppelte Freigabe, veraltetes `updated_at` (SQL-Konflikt), explizite Ablehnung, MFA-Prüfung, Logout und OAuth-Grant-Widerruf. Sensible Token nur in einer privaten Testumgebung verwenden, nie in Tickets/Logs posten.

## 5. Administration und typische Fehler

* **401 Unauthorized:** OAuth Bearer fehlt oder abgelaufen. In ChatGPT erneut anmelden. `WWW-Authenticate` enthält den Discovery-Pfad.
* **403 OAuth application not authorized:** In Vercel `DARKTUNES_MCP_OAUTH_CLIENT_IDS` mit tatsächlicher Supabase `client_id` vergleichen, redeployen.
* **503 MCP disabled:** `DARKTUNES_MCP_ENABLED` und Supabase-Variablen prüfen.
* **OAuth Consent zeigt ungültigen Antrag:** `Authorization Path=/oauth/consent` prüfen. Alte Links nicht wiederverwenden.
* **Admin/Redaktion muss MFA bestätigen:** Unter darkTunes/Supabase Auth TOTP registrieren und die 6-stellige Challenge im Consent-Dialog bestätigen.
* **Proposal queue unavailable:** reset.sql nicht angewendet oder Datenbankfehler. Keine blind neu angelegten Tabellen mit geöffnetem RLS.
* **Änderung abgewiesen:** Datensatz wurde zwischen Vorschlag und Freigabe bearbeitet. Neues `editorial_get` und neuen Vorschlag erstellen.
* **Nicht alle Tools sichtbar:** RBAC ist absichtlich kontoabhängig. Die serverseitige Prüfung nutzt den aktuellen darkTunes-User und Künstlerzuordnungen.
* **Nur Lesen verfügbar:** ChatGPT-Plan oder Workspace erlaubt externe Schreibaktionen eventuell noch nicht. ChatGPT Developer-Mode-/App-Administrationsregeln prüfen.

Für Sperren sofort in **Supabase → Authentication → OAuth Apps/Grants** Client oder Zugriff widerrufen und die Client-ID aus Vercel entfernen. Zusätzlich normale Benutzerzugänge entsprechend deaktivieren. Eine bloße ChatGPT-Deinstallation ersetzt keinen serverseitigen Entzug.

### Architektur und Grenzen

Die Website bleibt der einzige Besitzer ihres Supabase Service-Role-Keys. Der OAuth-Zugriff gibt ChatGPT **keinen** direkten Service-Role-Key und keinen direkten Zugriff auf die Supabase-Datenbank. Der MCP-Server prüft Token bei Supabase und nutzt danach die bestehende darkTunes-Rechteauflösung. Editorial-Tools lesen nur erlaubte Spalten. Schreibaktionen stellen prüfbare Vorschläge. Finanz-, Konto-, Rechts-, E-Mail- und Sicherheitstabellen sind von den redaktionellen Vorschlagswerkzeugen ausgeschlossen.

**Noch zu prüfen vor Livefreigabe:** vollständiger OAuth-Flow mit echtem ChatGPT-Client und Refresh-/Widerrufstest; CI auf Vercel; Reset-Schema und RLS-/Sicherheitsadvisor; finale Freigabe der angebotenen KI-Werkzeuge nach Datenschutzklassifikation. Die Implementierung ersetzt keinen echten Produktions-Smoke-Test.
