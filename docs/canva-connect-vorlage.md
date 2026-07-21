# Canva Connect API — Bauvorlage für den Grafik-Editor

> Recherche-Stand: 2026-07-17. Alle Aussagen sind mit Quell-URL belegt (offizielle Canva-Doku unter `canva.dev/docs/connect/` bzw. die OpenAPI-Spec `https://www.canva.dev/sources/connect/api/latest/api.yml`). Wo ich nichts finden konnte, steht ausdrücklich **UNVERIFIZIERT** dabei — nicht raten, sondern nachfragen/testen.
>
> Bereits geklärt und hier NICHT nochmal behandelt: `X-Frame-Options: SAMEORIGIN` verhindert iframe-Einbettung; die Connect API kann keine Grafik-Farben ändern.

---

## 0. Kurzfassung (TL;DR)

| Frage | Antwort | Quelle |
|---|---|---|
| SVG als Asset hochladbar? | **Nein.** Unterstützte Bildformate für Asset-Upload sind JPEG, PNG, HEIC, Single-Frame-GIF, TIFF, Single-Frame-WEBP. SVG steht nicht in der Liste. | [Assets API overview](https://www.canva.dev/docs/connect/api-reference/assets/) |
| `localhost` als Redirect-URI? | **Nein, explizit nicht empfohlen** (CORS-Fehler). Stattdessen `http://127.0.0.1:<port>/...`. | [Quickstart](https://www.canva.dev/docs/connect/quickstart/), [Creating integrations](https://www.canva.dev/docs/connect/creating-integrations/) |
| PKCE Pflicht? | **Ja**, `code_challenge_method=s256`. | [Authentication](https://www.canva.dev/docs/connect/authentication/) |
| Access-Token-Laufzeit | 14400 Sekunden (4 h) laut Beispielwert im Schema, Doku nennt das Muster „4 Stunden, kann sich ändern". | [generate-access-token](https://www.canva.dev/docs/connect/api-reference/authentication/generate-access-token/) |
| Client-Secret im Browser? | **Ausdrücklich verboten**: „Requests that require authenticating with your client ID and client secret can't be made from a web-browser client." | OpenAPI-Spec, `ExchangeAuthCodeRequest`-Beschreibung |
| Export-Formate (PNG dabei?) | Ja: jpg, png, gif, pptx, mp4, pdf, csv, html_bundle, html_standalone. SVG-Export ist im Schema vorgesehen, aber laut Fehlercode `feature_not_available` aktuell **nicht verfügbar** — irrelevant, da PNG ohnehin die Anforderung ist. | OpenAPI-Spec `/v1/exports`, `SvgExportUnavailableError` |

---

## 1. OAuth-2.0-Fluss

Zwei Schritte laut Doku: „1. Obtain authorization from the Canva user … 2. Use the authorization code to generate access tokens." [Quelle: https://www.canva.dev/docs/connect/authentication/]

### 1.1 Autorisierungs-URL

```
GET https://www.canva.com/api/oauth/authorize
```
[Quelle: OpenAPI-Spec, `securitySchemes.oauthAuthCode.flows.authorizationCode.authorizationUrl`]

Achtung: Das ist **`www.canva.com`**, nicht `api.canva.com` — die beiden Hosts werden im Fluss gemischt.

**Pflicht-Query-Parameter:**

| Parameter | Wert |
|---|---|
| `client_id` | Integrations-ID aus dem Developer Portal |
| `response_type` | `code` |
| `scope` | Leerzeichen-getrennte Liste der Scopes |
| `code_challenge` | SHA-256-Hash des `code_verifier`, base64url-kodiert |
| `code_challenge_method` | `s256` |

**Optionale Query-Parameter:**

| Parameter | Wert |
|---|---|
| `state` | Hochentropischer Zufallsstring gegen CSRF — „highly recommended", nicht hart erzwungen |
| `redirect_uri` | Nur nötig, wenn mehrere Redirect-URIs registriert sind; sonst wird automatisch die erste registrierte URI verwendet |

[Quelle: https://www.canva.dev/docs/connect/authentication/]

### 1.2 PKCE (Pflicht)

- `code_verifier`: kryptografisch zufälliger String, 43–128 Zeichen, nur `[A-Za-z0-9\-._~]`.
- `code_challenge`: `base64url(SHA256(code_verifier))`.
- Der `code_verifier` darf laut Doku **nicht** für den Nutzer/Browser zugänglich sein und muss sicher zwischengespeichert werden, bis der Callback ihn braucht.

[Quelle: https://www.canva.dev/docs/connect/authentication/]

### 1.3 Token-Tausch (Schritt 2)

```
POST https://api.canva.com/rest/v1/oauth/token
```
[Quelle: OpenAPI-Spec, `securitySchemes.oauthAuthCode.flows.authorizationCode.tokenUrl`, bestätigt in `api-reference/authentication/generate-access-token`]

**Headers:**
- `Content-Type: application/x-www-form-urlencoded`
- `Authorization: Basic {base64(client_id:client_secret)}` — **empfohlene** Methode

**Body (`grant_type=authorization_code`):**

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `grant_type` | ja | `authorization_code` |
| `code` | ja | Code aus dem Redirect |
| `code_verifier` | ja | der ursprüngliche PKCE-Verifier |
| `redirect_uri` | nur wenn beim Autorisieren mehrere URIs registriert waren | muss exakt einer registrierten URI entsprechen |
| `client_id` / `client_secret` | Alternative zu Basic-Auth im Body | „We recommend that you use basic access authentication instead" |

Beispiel (aus der Doku übernommen, Platzhalter ergänzt):

```bash
curl --request POST 'https://api.canva.com/rest/v1/oauth/token' \
  --header 'Authorization: Basic {base64(client_id:client_secret)}' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'code_verifier=...' \
  --data-urlencode 'code=...' \
  --data-urlencode 'redirect_uri=http://127.0.0.1:3113/api/canva/callback'
```

**Wichtiger, explizit dokumentierter Sicherheitshinweis** (OpenAPI-Spec, Beschreibung von `ExchangeAuthCodeRequest`/allgemeiner Auth-Text):
> „Requests that require authenticating with your client ID and client secret can't be made from a web-browser client."

→ Der Token-Tausch **muss** serverseitig passieren (Next.js Route Handler / Server-Umgebung), nie im Client-Bundle.

**Response (HTTP 200, `ExchangeAccessTokenResponse`):**

```json
{
  "access_token": "…",
  "refresh_token": "…",
  "token_type": "Bearer",
  "expires_in": 14400,
  "scope": "design:meta:read design:content:read asset:read asset:write"
}
```
Pflichtfelder laut Schema: `access_token`, `expires_in`, `refresh_token`, `token_type`. [Quelle: OpenAPI-Spec, `ExchangeAccessTokenResponse`]

`expires_in` ist **14400 Sekunden (4 Stunden)** als Beispielwert im Schema hinterlegt; die gerenderte Doku-Seite bezeichnet das als „subject to change" — also nicht hart-kodieren, sondern aus der Response lesen.

### 1.4 Refresh-Token-Fluss

```
POST https://api.canva.com/rest/v1/oauth/token
```
Body: `grant_type=refresh_token`, `refresh_token={…}`, optional `scope` (kleinerer Scope als vorher möglich).

**Wichtiger Fallstrick:** „Each refresh token can only be used once." Bei jedem Refresh wird ein **neuer** `refresh_token` mitgeliefert (Token-Rotation) — der alte wird ungültig. Die App muss also nach jedem Refresh den neuen `refresh_token` überschreiben und persistieren, sonst ist nach dem ersten Refresh der Zugang weg.
[Quelle: https://www.canva.dev/docs/connect/authentication/, bestätigt durch OpenAPI-Fehlerbeispiel `InvalidRefreshToken` (`code: invalid_grant`)]

**Absolute Lebensdauer des Refresh-Tokens (z. B. „läuft nach 60 Tagen Inaktivität ab"):** **UNVERIFIZIERT** — in der durchsuchten Doku und der OpenAPI-Spec nicht angegeben. Praktisch heißt das: solange regelmäßig refresht wird, sollte der Zugang bestehen bleiben; ein hartes Ablaufdatum konnte ich nicht belegen.

**Gültigkeitsdauer des Authorization Code** (wie lange zwischen Redirect und Token-Tausch Zeit bleibt): **UNVERIFIZIERT** — nicht gefunden. Empfehlung: den Tausch sofort im Callback-Handler ausführen, nicht verzögern.

### 1.5 Token-Introspektion / Widerruf (Bonus, nicht Kernanforderung)

Es existieren zusätzlich `POST /v1/oauth/introspect` und `POST /v1/oauth/revoke` laut Doku-Index (`https://www.canva.dev/docs/connect/api-reference/authentication/introspect-access-token.md`, `.../revoke-token.md`) — für einen „Verbindung trennen"-Button im Editor nützlich, aber **nicht im Detail geprüft**, da nicht Teil der gestellten Fragen.

---

## 2. Redirect-URI-Regeln

- **`127.0.0.1` ja, `localhost` nein.** Die Doku sagt wörtlich: „Don't use `localhost:3000`, as you might get CORS errors." Stattdessen wird durchgängig `http://127.0.0.1:<port>/...` verwendet (Beispiel aus der Doku: `http://127.0.0.1:3001/oauth/redirect`).
  [Quelle: https://www.canva.dev/docs/connect/quickstart/, https://www.canva.dev/docs/connect/creating-integrations/]
- **HTTP (nicht HTTPS) ist für lokale Entwicklung explizit im Beispiel verwendet.** Eine allgemeine Pflicht zu HTTPS für **Produktions**-Redirect-URIs habe ich in Authentication-, Creating-Integrations- und Submission-Checklist-Seite **nicht gefunden** → **UNVERIFIZIERT**, aber als Web-Standard trotzdem für den Produktivbetrieb empfohlen.
- Es müssen **mindestens eine, maximal 10** Redirect-URLs im Developer Portal hinterlegt sein. [Quelle: https://www.canva.dev/docs/connect/creating-integrations/]
- Die URL im Token-Request muss exakt einer registrierten URI entsprechen; ist nur eine registriert, ist der Parameter beim Token-Tausch optional und wird automatisch verwendet.
- Vor der **Review-Einreichung** einer Public Integration müssen lokale URLs wieder entfernt werden: „Make sure you don't have any local URLs set as an authentication redirect URL." Bis dahin dürfen sie drinstehen — die komplette Quickstart-Anleitung testet mit der eigenen Canva-Anmeldung gegen eine lokale Redirect-URI, ohne auf eine Freigabe zu warten. Das ist nicht als expliziter Satz „du darfst vor Review selbst testen" dokumentiert, aber so im Tutorial vorgeführt.
  [Quelle: https://www.canva.dev/docs/connect/submission-checklist/, https://www.canva.dev/docs/connect/quickstart/]
- Nur URLs verwenden, die man selbst kontrolliert („You must only add URLs that you or your organization controls").

---

## 3. Scopes

Vollständige, für unseren Fall relevante Liste (String-genau):

| Scope | Bedeutung | Für uns nötig? |
|---|---|---|
| `design:meta:read` | Metadaten der Designs lesen (Titel, IDs, Thumbnails) | **Ja** — Designs auflisten |
| `design:content:read` | Inhalt der Designs lesen | **Ja** — wird vom Export-Endpunkt verlangt |
| `design:content:write` | Designs im Namen des Nutzers erstellen | Nein |
| `asset:read` | Metadaten der Assets lesen | **Ja** — Upload-Job-Status abfragen |
| `asset:write` | Assets hochladen/ändern/löschen | **Ja** — Asset-Upload |
| `profile:read` / `profile` / `email` / `openid` | Profil/Identität via OIDC | Nein (nur nötig, falls „Angemeldet als …" angezeigt werden soll) |
| `brandtemplate:meta:read`, `brandtemplate:content:read` | Markenvorlagen | Nein |

[Quelle: https://www.canva.dev/docs/connect/appendix/scopes/, Scope-Liste bestätigt in der OpenAPI-Spec unter `securitySchemes.oauthAuthCode.flows.authorizationCode.scopes`]

**Minimal-Scope-String für den Autorisierungs-Request:**
```
design:meta:read design:content:read asset:read asset:write
```

Jeder einzelne Endpunkt verlangt in der OpenAPI-Spec (`security:`-Block) genau einen dieser Scopes — siehe Tabelle in Abschnitt 4.

---

## 4. Endpunkte

Basis-Host für alle REST-Aufrufe (nicht den Auth-Host `www.canva.com` verwenden): `https://api.canva.com/rest`

### 4.1 Designs auflisten/durchsuchen

```
GET https://api.canva.com/rest/v1/designs
```
Scope: `design:meta:read`. Rate-Limit: **100 Requests/Minute pro Nutzer**.
[Quelle: OpenAPI-Spec, Pfad `/v1/designs`]

**Query-Parameter:**

| Parameter | Typ | Default | Bedeutung |
|---|---|---|---|
| `query` | string, max. 255 Zeichen | – | Suchbegriff(e) |
| `continuation` | string | – | Pagination-Cursor aus der vorigen Antwort |
| `ownership` | `any` \| `owned` \| `shared` | `any` | Filter nach Besitzverhältnis |
| `sort_by` | `relevance` \| `modified_descending` \| `modified_ascending` \| `title_descending` \| `title_ascending` | `relevance` | Sortierung |
| `limit` | integer, 1–100 | 25 | Seitengröße |

**Antwort** (`items[]`, je Design laut Schema `DesignSummary`):
```json
{
  "items": [
    {
      "id": "DAFVztcvd9z",
      "title": "My summer holiday",
      "urls": { "edit_url": "…", "view_url": "…" },
      "thumbnail": { "width": 595, "height": 335, "url": "https://…" },
      "created_at": 1377396000,
      "updated_at": 1692928800,
      "page_count": 3
    }
  ],
  "continuation": "RkFGMgXlsVTDbMd:MR3L0…"
}
```
**Gotcha:** `thumbnail.url` läuft nach **15 Minuten** ab, `urls.view_url` nach **30 Tagen** — nicht cachen und später wiederverwenden, sondern bei Bedarf neu abrufen.
[Quelle: gerenderte Doku-Seite https://www.canva.dev/docs/connect/api-reference/designs/list-designs/, Feldbeschreibungen]

Pagination: Ist `continuation` in der Antwort vorhanden, gibt es weitere Seiten → als Query-Parameter erneut mitschicken (`?continuation={token}`), bis das Feld fehlt.

### 4.2 Design als PNG exportieren (asynchroner Job)

**Schritt A — Job anlegen:**
```
POST https://api.canva.com/rest/v1/exports
Content-Type: application/json
```
Scope: `design:content:read`. Rate-Limit: **20 Requests/Minute pro Nutzer**, PLUS spezielle Export-Drosselung (siehe Abschnitt 5).

```json
{
  "design_id": "DAVZr1z5464",
  "format": {
    "type": "png",
    "export_quality": "...",
    "height": 1200,
    "width": 1200,
    "lossless": true,
    "pages": [1]
  }
}
```
Relevante Felder von `PngExportFormat`:
- `height`/`width`: Pixel, 40–25000, optional (Default = Designgröße). Wird nur eins gesetzt, skaliert das andere proportional mit.
- `lossless` (default `true`): verlustfreies PNG. **Achtung:** `lossless: false` (verlustbehaftete Kompression) „is only available to users on a Canva plan that has premium features, such as Canva Pro. If the user is on the Canva Free plan and this parameter is set to `false`, the export operation will fail." → für Leons Konto im Zweifel `lossless` weglassen/`true` lassen, außer Canva Pro ist sicher vorhanden.
- `pages`: 1-basiertes Array; ohne Angabe werden alle Seiten exportiert.
[Quelle: OpenAPI-Spec, Schema `PngExportFormat`]

**Unterstützte Formate insgesamt** (`type`-Werte): `pdf`, `jpg`, `png`, `pptx`, `gif`, `mp4`, `html_bundle`, `html_standalone`, `csv`. SVG ist **kein** wählbarer Wert im Request-Schema (`ExportFormat`-`oneOf`), obwohl an anderer Stelle der Spec ein `SvgExportFormatOption` als Metadatum existiert — dazu passt der Fehlercode `feature_not_available: "SVG Export is currently unavailable"`. Für uns irrelevant, da PNG gefordert ist.
[Quelle: OpenAPI-Spec, `/v1/exports` Beschreibung + Schema `ExportFormat`]

**Antwort:** `{"job": {"id": "...", "status": "in_progress"}}`

**Schritt B — Status pollen:**
```
GET https://api.canva.com/rest/v1/exports/{exportId}
```
Scope: `design:content:read`. Rate-Limit: **120 Requests/Minute pro Nutzer**.

Status-Werte: `in_progress` → `success` **oder** `failed`. Bei `success`:
```json
{
  "job": {
    "id": "e08861ae-…",
    "status": "success",
    "urls": ["https://export-download.canva.com/..."]
  }
}
```
- `urls`: ein Eintrag pro Seite, **24 Stunden gültig** — sofort herunterladen und lokal speichern, nicht die URL langfristig referenzieren.
- Poll-Strategie: kein fester Intervall dokumentiert, aber die Doku empfiehlt ausdrücklich „exponential backoff" — kurz starten, Intervall exponentiell erhöhen, nach oben deckeln.
- Kein dokumentiertes Job-Timeout (wie lange „in_progress" maximal dauern darf) → **UNVERIFIZIERT**. Praktisch: nach z. B. 2 Minuten eigenes Client-Timeout mit Fehlermeldung einbauen.
- Fehlercodes: `license_required` (Premium-Elemente nicht gekauft), `approval_required` (Design braucht Freigabe), `internal_failure`.
[Quelle: https://www.canva.dev/docs/connect/api-reference/exports/get-design-export-job/, OpenAPI-Spec Schema `ExportJob`]

### 4.3 Asset-Upload — die kritische Frage: SVG?

**Antwort: Nein, SVG wird nicht als Asset-Upload akzeptiert.**

Die Assets-API-Übersichtsseite (auf die der Upload-Endpunkt selbst verweist: „Supported file types for assets are listed in the Assets API overview") listet explizit:
- **Bilder:** JPEG, PNG, HEIC, Single-Frame-GIF, TIFF, Single-Frame-WEBP — **kein SVG**.
- **Videos:** M4V, Matroska (MKV), MP4, MPEG, QuickTime, WebM.
- **Größenlimits:** Bilder < 50 MB, Videos < 500 MB.

[Quelle: https://www.canva.dev/docs/connect/api-reference/assets/]

Ich habe zusätzlich in der rohen OpenAPI-Spec nach einer abweichenden/versteckten Content-Type-Restriktion gesucht: Der Request-Body des Upload-Endpunkts ist im Schema nur generisch `application/octet-stream` (`format: binary`) — es gibt **keine** Enum-Einschränkung auf Schema-Ebene, die Formatliste ist nur in der Prosa der Übersichtsseite dokumentiert und wird serverseitig geprüft (Fehlercodes `invalid_file_format` / `unsupported_content_type` existieren im allgemeinen Error-Enum). Ein `image/svg+xml`-Mime-Type taucht an einer Stelle der Spec auf (`DataTableImageMimeType`), das ist aber ein **anderes** Feature (Data-Automation/Autofill mit Bild-Datenfeldern in einer Tabelle) und hat nichts mit dem Asset-Upload-Endpunkt zu tun — keine Hintertür für SVG.

**Konsequenz für den Editor:** Das vektorisierte SVG-Ergebnis muss vor dem Upload zu Canva **serverseitig zu PNG gerastert** werden (z. B. mit `sharp`/`resvg`/`@resvg/resvg-js` in der Next.js-Route). Erst das PNG geht an `/v1/asset-uploads`.

**Schritt A — Bytes hochladen (asynchroner Job):**
```
POST https://api.canva.com/rest/v1/asset-uploads
Content-Type: application/octet-stream
Authorization: Bearer {access_token}
Asset-Upload-Metadata: {"name_base64":"<Base64(Name)>"}
```
Scope: `asset:write`. Rate-Limit: **30 Requests/Minute pro Nutzer**.

- `Asset-Upload-Metadata` ist ein JSON-Objekt **im Header**, einziges Feld `name_base64` (Base64-kodierter Name, unkodiert max. 50 Zeichen — Emojis etc. deshalb Base64).
- Body: die rohen Bytes der Datei (kein Multipart, kein Base64 im Body — nur der Header ist Base64).
- Kein dokumentiertes explizites Größenlimit auf dieser Endpunktseite selbst; die 50-MB/500-MB-Grenzen aus 4.3 gelten sinngemäß, Fehlercode bei Überschreitung: `file_too_big`.

```bash
curl --request POST 'https://api.canva.com/rest/v1/asset-uploads' \
  --header 'Authorization: Bearer {token}' \
  --header 'Content-Type: application/octet-stream' \
  --header 'Asset-Upload-Metadata: {"name_base64":"TXkgQXdlc29tZSBVcGxvYWQg8J+agA=="}' \
  --data-binary '@/pfad/zur/datei.png'
```

**Antwort:** `{"job": {"id": "...", "status": "in_progress"}}`

**Schritt B — Status pollen:**
```
GET https://api.canva.com/rest/v1/asset-uploads/{jobId}
```
Scope: `asset:read`. Rate-Limit: **180 Requests/Minute pro Nutzer**.

Status: `in_progress` → `success`/`failed`. Bei `success` liefert `job.asset` u. a. `id`, `type` (`image`/`video`), `name`, `thumbnail.url`. Fehlercodes (`AssetUploadErrorCode`): `file_too_big`, `import_failed`, `fetch_failed`.
[Quelle: OpenAPI-Spec, Schemas `AssetUploadJob`, `AssetUploadError`, `AssetUploadErrorCode`]

### 4.4 Bonus (nicht angefragt, aber relevant): Asset-Upload per URL

Es gibt zusätzlich einen **Preview**-Endpunkt `POST /v1/url-asset-uploads` (Asset direkt von einer öffentlichen URL importieren statt Bytes zu schicken). Ausdrücklich als Preview markiert: „There might be unannounced breaking changes… Public integrations that use preview APIs will not pass the review process." Für ein privates lokales Werkzeug nutzbar, aber nicht zukunftssicher — deshalb hier nur als Randnotiz, nicht als Empfehlung.
[Quelle: OpenAPI-Spec, Pfad `/v1/url-asset-uploads`]

---

## 5. Ratenbegrenzung

| Endpunkt | Limit pro Nutzer der Integration | Quelle |
|---|---|---|
| `GET /v1/designs` | 100/min | OpenAPI-Spec `x-rate-limit-per-client-user` |
| `POST /v1/exports` | 20/min **+ Sonderdrosselung** (s. u.) | OpenAPI-Spec |
| `GET /v1/exports/{id}` | 120/min | OpenAPI-Spec |
| `POST /v1/asset-uploads` | 30/min | OpenAPI-Spec |
| `GET /v1/asset-uploads/{id}` | 180/min | OpenAPI-Spec |

**Export-Sonderdrosselung** (zusätzlich zum 20/min-Limit oben), wörtlich aus der Endpunktbeschreibung:
> „Integration throttle: Each integration can export a maximum of 750 times per 5-minute window, and 5,000 times per 24-hour window. Document throttle: Each document can be exported a maximum of 75 times per 5-minute window. User throttle: Each user can export a maximum of 75 times per 5-minute window, and 500 times per 24-hour window."
[Quelle: OpenAPI-Spec, Pfad `/v1/exports`]

Für Leons Ein-Personen-Nutzung praktisch nie relevant, aber gut zu kennen, falls er/sein Freund gleichzeitig testen.

**Verhalten bei 429:**
- Fehlerformat ist das normale `{code, message}`-Schema mit `code: too_many_requests`.
- **Keine** `Retry-After`- oder `X-RateLimit-*`-Header dokumentiert bzw. in der Spec vorhanden (geprüft) — der Client muss also „blind" exponentiell zurückfahren, es gibt keinen Header, der die Wartezeit vorgibt.
- Empfehlung der Doku: „exponential backoff and retry logic", Responses cachen, Polling-Frequenz bei Asset-/Export-Jobs bewusst niedrig halten.
[Quelle: https://www.canva.dev/docs/connect/error-responses/]

---

## 6. Fallstricke aus der Doku

1. **Redirect-URI `127.0.0.1`, nicht `localhost`.** (siehe Abschnitt 2)
2. **Refresh-Token-Rotation:** jeder Refresh-Token ist Einmalgebrauch, nach jedem Refresh muss der neue gespeichert werden.
3. **Client-Secret nie im Browser** — Token-Tausch nur serverseitig.
4. **Download-URLs (Export) laufen nach 24 h ab**, `thumbnail.url` (Designs-Liste) schon nach **15 Minuten**, `view_url` nach **30 Tagen**.
5. **Kein SVG-Asset-Upload** — vorher rastern (siehe 4.3).
6. **`lossless:false` bei PNG-Export benötigt einen bezahlten Canva-Plan**, sonst schlägt der Export fehl — im Zweifel `lossless` gar nicht setzen (Default `true`).
7. **Kein Rate-Limit-Header** bei 429 — Backoff-Zeit muss die App selbst festlegen, nicht aus der Response lesen.
8. **Kein dokumentiertes Job-Timeout** für Export-/Upload-Jobs — eigenes Client-seitiges Timeout einbauen.
9. **Pagination-Parameter heißt `continuation`**, nicht `cursor` oder `page`.
10. **MFA ist Pflicht**, um überhaupt eine Integration im Developer Portal anlegen zu können.
11. **Lokale Redirect-URLs müssen vor einer Public-Review-Einreichung wieder entfernt werden** — für ein rein privates Werkzeug (nie eingereicht) ist das nicht relevant, aber falls Leon die Integration später doch öffentlich machen will, dran denken.
12. **Zwei verschiedene Hosts:** Autorisierung läuft über `www.canva.com`, alle REST-Calls (inkl. Token-Tausch) über `api.canva.com`.

---

## 7. Was Leon von Hand tun muss (Developer Portal)

1. **Voraussetzung:** MFA (Zwei-Faktor) muss für den Canva-Account aktiviert sein, sonst lässt sich keine Integration anlegen.
2. Im [Developer Portal](https://www.canva.com/developers/) einloggen → „Your integrations" → **„Create an integration"**.
3. Typ wählen: **Public** (später von Canva reviewbar, aber sofort mit dem eigenen Account nutzbar) oder **Private** (nur auf Canva-**Enterprise**-Plänen verfügbar — für ein privates Tool vermutlich nicht anwendbar, außer WEE hat einen Enterprise-Plan). Für den beschriebenen Anwendungsfall (nur Leon + ein Freund, lokal) reicht **Public**, ohne die Integration je zur Review einzureichen.
4. Nutzungsbedingungen akzeptieren, Integration benennen (Name wird dem Nutzer beim Autorisieren angezeigt).
5. Unter **Configuration**: **Client ID** notieren; **„Generate secret"** klicken und das **Client Secret sofort sichern** — es wird nur einmal angezeigt und ist danach nicht mehr abrufbar.
6. Unter **Scopes**: die vier benötigten Scopes anhaken — `design:content` (mind. Read), `design:meta` (Read), `asset` (Read **und** Write). Nur was gebraucht wird ankreuzen, laut Doku-Empfehlung.
7. Unter **Authentication** → Redirect-URLs hinzufügen: `http://127.0.0.1:3113/api/canva/callback` (Port an den lokalen Dev-Server anpassen, siehe unten). **Kein** `localhost`.
8. Integration speichern/aktivieren. Ab hier kann sich Leon mit seinem **eigenen** Canva-Account gegen die lokale App autorisieren — eine Freigabe durch Canva ist dafür laut Tutorial-Ablauf nicht nötig, nur für die spätere Veröffentlichung an fremde Nutzer.

[Quelle: https://www.canva.dev/docs/connect/creating-integrations/, https://www.canva.dev/docs/connect/quickstart/]

---

## 8. Vorschlag: Next.js-15-Architektur (App Router)

### 8.1 Routen

```
app/api/canva/
├── login/route.ts        GET  – baut Autorisierungs-URL (inkl. PKCE + state), Redirect zu Canva
├── callback/route.ts     GET  – nimmt ?code&state entgegen, tauscht gegen Tokens, persistiert, Redirect zu /grafik-editor
├── designs/route.ts      GET  – proxy zu GET /v1/designs (?query, ?continuation)
├── export/route.ts       POST – proxy zu POST /v1/exports (Body: {designId})
├── export/[jobId]/route.ts   GET – proxy zu GET /v1/exports/{jobId} (Polling)
├── upload/route.ts       POST – rastert eingehendes SVG zu PNG, dann proxy zu POST /v1/asset-uploads
└── upload/[jobId]/route.ts   GET – proxy zu GET /v1/asset-uploads/{jobId} (Polling)

lib/canva/
├── config.ts       – liest process.env, Scope-Konstante, Basis-URLs
├── pkce.ts         – code_verifier/code_challenge generieren
├── token-store.ts  – Token lesen/schreiben (server-only, siehe 8.2)
└── client.ts       – dünner fetch-Wrapper mit Authorization-Header + Auto-Refresh bei 401
```

Alle Dateien unter `app/api/canva/**` sind Route Handler (`route.ts`), laufen also serverseitig — `client_secret` bleibt darin und wird nie an den Browser ausgeliefert. Der Grafik-Editor (`components/grafik/GrafikEditor.tsx`) ruft ausschließlich die eigenen `/api/canva/...`-Routen auf, nie Canva direkt.

### 8.2 Wo landen die Tokens? (lokales Ein-Personen-Werkzeug, kein Multi-User-Produkt)

Zwei Optionen, beide serverseitig, `client_secret` in jedem Fall nur in `process.env`:

**Option A — gitignorierte JSON-Datei auf Platz** (z. B. `.canva/tokens.json` im Projektroot)
- Vorteile: übersteht Dev-Server-Neustarts und Hot-Reload ohne erneute Anmeldung; unabhängig vom Browser (Leon **und** sein Freund könnten sich nacheinander denselben lokalen Server anzeigen lassen); simpel mit `node:fs` umzusetzen.
- Nachteile: Klartext-Secret-Material liegt dauerhaft auf der Platte; muss zuverlässig gitignored sein (siehe 8.4) — ein Versehen committet Zugangsdaten ins (private) Repo.

**Option B — httpOnly-Cookie** (vom Route Handler gesetzt, `httpOnly: true`, `sameSite: "lax"`)
- Vorteile: kein dauerhaftes Klartext-File; Browser verwaltet Ablauf; kein Extra-Gitignore-Risiko.
- Nachteile: für `http://127.0.0.1` **darf** das `Secure`-Flag nicht gesetzt sein (sonst schickt der Browser das Cookie über HTTP gar nicht mit) — muss also `NODE_ENV`-abhängig umgeschaltet werden; Cookie ist an einen Browser gebunden, bei Browserwechsel oder Cookies-löschen ist die Anmeldung weg; Cookie-Größe ist eng (~4 KB), für Access+Refresh+Expiry als JSON reicht das aber knapp.

**Empfehlung:** Für dieses konkrete Szenario (ein lokaler Dev-Rechner, kein Deployment, Ziel ist Robustheit gegen Hot-Reload) **Option A**, weil es unabhängig von Cookie-Secure-Fallstricken auf `http://127.0.0.1` funktioniert und Neustarts des Dev-Servers keine Neuanmeldung erzwingen. Kurzlebige Werte (`state`, `code_verifier` — nur für die paar Sekunden zwischen `login` und `callback` relevant) gehören dagegen in ein **kurzlebiges httpOnly-Cookie** (z. B. `maxAge: 600`), nicht in die Datei — sie brauchen keine Persistenz über einen Neustart hinaus, und ein Cookie macht das saubere automatische Verfallen einfacher als manuelles Aufräumen in der Datei.

### 8.3 CSRF-Schutz (`state`)

- Beim `login`-Aufruf: zufälligen `state` erzeugen, zusammen mit `code_verifier` in einem kurzlebigen httpOnly-Cookie ablegen.
- Im `callback`: den zurückgegebenen `state`-Query-Parameter gegen den Cookie-Wert vergleichen, bei Abweichung abbrechen (400), Cookie danach löschen.
- Canva erzwingt `state` laut Doku nicht serverseitig, es liegt an der Integration selbst — deshalb hier aktiv umsetzen statt darauf zu vertrauen, dass Canva es prüft.

### 8.4 `.env.local` und `.gitignore`

**Wichtig, unabhängig von der Canva-Anbindung:** Das aktuelle `.gitignore` im Projekt (`v3/.gitignore`) enthält bislang **keinen** `.env*`-Eintrag (Stand dieser Recherche: nur `node_modules/`, `.next/`, `out/`, `next-env.d.ts`, `*.tsbuildinfo`). Vor dem ersten Anlegen von `.env.local` unbedingt ergänzen:

```gitignore
.env*.local
.canva/
```

**In `.env.local` (nicht committen):**
```
CANVA_CLIENT_ID=...
CANVA_CLIENT_SECRET=...
CANVA_REDIRECT_URI=http://127.0.0.1:3113/api/canva/callback
```

### 8.5 `.env.local.example` (Namen ohne Werte, darf committet werden)

```
# Canva Connect API – Client-ID aus dem Developer Portal (Configuration-Tab)
CANVA_CLIENT_ID=

# Canva Connect API – Client-Secret, NUR EINMAL im Portal sichtbar. Niemals committen.
CANVA_CLIENT_SECRET=

# Muss exakt einer im Developer Portal hinterlegten Redirect-URL entsprechen.
# 127.0.0.1 verwenden, NICHT localhost (Canva-Doku warnt vor CORS-Fehlern mit localhost).
CANVA_REDIRECT_URI=http://127.0.0.1:3113/api/canva/callback
```

### 8.6 SVG-Upload-Pipeline (Konsequenz aus Abschnitt 4.3)

Da SVG nicht als Asset akzeptiert wird, muss `app/api/canva/upload/route.ts` das eingehende SVG serverseitig zu PNG rastern, bevor der `POST /v1/asset-uploads`-Call erfolgt. Für Next.js/Node kommen dafür `sharp` (benötigt aber einen SVG-fähigen Rasterizer-Unterbau) oder `@resvg/resvg-js` (reiner Rust-SVG-Renderer, keine externe Abhängigkeit wie librsvg) infrage — welche Bibliothek konkret verwendet wird, ist eine Implementierungsentscheidung des bauenden Agents, keine Canva-API-Frage, und deshalb hier bewusst nicht festgelegt.

---

## 9. Zusammenfassung der offenen/unverifizierten Punkte

- Absolute Lebensdauer des Refresh-Tokens (falls es sowas wie „läuft nach X Tagen Inaktivität ab" gibt).
- Gültigkeitsdauer des Authorization Code zwischen Redirect und Token-Tausch.
- Explizite HTTPS-Pflicht für Produktions-Redirect-URIs (nicht gefunden, sonst OAuth-Branchenstandard).
- Maximale Laufzeit eines Export-/Upload-Jobs, bevor er als „hängengeblieben" gilt.
- Ob ein Canva-Free-Account grundsätzlich für die gesamte Connect-API-Nutzung ausreicht (explizit nur für `lossless:false`-PNG-Export als Pro-only dokumentiert; alles andere scheint plan-unabhängig, aber nicht ausdrücklich bestätigt).

---

## 10. Quellenverzeichnis

- https://www.canva.dev/docs/connect/ (Übersicht)
- https://www.canva.dev/docs/connect/authentication/ (OAuth-Fluss, PKCE, state)
- https://www.canva.dev/docs/connect/authentication.md (Schritt-für-Schritt-Text, Client-Secret-Warnung)
- https://www.canva.dev/docs/connect/api-reference/authentication/generate-access-token/ (Token-Endpunkt, Request/Response)
- https://www.canva.dev/docs/connect/appendix/scopes/ (Scope-Liste)
- https://www.canva.dev/docs/connect/quickstart/ (Redirect-URI-Beispiele, Setup-Ablauf)
- https://www.canva.dev/docs/connect/creating-integrations/ (Developer-Portal-Schritte, Scopes, MFA-Pflicht)
- https://www.canva.dev/docs/connect/submission-checklist/ (lokale URLs vor Review entfernen)
- https://www.canva.dev/docs/connect/api-reference/designs/list-designs/ (Designs auflisten)
- https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/ und `/get-design-export-job/` (Export-Job)
- https://www.canva.dev/docs/connect/api-reference/assets/ (unterstützte Dateiformate — kein SVG)
- https://www.canva.dev/docs/connect/api-reference/assets/create-asset-upload-job/ und `/get-asset-upload-job/` (Asset-Upload)
- https://www.canva.dev/docs/connect/api-requests-responses/ (asynchrone Jobs, Backoff-Empfehlung)
- https://www.canva.dev/docs/connect/error-responses/ (Fehlerformat, 429-Verhalten)
- https://www.canva.dev/docs/connect/llms.txt (URL-Index der gesamten Doku)
- https://www.canva.dev/sources/connect/api/latest/api.yml (OpenAPI-Spec — Primärquelle für exakte Pfade, Schemas, Rate-Limits, Scopes pro Endpunkt; lokal ausgewertet für diese Recherche)
