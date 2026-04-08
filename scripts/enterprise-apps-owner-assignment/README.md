# Enterprise Apps Owner Assignment

## Beschreibung

Umfassende PowerShell-Loesung zur Analyse, Zuweisung und Verwaltung von Ownern fuer Enterprise Applications (Service Principals) in Azure Entra ID. Die Loesung nutzt die Microsoft Graph API und ist als 3-Phasen-Workflow aufgebaut, ergaenzt durch ein Standalone-Script fuer einfache Bulk-Zuweisungen.

## Hauptfunktionen

- 📊 **Vollstaendige Tenant-Analyse** – Erkennt alle Tags, Kategorien und Owner-Status aller Enterprise Apps
- 📤 **Excel-Export fuer Abteilungen** – Generiert formatierte Excel-Dateien mit AutoFilter, Farbcodierung und Freeze-Header
- 📥 **Excel-Import mit Dry-Run** – Liest ausgefuellte Excel-Dateien zurueck und weist Owner zu (mit WhatIf-Modus)
- 🎯 **Interaktive Kategorie-Zuweisung** – Owner per Kategorie oder global zuweisen
- 🔄 **Standalone Bulk-Zuweisung** – Einfaches Script fuer einen Default-Owner auf alle Apps ohne Owner

## Scripts im Ueberblick

| Phase | Script | Beschreibung |
|-------|--------|--------------|
| **1 – Analyse & Export** | `Export-EnterpriseAppOwnerList.ps1` | Tag-Analyse, Kategorie-Uebersicht, Excel-Export |
| **2 – Import & Zuweisung** | `Import-EnterpriseAppOwners.ps1` | Excel einlesen, Owner zuweisen (WhatIf/Apply) |
| **3 – Interaktiv** | `Assign-OwnerByCategory.ps1` | Owner per Kategorie oder global zuweisen |
| **Standalone** | `Assign-EnterpriseAppOwners.ps1` | Default-Owner fuer alle Apps ohne Owner |

## Voraussetzungen

### PowerShell-Module

```powershell
# Microsoft Graph SDK
Install-Module Microsoft.Graph -Scope CurrentUser

# ImportExcel (fuer Excel-Export/Import ohne Office)
Install-Module ImportExcel -Scope CurrentUser
```

### Erforderliche Graph-Berechtigungen

| Script | Berechtigungen |
|--------|---------------|
| Export (Phase 1) | `Application.Read.All`, `Directory.Read.All` |
| Import (Phase 2) | `Application.ReadWrite.All`, `Directory.ReadWrite.All` |
| Interaktiv (Phase 3) | `Application.ReadWrite.All`, `Directory.ReadWrite.All` |
| Standalone | `Application.Read.All`, `Directory.ReadWrite.All` |

### Rollen

Der ausfuehrende Account benoetigt mindestens eine der folgenden Entra ID Rollen:
- **Global Administrator**
- **Application Administrator**

## Verwendung

### Phase 1 – Analyse & Excel-Export

```powershell
# Alle Enterprise Apps analysieren und als Excel exportieren
.\Export-EnterpriseAppOwnerList.ps1
```

**Ausgabe:**
- Konsolenausgabe mit Tag-Uebersicht und Kategorie-Zusammenfassung
- Excel-Datei `EnterpriseApp_OwnerAssignment_YYYYMMDD.xlsx` im aktuellen Verzeichnis
- Die Excel-Datei an die jeweiligen Abteilungen senden – diese fuellen Spalten I (NEW Owner UPN), J (Department) und K (Notes) aus

### Phase 2 – Import & Owner-Zuweisung

```powershell
# Dry-Run (Standard) – zeigt geplante Zuweisungen an
.\Import-EnterpriseAppOwners.ps1 -ExcelPath ".\EnterpriseApp_OwnerAssignment_20260408.xlsx"

# Live-Ausfuehrung – weist Owner tatsaechlich zu
.\Import-EnterpriseAppOwners.ps1 -ExcelPath ".\EnterpriseApp_OwnerAssignment_20260408.xlsx" -Mode Apply
```

### Phase 3 – Interaktive Zuweisung

```powershell
# Startet interaktiven Modus mit Kategorie-Auswahl
.\Assign-OwnerByCategory.ps1
```

**Interaktiver Ablauf:**
1. Script zeigt alle verfuegbaren Kategorien (basierend auf Tags)
2. Auswahl: `0` fuer alle Apps, oder kommagetrennte Nummern (z.B. `1,3`)
3. Eingabe des Owner-UPN
4. Zuweisung laeuft automatisch (Apps mit bestehendem Owner werden uebersprungen)

### Standalone – Bulk-Zuweisung

```powershell
# Vor der Ausfuehrung: $DefaultOwnerUPN im Script anpassen
.\Assign-EnterpriseAppOwners.ps1
```

## Excel-Datei Struktur

Die exportierte Excel-Datei enthaelt folgende Spalten:

| Spalte | Inhalt | Auszufuellen? |
|--------|--------|---------------|
| A – AppObjectId | Service Principal Object ID | Nein |
| B – DisplayName | Name der Enterprise App | Nein |
| C – AppId (Client ID) | Application ID | Nein |
| D – ServicePrincipalType | Typ des Service Principal | Nein |
| E – Tags | Alle Tags der App | Nein |
| F – Category (Tag) | Erster Tag als Kategorie | Nein |
| G – Current Owner(s) | Aktuelle Owner (UPN) | Nein |
| H – Owner Status | "Has Owner" oder "No Owner" | Nein |
| **I – NEW Owner UPN** | **Neuer Owner (UPN eingeben)** | **Ja** |
| **J – Department** | **Abteilung** | **Ja** |
| **K – Notes** | **Notizen** | **Ja** |

## Sicherheitshinweise

- **Dry-Run zuerst**: Immer zuerst `Import-EnterpriseAppOwners.ps1` im WhatIf-Modus ausfuehren
- **Least Privilege**: Fuer Phase 1 (Export) werden nur Read-Berechtigungen benoetigt
- **Audit Trail**: Die Excel-Datei dient als Dokumentation der Owner-Zuweisungen
- **Bestehende Owner**: Kein Script ueberschreibt bestehende Owner – es werden nur fehlende ergaenzt

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| `Import-Module: The specified module 'ImportExcel' was not loaded` | `Install-Module ImportExcel -Scope CurrentUser` |
| `Insufficient privileges to complete the operation` | Entra ID Rolle pruefen (Global Admin oder Application Admin erforderlich) |
| `User 'xxx@domain.com' not found` | UPN in der Excel-Datei pruefen – muss exakt mit dem Entra ID Account uebereinstimmen |
| `Connect-MgGraph: Interactive authentication is not supported` | PowerShell 7+ verwenden oder Device Code Flow nutzen |
