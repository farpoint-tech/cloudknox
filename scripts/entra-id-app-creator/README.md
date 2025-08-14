# Entra ID App Creator

## Beschreibung

Automatisierte PowerShell-Lösung für die Erstellung von App-Registrierungen und Enterprise Apps in Microsoft Entra ID (ehemals Azure AD). Dieses Script vereinfacht den komplexen Prozess der App-Erstellung und konfiguriert automatisch API-Berechtigungen, Client Secrets und Service Principals.

## Hauptfunktionen

### 🚀 Vollautomatische App-Erstellung
- **App-Registrierung**: Automatische Erstellung neuer App-Registrierungen
- **Enterprise App**: Automatische Erstellung des zugehörigen Service Principals
- **Client Secret**: Generierung sicherer Client Secrets mit konfigurierbarer Gültigkeit
- **API-Berechtigungen**: Interaktive Konfiguration von Microsoft Graph-Berechtigungen

### 🔐 Umfassende Authentifizierungsunterstützung
- **Service Principal Authentication**: Vollständige Konfiguration für automatisierte Authentifizierung
- **Multiple Auth-Methoden**: Unterstützung für Azure CLI, PowerShell und REST API
- **Sichere Credential-Verwaltung**: Automatische Generierung und sichere Anzeige von Secrets
- **Tenant-spezifische Konfiguration**: Flexible Tenant-Auswahl und -Konfiguration

### 📊 Interaktive Benutzerführung
- **Schritt-für-Schritt-Anleitung**: Benutzerfreundliche interaktive Eingabeaufforderungen
- **Vordefinierte Berechtigungen**: Auswahl aus häufig verwendeten Microsoft Graph-Berechtigungen
- **Benutzerdefinierte Berechtigungen**: Möglichkeit zur Eingabe spezifischer API-Berechtigungen
- **Validierung und Fehlerbehandlung**: Umfassende Überprüfung und Fehlerbehandlung

### 🔔 Detaillierte Ausgabe und Dokumentation
- **Kopierbare Ergebnisse**: Strukturierte Ausgabe aller wichtigen Informationen
- **Authentifizierungsbeispiele**: Fertige Code-Beispiele für verschiedene Plattformen
- **Troubleshooting-Hinweise**: Hilfestellungen bei häufigen Problemen
- **Sicherheitshinweise**: Wichtige Informationen zur sicheren Verwendung

## Voraussetzungen

### PowerShell und Module
- PowerShell 5.1 oder höher
- Microsoft Graph PowerShell SDK (wird automatisch installiert)
- Internetverbindung zu Microsoft Entra ID

### Berechtigungen
- **Global Administrator** oder **Application Administrator** in Entra ID
- Berechtigung zur Erstellung von App-Registrierungen
- Berechtigung zur Verwaltung von Enterprise Apps

### Erforderliche Graph-Berechtigungen
- `Application.ReadWrite.All`
- `Directory.ReadWrite.All`

## Verwendung

### Grundlegende Ausführung
```powershell
# Script ausführen
.\Create-EntraIDApp.ps1

# Das Script führt Sie durch folgende Schritte:
# 1. Tenant-ID eingeben
# 2. Anmeldung mit Administrator-Account
# 3. App-Details konfigurieren
# 4. API-Berechtigungen auswählen (optional)
# 5. Automatische Erstellung und Konfiguration
```

### Interaktive Konfiguration

#### 1. Tenant-Auswahl
```
Bitte geben Sie die Tenant-ID oder den Tenant-Namen ein (z.B. contoso.onmicrosoft.com)
```

#### 2. App-Details
```
Name der App: MyAutomationApp
Name des Autors/Owners: John Doe
Gültigkeitsdauer des Client Secrets in Jahren [Standard: 1]: 2
```

