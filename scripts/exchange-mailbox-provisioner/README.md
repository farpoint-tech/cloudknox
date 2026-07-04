# Exchange Mailbox Provisioner

**Pfad:** `scripts/exchange-mailbox-provisioner/Provisioning.ps1`
**Version:** 4.0 | **Autor:** Farpoint Technologies
**Sprache:** Deutsch

## Was macht dieses Script?

Provisioniert Shared Mailboxes und Verteilergruppen (Distribution Groups) in Exchange Online auf Basis einer Excel-Datei. Die Excel-Datei enthält auf **einem Worksheet** zwei **benannte Tabellen** (ListObjects), die das Script automatisch erkennt:

- **`SharedMailboxes`** - Shared Mailboxes inkl. Weiterleitung, FullAccess- und SendAs-Berechtigungen
- **`DistributionGroups`** - Verteilergruppen inkl. Mitglieder und Besitzer

Konfiguration wie Standarddomain, Anzeigenamen-Präfixe und Authentifizierungsmodus werden aus einer `config.json` gelesen. Vor dem Anlegen führt das Script eine vollständige Vorab-Validierung aller Zeilen durch (Pflichtfelder, E-Mail-Syntax, doppelte Aliase) und fragt bei Problemen nach Bestätigung.

## Funktionsweise (Schritt für Schritt)

1. **Module prüfen** - `ExchangeOnlineManagement` und `ImportExcel`, bei Fehlen Installation anbieten
2. **Konfiguration laden** - `config.json` einlesen
3. **Excel-Datei öffnen** - Tabellen `SharedMailboxes` und `DistributionGroups` als benannte Tabellen auslesen
4. **Vorab-Validierung** - Pflichtfelder, E-Mail-Adressen, doppelte Aliase in allen Zeilen prüfen
5. **Bestätigung bei Problemen** - Bei Validierungsfehlern den Benutzer fragen, ob mit den gültigen Zeilen fortgefahren werden soll
6. **Exchange Online verbinden** - Interaktiv oder per App-Registrierung (Zertifikat)
7. **Shared Mailboxes erstellen** - Alias normalisieren, Mailbox anlegen, Weiterleitung + FullAccess + SendAs setzen, HiddenFromGAL anwenden
8. **Distribution Groups erstellen** - Gruppe anlegen, Besitzer setzen, Mitglieder hinzufügen, HiddenFromGAL anwenden
9. **Ergebnisbericht** - Zusammenfassung in Log und CSV-Export
10. **Verbindung trennen** - Sauberer Disconnect von Exchange Online

## Excel-Tabellenstruktur

Beide Tabellen teilen sich ein Worksheet. Die Spalten werden über die Tabellenüberschrift erkannt.

### Tabelle `SharedMailboxes`

| Spalte | Pflicht | Beschreibung |
|--------|---------|--------------|
| `Vorname` | ja | Erster Namensbestandteil |
| `Nachname` | ja | Zweiter Namensbestandteil |
| `Zusatz` | ja | Dritter Namensbestandteil (z. B. Abteilung) |
| `Anzeigename` | nein | Überschreibt den generierten Anzeigenamen |
| `PrimaereAdresse` | nein | Überschreibt die aus Alias + Domain generierte SMTP-Adresse |
| `Weiterleitung` | nein | Externe Weiterleitungsadresse |
| `FullAccess` | nein | Benutzer mit Vollzugriff (mehrere durch `;` trennen) |
| `SendAs` | nein | Benutzer mit SendAs-Berechtigung (mehrere durch `;` trennen) |
| `HiddenFromGAL` | nein | `true`/`false` - verbirgt das Postfach in der GAL |

### Tabelle `DistributionGroups`

