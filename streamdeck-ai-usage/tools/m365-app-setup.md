# M365 Copilot, Weg B: Enterprise-App von Hand einrichten

Gleiche Schritte wie `tools/m365-register-app.sh`, nur im Entra-Portal (https://entra.microsoft.com).
Ergebnis: eine App-Registrierung mit drei Microsoft-Graph-**Anwendungsberechtigungen**, Admin-Consent und einem
Client-Secret, das nur im macOS-Schlüsselbund liegt. Das Plugin braucht danach weder az CLI noch eine Anmeldung.

Nötige Rolle: Cloud Application Administrator (App anlegen) und Privileged Role Administrator oder Global Administrator
(Admin-Consent für Anwendungsberechtigungen).

## 1. App-Registrierung anlegen
1. Entra → Identität → Anwendungen → **App-Registrierungen** → **Neue Registrierung**.
2. Name: `Nexus.365 AI Usage Deck`. Unterstützte Kontotypen: **Nur Konten in diesem Organisationsverzeichnis**
   (entspricht `AzureADMyOrg`). Umleitungs-URI leer lassen. **Registrieren**.
3. Auf der Übersichtsseite notieren: **Anwendungs-ID (Client)** → `clientId`, **Verzeichnis-ID (Mandant)** → `tenantId`.

Die Enterprise-App (Service Principal) legt das Portal dabei automatisch an.

## 2. API-Berechtigungen
1. In der App: **API-Berechtigungen** → **Berechtigung hinzufügen** → **Microsoft Graph** → **Anwendungsberechtigungen**
   (nicht „Delegiert“).
2. Auswählen:

   | Berechtigung | wofür |
   |---|---|
   | `User.Read.All` | `/users/{upn}/licenseDetails` (Lizenz) und `/users/{upn}` (UPN für den Bericht) |
   | `Organization.Read.All` | `/directory/subscriptions` (Verlängerung, Lizenzanzahl) |
   | `Reports.Read.All` | Copilot-Nutzungsbericht D30 |

3. Die Standardberechtigung `User.Read` (delegiert) kann bleiben oder entfernt werden; das Plugin nutzt sie nicht.

## 3. Admin-Consent
**Administratorzustimmung für <Tenant> erteilen** → Ja. In der Spalte Status müssen alle drei Zeilen
„Gewährt für …“ zeigen. Ohne Consent stellt der Token-Endpunkt trotzdem ein Token aus, aber ohne Rechte;
Graph antwortet dann 403 und `doctor` nennt die fehlende Berechtigung.

## 4. Client-Secret
1. **Zertifikate & Geheimnisse** → **Geheime Clientschlüssel** → **Neuer geheimer Clientschlüssel**.
2. Beschreibung `ai-usage-deck`, Ablauf **12 Monate**. **Hinzufügen**.
3. Den **Wert** (nicht die Geheimnis-ID) kopieren – er wird nur einmal angezeigt.

## 5. Secret in den Schlüsselbund
Im eigenen Terminal; `security` fragt das Secret verdeckt ab (nicht in die Befehlszeile schreiben, nicht in Dateien):

```bash
security add-generic-password -s m365-copilot-app -a "$USER" -U -w
```

Prüfen, ohne den Wert auszugeben:

```bash
security find-generic-password -s m365-copilot-app -a "$USER" >/dev/null && echo vorhanden
```

Danach die Zwischenablage leeren (irgendetwas anderes kopieren).

## 6. Taste einstellen
Property Inspector der M365-Copilot-Taste:

| Feld | Wert | Setting |
|---|---|---|
| M365 Anmeldung | Enterprise-App (Weg B) | `m365Auth = "app"` |
| M365 Tenant | Verzeichnis-ID (GUID) oder `contoso.onmicrosoft.com` | `tenantId` |
| Client-ID | Anwendungs-ID (GUID) | `clientId` |
| Benutzer (UPN) | Nutzer, dessen Lizenz und Nutzung die Taste zeigt | `upn` |

Ohne Taste (CLI): `AI_USAGE_DECK_M365_AUTH=app AI_USAGE_DECK_M365_TENANT=<tenantId> AI_USAGE_DECK_M365_CLIENT_ID=<clientId> AI_USAGE_DECK_M365_UPN=<upn> node bin/cli.js doctor`.

## Secret erneuern (nach 12 Monaten)
Schritte 4 und 5 wiederholen (`-U` überschreibt den Schlüsselbund-Eintrag), danach das alte Secret im Portal löschen.
Das Plugin zeigt bei abgelaufenem Secret `Secret abgelaufen` (AADSTS7000222), bei falschem `Secret falsch` (AADSTS7000215).

## Zurückziehen
In dieser Reihenfolge, damit nichts mit gültigem Secret übrig bleibt:
1. **Secret sperren:** App → Zertifikate & Geheimnisse → Secret `ai-usage-deck` → Löschen. Ab jetzt stellt der
   Token-Endpunkt kein Token mehr aus (bereits ausgestellte Tokens laufen nach spätestens ~1 h ab).
2. **Consent entziehen:** Entra → Enterprise-Anwendungen → `Nexus.365 AI Usage Deck` → Berechtigungen → Zustimmung
   widerrufen, oder die Enterprise-App löschen (entfernt Consent und Service Principal).
3. **App-Registrierung löschen:** App-Registrierungen → `Nexus.365 AI Usage Deck` → Löschen (30 Tage wiederherstellbar
   unter „Gelöschte Anwendungen“).
4. **Lokal:** `security delete-generic-password -s m365-copilot-app -a "$USER"` und in der Taste wieder
   „az CLI (Weg A)“ wählen.

Prüfen: `node bin/cli.js doctor` zeigt danach für Weg B `Keychain "m365-copilot-app"` = `missing`.
