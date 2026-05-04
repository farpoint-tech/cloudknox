# Entra ID Conditional Access Importer

Ein sicheres, plattformübergreifendes PowerShell-Skript zum Importieren von Microsoft Entra ID Conditional Access Policies aus einem JSON-Backup.

Dieses Skript ist das Gegenstück zum [CA Policy Exporter](../entra-ca-policy-exporter/) und liest dessen `ConditionalAccess-Backup.json` direkt ein.

## 🚀 Features

- **Copy-Paste-freundlich:** Pfad zur JSON-Datei wird interaktiv abgefragt – einfach aus dem Explorer oder Finder kopieren und einfügen.
- **Automatische Pfaderkennung:** Anführungszeichen, Tilde (`~`) und falsche Pfadtrennzeichen werden automatisch bereinigt.
- **Dual-Platform:** Läuft nativ auf **Windows** und **macOS** in einem einzigen Script – kein zweites Script nötig.
- **Parallels-Support:** Erkennt automatisch Windows-on-Parallels-Umgebungen und konvertiert macOS-Pfade (`/Users/…`) zu UNC-Pfaden (`\\Mac\Home\…`).
- **Lockout-Schutz:** Policies werden standardmässig als `disabled` importiert. Kein unbeabsichtigtes Enforcement.
- **Duplikat-Erkennung:** Bestehende Policies mit gleichem DisplayName werden übersprungen (oder mit `-Force` überschrieben).
- **WhatIf-Support:** Mit `-WhatIf` wird angezeigt, was importiert würde – ohne tatsächliche Änderungen.
- **MSP-Ready:** Unterstützt `-TenantId` für Multi-Tenant-Szenarien.
- **Locale-unabhängig:** Datum- und Zahlenformate werden nicht vom System beeinflusst.

## 🔒 Security & Privacy

- Policies werden **standardmässig als `disabled` importiert** – kein Risiko eines versehentlichen Tenant-Lockouts.
- Keine Passwörter, Secrets oder Tokens werden gespeichert.
- Authentifizierung über das offizielle Microsoft Graph PowerShell SDK.

**Benötigte Graph Scopes (Delegated):**
- `Policy.ReadWrite.All` – Erstellen und Aktualisieren von Policies
- `Policy.Read.All` – Duplikat-Prüfung

## 🛠️ Voraussetzungen

- **PowerShell 7.0 oder höher** (Windows, macOS, Linux)
- Ein Entra ID Account mit **Conditional Access Administrator** oder **Global Administrator** Rolle
- Internetverbindung für die Graph API und Modul-Downloads

Das Skript installiert fehlende Microsoft Graph Module automatisch.

## 📥 Installation & Nutzung

### 1. Script herunterladen

```powershell
git clone https://github.com/farpoint-tech/cloudknox.git
cd cloudknox/scripts/entra-ca-policy-importer
```

### 2. Standard-Import (empfohlen)

```powershell
.\Import-ConditionalAccessPolicies.ps1
```

Das Script fragt den Pfad zur JSON-Datei interaktiv ab. Pfad einfach aus dem Explorer/Finder kopieren und einfügen – Anführungszeichen werden automatisch entfernt.

### 3. Optionale Parameter

```powershell
# Direkt mit Pfad starten (Windows)
.\Import-ConditionalAccessPolicies.ps1 -ImportFile "C:\Backup\ConditionalAccess-Backup.json"

# Direkt mit Pfad starten (macOS)
.\Import-ConditionalAccessPolicies.ps1 -ImportFile "/Users/john/CA-Export/ConditionalAccess-Backup.json"

# Als Report-Only importieren (kein Enforcement, aber Logs)
.\Import-ConditionalAccessPolicies.ps1 -TargetState enabledForReportingButNotEnforced

# Originalstatus aus dem Backup beibehalten (ACHTUNG: Lockout-Risiko!)
.\Import-ConditionalAccessPolicies.ps1 -TargetState keepOriginal

# Bestehende Policies mit gleichem Namen überschreiben
.\Import-ConditionalAccessPolicies.ps1 -Force

# Nur anzeigen, was importiert würde (kein tatsächlicher Import)
.\Import-ConditionalAccessPolicies.ps1 -WhatIf

# MSP-Szenario: in einen spezifischen Tenant importieren
.\Import-ConditionalAccessPolicies.ps1 -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## 🖥️ Plattform-Unterstützung

| Szenario | Unterstützt | Hinweis |
|----------|-------------|---------|
| Windows (nativ) | ✅ | Vollständig unterstützt |
| macOS (nativ) | ✅ | Vollständig unterstützt |
| Windows via Parallels auf Mac | ✅ | Pfade werden automatisch konvertiert |
| Linux | ✅ | Vollständig unterstützt |

### Parallels-Pfadkonvertierung

Wenn auf Windows (Parallels) ein macOS-Pfad eingefügt wird, z.B.:

```
/Users/john/CA-Export/2026-05-04/ConditionalAccess-Backup.json
```

...konvertiert das Script diesen automatisch zu:

```
\\Mac\Home\CA-Export\2026-05-04\ConditionalAccess-Backup.json
```

Voraussetzung: Parallels Shared Folders sind aktiv (Standard-Einstellung).

## ⚙️ Parameter-Übersicht

| Parameter | Typ | Standard | Beschreibung |
|-----------|-----|----------|--------------|
| `-ImportFile` | String | (interaktiv) | Pfad zur JSON-Backup-Datei |
| `-TenantId` | GUID | (aktueller Tenant) | Tenant-ID für MSP-Szenarien |
| `-TargetState` | String | `disabled` | Status der importierten Policies |
| `-Force` | Switch | `$false` | Bestehende Policies überschreiben |
| `-SkipModuleInstall` | Switch | `$false` | Modul-Installation überspringen |
| `-WhatIf` | Switch | `$false` | Simulation ohne tatsächliche Änderungen |

## ⚠️ Wichtige Hinweise

1. **Lockout-Risiko:** Aktiviere importierte Policies **nie** sofort. Prüfe sie zuerst im Entra-Portal.
2. **IDs werden neu vergeben:** Importierte Policies erhalten neue Object-IDs. Referenzen auf alte IDs sind ungültig.
3. **Gruppen & Rollen:** Gruppen- und Rollen-IDs im Backup müssen im Zieltenant existieren. Andernfalls schlägt der Import für diese Policies fehl.
4. **Named Locations & Terms of Use:** Werden via ID referenziert – müssen im Zieltenant vorhanden sein.
5. **Bestehende Policies:** Ohne `-Force` werden Policies mit gleichem DisplayName übersprungen.

## 📄 Log-Datei

Nach dem Import liegt eine `import.log` im gleichen Ordner wie die JSON-Datei:

```
[2026-05-04 10:00:00] [INFO]    Plattform    : macOS
[2026-05-04 10:00:01] [SUCCESS] Verbunden als: admin@contoso.onmicrosoft.com
[2026-05-04 10:00:02] [SUCCESS]   CREATED  : 'MFA für alle Benutzer' (State: disabled)
[2026-05-04 10:00:03] [WARNING]  SKIPPED  : 'Legacy Auth blockieren' (bereits vorhanden)
[2026-05-04 10:00:04] [SUCCESS] IMPORT ABGESCHLOSSEN
```

## 👨‍💻 Autor

**CloudKnox** / farpoint technologies ag  
Zero Trust, Zero Drama, Zero Bullshit.

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert – siehe [LICENSE](../../LICENSE) für Details.