| Spalte | Pflicht | Beschreibung |
|--------|---------|--------------|
| `Vorname` | ja | Erster Namensbestandteil |
| `Nachname` | ja | Zweiter Namensbestandteil |
| `Zusatz` | ja | Dritter Namensbestandteil |
| `Anzeigename` | nein | Überschreibt den generierten Anzeigenamen |
| `PrimaereAdresse` | nein | Überschreibt die aus Alias + Domain generierte SMTP-Adresse |
| `Mitglieder` | nein | Mitglieder der Gruppe (mehrere durch `;` trennen) |
| `Besitzer` | nein | ManagedBy-Besitzer der Gruppe (mehrere durch `;` trennen) |
| `HiddenFromGAL` | nein | `true`/`false` - verbirgt die Gruppe in der GAL |

## Konfiguration (`config.json`)

```json
{
  "general": {
    "excelFile": "Provisioning.xlsx",
    "domain": "contoso.com",
    "delimiter": ";",
    "displayNamePrefixSharedMailbox": "SM - ",
    "displayNamePrefixDistributionGroup": "DG - ",
    "defaultHiddenFromGAL": false,
    "allowExternalForwarding": false
  },
  "authentication": {
    "mode": "interactive",
    "appId": "",
    "organization": "",
    "certificateThumbprint": ""
  }
}
```

### Felder

| Feld | Beschreibung |
|------|--------------|
| `general.excelFile` | Name der Excel-Datei im Scriptverzeichnis |
| `general.domain` | Standarddomain für generierte SMTP-Adressen |
| `general.delimiter` | Trennzeichen für Multivalue-Spalten (Standard `;`) |
| `general.displayNamePrefixSharedMailbox` | Präfix für Shared-Mailbox-Anzeigenamen |
| `general.displayNamePrefixDistributionGroup` | Präfix für Verteilergruppen-Anzeigenamen |
| `general.defaultHiddenFromGAL` | Standardwert für `HiddenFromGAL` |
| `general.allowExternalForwarding` | `true` erlaubt Weiterleitungen zu fremden Domains; Standard `false` = externe Ziele werden bei der Validierung abgewiesen |
| `authentication.mode` | `interactive` (Web-Login) oder `app` (App-Registrierung) |
| `authentication.appId` | App-ID (nur bei `mode=app`) |
| `authentication.organization` | Tenant (z. B. `contoso.onmicrosoft.com`, nur bei `mode=app`) |
| `authentication.certificateThumbprint` | Zertifikats-Thumbprint (nur bei `mode=app`) |

## Parameter

| Parameter | Typ | Beschreibung | Standard |
|-----------|-----|-------------|----------|
| `-ConfigFileName` | String | Name der Konfigurationsdatei | `config.json` |
| `-ExcelFileName` | String | Überschreibt den Excel-Dateinamen aus der Config | – |
| `-WhatIf` | Switch | Zeigt geplante Aktionen ohne Ausführung | – |
| `-Confirm` | Switch | Fordert bei jeder Aktion Bestätigung | – |
| `-Force` | Switch | Unterdrückt alle interaktiven Rückfragen (für Scheduled Tasks / unbeaufsichtigte Läufe) | – |

## Verwendungsbeispiele

```powershell
# Standardlauf mit config.json und interaktivem Login
.\Provisioning.ps1

# Testlauf ohne echte Änderungen
.\Provisioning.ps1 -WhatIf

# Andere Excel-Datei verwenden
.\Provisioning.ps1 -ExcelFileName "Test.xlsx"

# Andere Konfigurationsdatei verwenden
.\Provisioning.ps1 -ConfigFileName "config-prod.json"

# Unbeaufsichtigter Lauf ohne Rückfragen (Scheduled Task / CI-Pipeline)
.\Provisioning.ps1 -Force
```

## Benötigte Module

- `ExchangeOnlineManagement` (wird bei Bedarf automatisch installiert)
- `ImportExcel` (wird bei Bedarf automatisch installiert)

## Benötigte Berechtigungen

- **Exchange Administrator** oder **Global Administrator** (mindestens Rolle für `New-Mailbox`, `New-DistributionGroup`, `Add-MailboxPermission`, `Add-RecipientPermission`)
- Bei App-Authentifizierung: App mit Exchange-Rolle und hinterlegtem Zertifikat

## Ausgabedateien

