# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-03-26

### Added
- **Fehlerbehandlung (Error Handling):** Vollständige `try...catch` Blöcke für Graph-Verbindungen und alle Export-Schritte.
- **Logging:** Neue `Write-Log` Funktion, die Konsolenausgaben farbig darstellt und gleichzeitig in eine `export.log` Datei schreibt.
- **Namensauflösung:** Neue Funktionen `Resolve-GroupName` und `Resolve-RoleName`, um unleserliche IDs in der CSV durch echte Namen zu ersetzen (inklusive Caching für bessere Performance).
- **Risikobewertung:** Neue Funktion `Get-PolicyRiskLevel`, die Policies als LOW, MEDIUM oder HIGH einstuft (z.B. wenn "All Users" ohne Ausnahmen betroffen sind).
- **Paginierung:** Parameter `-All` zu `Get-MgIdentityConditionalAccessPolicy` hinzugefügt, um sicherzustellen, dass auch in großen Tenants *alle* Policies abgerufen werden.
- **HTML Report:** Generierung eines visuell ansprechenden Management-Summary-Reports (`CA-Report.html`).
- **Neue Exporte:** Zusätzlicher Export für deaktivierte Policies (`CA-Disabled.csv`).
- **Parameter:** Das Skript akzeptiert nun Parameter (`-ExportPath`, `-TenantId`, `-ResolveNames`, `-SkipModuleInstall`), was es ideal für MSP-Szenarien und Automatisierung macht.

### Changed
- **Modul-Management:** Die Installation der Module wird nun vorher geprüft. Module werden nur installiert/geladen, wenn sie fehlen.
- **Admin-Filter:** Der Filter für Admin-Policies prüft nun nicht mehr nur auf den Namen, sondern auch zuverlässig auf zugewiesene privilegierte Rollen-IDs (z.B. Global Admin, Security Admin).
- **Struktur:** Code in logische Regionen unterteilt für bessere Lesbarkeit und Wartbarkeit.

### Security
- Bestätigung und Dokumentation des "Least Privilege" Prinzips: Es werden ausschließlich `*.Read.All` Scopes verwendet.
- Keine Notwendigkeit für Administrator-Rechte auf dem ausführenden System, Modul-Installation auf `CurrentUser` Scope begrenzt.

## [1.0.0] - Initiale Version
- Basis-Skript zum Export von JSON, CSV und Assignments (ohne Namensauflösung).