#### 3. API-Berechtigungen (Optional)
```
Möchten Sie API-Berechtigungen für die App konfigurieren? (J/N) [Standard: N]: J

Häufig verwendete Microsoft Graph Berechtigungen:
1. User.Read - Lesen des Benutzerprofils
2. User.ReadBasic.All - Lesen grundlegender Profile aller Benutzer
3. User.Read.All - Lesen aller Benutzerprofile
4. Directory.Read.All - Lesen von Verzeichnisdaten
5. Directory.ReadWrite.All - Lesen und Schreiben von Verzeichnisdaten
...
```

## Unterstützte API-Berechtigungen

### Vordefinierte Microsoft Graph-Berechtigungen

#### Benutzer-Berechtigungen
- **User.Read** (Delegated) - Lesen des Benutzerprofils
- **User.ReadBasic.All** (Delegated) - Lesen grundlegender Profile aller Benutzer
- **User.Read.All** (Application) - Lesen aller Benutzerprofile

#### Verzeichnis-Berechtigungen
- **Directory.Read.All** (Application) - Lesen von Verzeichnisdaten
- **Directory.ReadWrite.All** (Application) - Lesen und Schreiben von Verzeichnisdaten

#### Gruppen-Berechtigungen
- **Group.Read.All** (Application) - Lesen aller Gruppenprofile
- **Group.ReadWrite.All** (Application) - Lesen und Schreiben von Gruppenprofilen

#### E-Mail-Berechtigungen
- **Mail.Read** (Application) - Lesen von E-Mails
- **Mail.Send** (Application) - Senden von E-Mails

#### SharePoint-Berechtigungen
- **Sites.Read.All** (Application) - Lesen aller SharePoint-Websitesammlungen
- **Sites.ReadWrite.All** (Application) - Lesen und Schreiben aller SharePoint-Websitesammlungen

### Benutzerdefinierte Berechtigungen
Das Script unterstützt auch die Eingabe benutzerdefinierter API-Berechtigungen:
- Beliebige API-ID
- Spezifische Berechtigungsnamen
- Delegated oder Application-Typ

## Ausgabe und Ergebnisse

### Strukturierte Ergebnisanzeige
```
=== App-Registrierung ===
Name: MyAutomationApp
App (Client) ID: 12345678-1234-1234-1234-123456789012
Object ID: 87654321-4321-4321-4321-210987654321

=== Client Secret ===
Wert: abcdef123456789...
Gültig bis: 14.08.2027 21:30:22

=== Enterprise App ===
Name: MyAutomationApp
Object ID: 11111111-2222-3333-4444-555555555555

=== Tenant Information ===
Tenant ID: 99999999-8888-7777-6666-555555555555
Tenant Name: contoso.onmicrosoft.com
```

### Authentifizierungsbeispiele

#### Azure CLI
```bash
az login --service-principal -u 12345678-1234-1234-1234-123456789012 -p "abcdef123456789..." --tenant 99999999-8888-7777-6666-555555555555
```

#### PowerShell
```powershell
$credential = New-Object System.Management.Automation.PSCredential("12345678-1234-1234-1234-123456789012", (ConvertTo-SecureString "abcdef123456789..." -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential $credential -Tenant "99999999-8888-7777-6666-555555555555"
```

#### Microsoft Graph PowerShell
```powershell
$clientSecret = ConvertTo-SecureString "abcdef123456789..." -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential("12345678-1234-1234-1234-123456789012", $clientSecret)
Connect-MgGraph -ClientSecretCredential $credential -TenantId "99999999-8888-7777-6666-555555555555"
```

## Sicherheitshinweise

### Client Secret-Verwaltung
- **Einmalige Anzeige**: Client Secrets werden nur einmal angezeigt
- **Sichere Speicherung**: Secrets sollten in sicheren Credential-Stores gespeichert werden
- **Regelmäßige Rotation**: Secrets sollten regelmäßig erneuert werden
- **Minimale Berechtigungen**: Nur erforderliche API-Berechtigungen zuweisen

### Best Practices
- **Prinzip der minimalen Berechtigung**: Nur notwendige Berechtigungen vergeben
- **Monitoring**: App-Nutzung regelmäßig überwachen
- **Dokumentation**: App-Zweck und -Verwendung dokumentieren
- **Lifecycle-Management**: Nicht mehr verwendete Apps regelmäßig entfernen