| Datei | Beschreibung |
|-------|--------------|
| `Provisioning_<Zeitstempel>.log` | Vollständiges Ausführungslog |
| `Provisioning_Results_<Zeitstempel>.csv` | Ergebnisübersicht aller verarbeiteten Zeilen |

Beide Dateien werden unter Windows mit **restriktiven NTFS-ACLs** angelegt (nur ausführender Benutzer, SYSTEM und lokale Administratoren), da sie die Berechtigungsstruktur und Weiterleitungsadressen enthalten.

### Werte der CSV-Spalte `Action`

| Wert | Bedeutung |
|------|-----------|
| `Created` | Objekt vollständig erstellt und konfiguriert |
| `WhatIf` | Trockenlauf - Objekt wurde nicht erstellt |
| `Failed` | Erstellung fehlgeschlagen, kein Objekt vorhanden |
| `Declined` | Benutzer hat die Aktion bei einer `-Confirm`-Abfrage abgelehnt |
| `PartiallyCreated` | **Achtung:** Objekt wurde angelegt, aber die Konfiguration (Weiterleitung, Berechtigungen, Mitglieder) ist unvollständig - manuelle Prüfung erforderlich |

## Funktionsmerkmale

- **Automatische Alias-Normalisierung** - Umlaute (ä/ö/ü/ß) werden ersetzt, Sonderzeichen entfernt
- **Doppelte Alias-Erkennung** - Kollisionen innerhalb der Excel-Datei werden vorab erkannt
- **E-Mail-Validierung** - Alle Multivalue-Spalten werden vor der Ausführung geprüft
- **Existenzprüfung** - Vor dem Anlegen wird geprüft, ob Alias oder SMTP-Adresse bereits belegt sind
- **Idempotente Berechtigungen** - Bereits gesetzte FullAccess-/SendAs-Berechtigungen werden übersprungen
- **Fehlertoleranz** - Fehlschläge einzelner Zeilen unterbrechen nicht die gesamte Ausführung
- **Teilfehler-Erkennung** - Unvollständig konfigurierte Objekte werden als `PartiallyCreated` markiert
- **-WhatIf Unterstützung** - Vollständige Trockenlauf-Funktionalität mit Log-Banner
- **Anzeigename-Sanitierung** - AD-ungültige Zeichen (`/ \ : * ? " < > |`) werden automatisch ersetzt

## Sicherheitsmerkmale (Blue Team)

- **Least Privilege Session** - Die Exchange-Verbindung lädt via `-CommandName` nur die 12 tatsächlich benötigten Cmdlets, nicht das gesamte EXO-Modul
- **Externe Weiterleitungen standardmäßig blockiert** - Weiterleitungen zu fremden Domains werden bei der Validierung abgewiesen, solange `general.allowExternalForwarding` nicht explizit auf `true` steht; erlaubte Fälle erzeugen zusätzlich einen `SICHERHEITSHINWEIS` im Log (Datenabfluss-Prävention)
- **CSV-Injection-Schutz** - Zellwerte mit führenden Formelzeichen (`= + - @` Tab/CR) werden im Ergebnis-CSV neutralisiert, damit beim Öffnen in Excel kein Code ausgeführt wird
- **Log-Sanitierung** - Zeilenumbrüche und Steuerzeichen aus Excel-Zellen werden entfernt, bevor sie ins Log geschrieben werden (kein Log-Forging)
- **Geschützte Ausgabedateien** - Log und CSV erhalten restriktive ACLs (sprachneutral über SIDs); schlägt der ACL-Schutz fehl, erscheint ein deutlicher `SICHERHEITSHINWEIS` in Log und Zusammenfassung
- **Kein Silent Fallback** - Unbekannte Auth-Modi brechen ab statt still interaktiv zu verbinden
- **Config-Validierung** - Fehlende Pflichtfelder in der config.json werden beim Start mit klarer Meldung abgewiesen
- **WhatIf-sichere Berichte** - Log und Ergebnis-CSV werden auch im `-WhatIf`-Lauf geschrieben (die Simulation betrifft nur Exchange-Objekte, nicht das Reporting)
