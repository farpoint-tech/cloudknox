# Entra ID Conditional Access Exporter

Ein robustes, sicheres und MSP-fähiges PowerShell-Skript zum Exportieren und Dokumentieren aller Microsoft Entra ID Conditional Access Policies.

## 🚀 Features

- **Vollständiges Backup:** Exportiert alle Policies im originalen JSON-Format.
- **Detaillierte CSV-Reports:** Erstellt strukturierte CSV-Dateien für Übersicht, Zuweisungen (Assignments), Report-Only und deaktivierte Policies.
- **Namensauflösung:** Löst automatisch Gruppen- und Rollen-IDs in lesbare Namen auf.
- **Risikobewertung:** Bewertet Policies automatisch nach Risiko (z. B. wenn "All Users" ohne Ausnahmen eingeschlossen sind).
- **Admin-Filter:** Extrahiert gezielt Policies, die für privilegierte Rollen (Admins) gelten.
- **HTML-Zusammenfassung:** Generiert einen visuell ansprechenden HTML-Report für schnelle Audits.
- **Security First:** Benötigt ausschließlich Read-Only Berechtigungen (`Policy.Read.All`, `Directory.Read.All`).
- **MSP-Ready:** Unterstützt die Angabe einer `TenantId` für Multi-Tenant-Umgebungen.

## 🔒 Security & Privacy

Dieses Skript wurde nach dem Prinzip des **Least Privilege** entwickelt:
- Es führt **keine** schreibenden oder destruktiven Aktionen aus.
- Es werden **keine** Passwörter, Secrets oder Tokens im Code oder in den Exporten gespeichert.
- Die Authentifizierung erfolgt sicher über das offizielle Microsoft Graph PowerShell SDK.

**Benötigte Graph Scopes:**
- `Policy.Read.All`
- `Directory.Read.All`
- `RoleManagement.Read.Directory`

## 🛠️ Voraussetzungen

- **PowerShell 7.0 oder höher** (Windows, macOS, Linux)
- Ein Entra ID Account mit Leserechten (z. B. Security Reader oder Global Reader)
- Internetverbindung für die Graph API und Modul-Downloads

Das Skript installiert fehlende Microsoft Graph Module automatisch (sofern Berechtigungen vorhanden sind).

## 📥 Installation & Nutzung

1. **Repository klonen oder Skript herunterladen:**
   ```powershell
   git clone https://github.com/farpoint-tech/cloudknox.git
   cd cloudknox
   ```

2. **Skript ausführen:**
   ```powershell
   .\Export-ConditionalAccessPolicies.ps1
   ```

3. **Optionale Parameter nutzen:**
   ```powershell
   # Benutzerdefinierter Export-Pfad und Namensauflösung deaktivieren (schneller)
   .\Export-ConditionalAccessPolicies.ps1 -ExportPath "C:\CA-Backup" -ResolveNames:$false

   # Für einen spezifischen Tenant ausführen (MSP-Szenario)
   .\Export-ConditionalAccessPolicies.ps1 -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

## 📂 Exportierte Dateien

Nach dem Durchlauf finden Sie im Export-Ordner folgende Dateien:

| Datei | Beschreibung |
|-------|--------------|
| `ConditionalAccess-Backup.json` | Das vollständige, ungefilterte Backup aller Policies. |
| `CA-Overview.csv` | Eine flache Übersicht aller Policies mit Status und Datum. |
| `CA-Assignments.csv` | Detaillierte Auflistung, wer (Benutzer, Gruppen, Rollen) eingeschlossen/ausgeschlossen ist. |
| `Admin-Policies.json` | Separiertes Backup aller Policies, die privilegierte Rollen betreffen. |
| `CA-ReportOnly.csv` | Liste aller Policies, die sich im Report-Only-Modus befinden. |
| `CA-Disabled.csv` | Liste aller deaktivierten Policies. |
| `CA-Report.html` | Ein formatierter Management-Summary-Report im HTML-Format. |
| `export.log` | Detailliertes Protokoll des Export-Vorgangs. |

## 👨‍💻 Autor

**CloudKnox** / farpoint technologies ag  
Zero Trust, Zero Drama, Zero Bullshit.

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE) Datei für Details.