## Fehlerbehebung

### Häufige Probleme

#### 1. Anmeldungsfehler
```
Fehler bei der Anmeldung: Insufficient privileges to complete the operation
```
**Lösung**: Stellen Sie sicher, dass Sie Global Administrator oder Application Administrator-Rechte haben.

#### 2. Modul-Installation fehlgeschlagen
```
Microsoft Graph PowerShell Modul wird installiert...
Install-Module: Access denied
```
**Lösung**: PowerShell als Administrator ausführen oder `-Scope CurrentUser` verwenden.

#### 3. Berechtigung nicht gefunden
```
⚠ Konnte Berechtigung nicht finden: CustomPermission.Read
```
**Lösung**: Überprüfen Sie die Schreibweise der benutzerdefinierten Berechtigung.

#### 4. Service Principal-Erstellung verzögert
```
⚠ Enterprise App konnte nicht verifiziert werden. Möglicherweise ist sie noch in Bearbeitung.
```
**Lösung**: Dies ist normal. Die Enterprise App wird asynchron erstellt und ist nach wenigen Minuten verfügbar.

### Debug-Modus
```powershell
# Erweiterte Protokollierung aktivieren
$VerbosePreference = "Continue"
$DebugPreference = "Continue"
.\Create-EntraIDApp.ps1
```

## Automatisierung und Integration

### Unattended-Modus (Geplante Entwicklung)
```powershell
# Zukünftige Funktionalität für automatisierte Ausführung
.\Create-EntraIDApp.ps1 -AppName "AutoApp" -Owner "System" -SecretYears 1 -Permissions @("User.Read", "Directory.Read.All") -Unattended
```

### CI/CD-Integration
Das Script kann in CI/CD-Pipelines integriert werden für:
- Automatische App-Erstellung in verschiedenen Umgebungen
- Infrastructure as Code-Implementierungen
- DevOps-Automatisierung

### PowerShell-Module-Integration
```powershell
# Als Funktion in eigenen Modulen verwenden
Import-Module .\Create-EntraIDApp.ps1
New-EntraIDApp -Name "MyApp" -Owner "DevTeam"
```

## Compliance und Governance

### Audit-Trail
- Alle erstellten Apps werden mit Erstellungsdatum und Owner-Information versehen
- Vollständige Protokollierung aller Aktionen
- Nachverfolgbare App-Erstellung

### Governance-Integration
- Kompatibel mit Azure AD Governance-Richtlinien
- Unterstützung für App-Lifecycle-Management
- Integration in bestehende Approval-Workflows möglich

## Erweiterte Funktionen

### Batch-Erstellung (Geplant)
- Erstellung mehrerer Apps aus CSV-Datei
- Template-basierte App-Konfiguration
- Massenverarbeitung für große Organisationen

### Monitoring-Integration (Geplant)
- Integration mit Azure Monitor
- Automatische Benachrichtigungen bei App-Erstellung
- Usage Analytics und Reporting

## Autor

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Erste Veröffentlichung der automatisierten Entra ID App-Erstellung

## Support

### Technischer Support
1. **Berechtigungen überprüfen**: Global Admin oder Application Admin-Rechte erforderlich
2. **Module-Installation**: Microsoft Graph PowerShell SDK muss verfügbar sein
3. **Netzwerk-Konnektivität**: Verbindung zu Microsoft Entra ID erforderlich
4. **Debug-Modus aktivieren**: Für detaillierte Fehlermeldungen

### Häufige Anwendungsfälle
- **DevOps-Automatisierung**: Service Principal für CI/CD-Pipelines
- **Monitoring-Apps**: Apps für System-Monitoring und -Überwachung
- **Integration-Services**: Apps für Dritt-System-Integrationen
- **Backup-Lösungen**: Service Principals für automatisierte Backups

### Weiterführende Dokumentation
- [Microsoft Graph API-Referenz](https://docs.microsoft.com/en-us/graph/api/overview)
- [Azure AD App-Registrierung](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Service Principal Best Practices](https://docs.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal)

