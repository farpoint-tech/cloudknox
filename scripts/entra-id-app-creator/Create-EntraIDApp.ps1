<#
.SYNOPSIS
    Erstellt automatisch eine App-Registrierung und Enterprise App in Microsoft Entra ID.

.DESCRIPTION
    Dieses Skript automatisiert den Prozess der Erstellung einer App-Registrierung und der zugehörigen
    Enterprise App (Service Principal) in Microsoft Entra ID. Es ermöglicht die Konfiguration von
    API-Berechtigungen und generiert ein Client Secret für die Authentifizierung.

    Kann vollständig interaktiv ODER via Parameter (nicht-interaktiv/automatisiert) ausgeführt werden.

    Rollback: Falls ein Schritt nach der App-Erstellung fehlschlägt, wird die bereits erstellte App
    automatisch wieder gelöscht, um verwaiste Einträge zu vermeiden.

    Secret-Sicherheit: Das Client Secret wird NUR in der Konsole angezeigt. Eine Datei-Export
    erfordert explizite Zustimmung (-SaveToFile oder interaktive Bestätigung).

.PARAMETER TenantId
    Tenant-ID oder Tenant-Name (z.B. contoso.onmicrosoft.com). Falls nicht angegeben: interaktive Abfrage.

.PARAMETER AppName
    Name der App-Registrierung. Falls nicht angegeben: interaktive Abfrage.

.PARAMETER OwnerName
    Name des Autors/Owners (wird in App-Notizen gespeichert). Standard: aktueller Benutzername.

.PARAMETER SecretValidityYears
    Gültigkeitsdauer des Client Secrets in Jahren. Standard: 1

.PARAMETER SaveToFile
    Wenn angegeben: exportiert die App-Details (inkl. Secret) in eine Textdatei.
    SICHERHEITSHINWEIS: Datei enthält Secret im Klartext – sicher aufbewahren!

.PARAMETER OutputPath
    Pfad für den Datei-Export (nur relevant mit -SaveToFile). Standard: aktuelles Verzeichnis.

.EXAMPLE
    .\Create-EntraIDApp.ps1
    Vollständig interaktiver Modus.

.EXAMPLE
    .\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MeinTool" -SecretValidityYears 2
    Erstellt App nicht-interaktiv mit vordefinierten Werten (Permissions werden trotzdem interaktiv konfiguriert).

.EXAMPLE
    .\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MeinTool" -SaveToFile
    Erstellt App und exportiert Details in eine Datei.

.NOTES
    Erforderliche Berechtigungen:
    - Global Administrator oder Application Administrator in Entra ID
    - Die Microsoft Graph PowerShell-Module müssen installiert sein oder werden automatisch installiert

    Das generierte Client Secret sollte sicher aufbewahrt werden, da es nach der ersten Anzeige
    nicht mehr abgerufen werden kann.

    Version: 2.0
    Aktualisiert: 2026-03-05 - CLI-Parameter, Rollback, Secret-Sicherheit, Code-Refactoring
#>

param(
    [Parameter(HelpMessage="Tenant-ID oder Tenant-Name (z.B. contoso.onmicrosoft.com)")]
    [string]$TenantId,

    [Parameter(HelpMessage="Name der App-Registrierung")]
    [string]$AppName,

    [Parameter(HelpMessage="Name des Owners (wird in App-Notizen gespeichert)")]
    [string]$OwnerName = $env:USERNAME,

    [Parameter(HelpMessage="Gültigkeitsdauer des Client Secrets in Jahren")]
    [ValidateRange(1, 2)]
    [int]$SecretValidityYears = 1,

    [Parameter(HelpMessage="App-Details inkl. Secret in Datei exportieren (SICHERHEITSHINWEIS)")]
    [switch]$SaveToFile,

    [Parameter(HelpMessage="Ausgabepfad für Datei-Export (Standard: aktuelles Verzeichnis)")]
    [string]$OutputPath = "."
)

# ===== HILFSFUNKTION: GRAPH-BERECHTIGUNG HINZUFÜGEN =====
function Add-GraphPermissionToApp {
    param(
        [string]$AppObjectId,
        [string]$ApiId,
        [string]$PermissionName,
        [ValidateSet("Application", "Delegated")]
        [string]$PermType,
        [array]$CurrentAccess
    )

    $sp = Get-MgServicePrincipal -Filter "appId eq '$ApiId'"

    if ($PermType -eq "Application") {
        $role = $sp.AppRoles | Where-Object { $_.Value -eq $PermissionName }
        if (-not $role) {
            Write-Host "   Warnung: Berechtigung '$PermissionName' nicht gefunden." -ForegroundColor Yellow
            return $CurrentAccess
        }
        $accessType = "Role"
        $permId     = $role.Id
    } else {
        $scope = $sp.OAuth2PermissionScopes | Where-Object { $_.Value -eq $PermissionName }
        if (-not $scope) {
            Write-Host "   Warnung: Berechtigung '$PermissionName' nicht gefunden." -ForegroundColor Yellow
            return $CurrentAccess
        }
        $accessType = "Scope"
        $permId     = $scope.Id
    }

    # Prüfen ob API bereits in der Liste ist
    $existingApi = $CurrentAccess | Where-Object { $_.ResourceAppId -eq $ApiId }
    if ($existingApi) {
        $alreadyAdded = $existingApi.ResourceAccess | Where-Object { $_.Id -eq $permId }
        if (-not $alreadyAdded) {
            $existingApi.ResourceAccess += @{ Id = $permId; Type = $accessType }
        }
    } else {
        $CurrentAccess += @{
            ResourceAppId  = $ApiId
            ResourceAccess = @(@{ Id = $permId; Type = $accessType })
        }
    }

    Update-MgApplication -ApplicationId $AppObjectId -RequiredResourceAccess $CurrentAccess
    Write-Host "   ✓ Berechtigung hinzugefügt: $PermissionName ($PermType)" -ForegroundColor Green
    return $CurrentAccess
}

# ===== MODULE PRÜFEN / INSTALLIEREN =====
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph)) {
    Write-Host "Microsoft Graph PowerShell Modul wird installiert..." -ForegroundColor Yellow
    Install-Module -Name Microsoft.Graph -Scope CurrentUser -Force
}

Import-Module Microsoft.Graph.Authentication
Import-Module Microsoft.Graph.Applications

# ===== BANNER =====
Write-Host @"
========================================================================
  Microsoft Entra ID - App-Registrierung und Enterprise App Erstellung
========================================================================

Dieses Skript erstellt automatisch:
- Eine neue App-Registrierung in Entra ID
- Ein Client Secret mit der gewünschten Gültigkeitsdauer
- Eine Enterprise App (Service Principal)
- Konfiguriert API-Berechtigungen nach Ihren Anforderungen

Am Ende erhalten Sie alle notwendigen Informationen für die Authentifizierung:
- Tenant ID
- App (Client) ID
- Client Secret

Voraussetzungen:
- Sie benötigen Global Administrator oder Application Administrator Rechte
- Eine aktive Internetverbindung zu Microsoft Entra ID

"@ -ForegroundColor Cyan

# ===== EINGABEN (interaktiv wenn Parameter fehlen) =====
if (-not $TenantId) {
    $TenantId = Read-Host "Bitte geben Sie die Tenant-ID oder den Tenant-Namen ein (z.B. contoso.onmicrosoft.com)"
}

# Verbindung herstellen
Write-Host "`nBitte melden Sie sich mit einem Benutzer an, der ausreichende Berechtigungen hat (Global Admin oder App Administrator)." -ForegroundColor Cyan
try {
    Connect-MgGraph -TenantId $TenantId -Scopes "Application.ReadWrite.All", "Directory.ReadWrite.All"

    $context = Get-MgContext
    if ($null -eq $context) { throw "Anmeldung fehlgeschlagen." }

    Write-Host "Erfolgreich angemeldet als: $($context.Account)" -ForegroundColor Green
    Write-Host "Verbunden mit Tenant: $($context.TenantId)`n" -ForegroundColor Green
}
catch {
    Write-Host "Fehler bei der Anmeldung: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Bitte stellen Sie sicher, dass Sie die richtigen Anmeldeinformationen verwenden und über ausreichende Berechtigungen verfügen." -ForegroundColor Yellow
    exit 1
}

# App-Details abfragen (wenn nicht via Parameter übergeben)
if (-not $AppName) {
    Write-Host "Bitte geben Sie die Details für die neue App ein:" -ForegroundColor Cyan
    $AppName = Read-Host "Name der App (wird sowohl für App-Registrierung als auch Enterprise App verwendet)"
}

if ($PSBoundParameters.ContainsKey('OwnerName') -eq $false -and $OwnerName -eq $env:USERNAME) {
    $inputOwner = Read-Host "Name des Autors/Owners [Standard: $OwnerName]"
    if (-not [string]::IsNullOrWhiteSpace($inputOwner)) { $OwnerName = $inputOwner }
}

if (-not $PSBoundParameters.ContainsKey('SecretValidityYears')) {
    $inputYears = Read-Host "Gültigkeitsdauer des Client Secrets in Jahren (1-2) [Standard: 1]"
    if ($inputYears -match '^[12]$') { $SecretValidityYears = [int]$inputYears }
}

# Berechtigungen konfigurieren
$configurePermissions = Read-Host "Möchten Sie API-Berechtigungen für die App konfigurieren? (J/N) [Standard: N]"
$permissions = @()

if ($configurePermissions -eq "J" -or $configurePermissions -eq "j") {
    Write-Host "`n=== API-Berechtigungen konfigurieren ===" -ForegroundColor Cyan

    Write-Host @"

Häufig verwendete Microsoft Graph Berechtigungen:
------------------------------------------------
 1. User.Read              - Lesen des Benutzerprofils (Delegated)
 2. User.ReadBasic.All     - Lesen grundlegender Profile aller Benutzer (Delegated)
 3. User.Read.All          - Lesen aller Benutzerprofile (Application)
 4. Directory.Read.All     - Lesen von Verzeichnisdaten (Application)
 5. Directory.ReadWrite.All- Lesen und Schreiben von Verzeichnisdaten (Application)
 6. Group.Read.All         - Lesen aller Gruppenprofile (Application)
 7. Group.ReadWrite.All    - Lesen und Schreiben von Gruppenprofilen (Application)
 8. Mail.Read              - Lesen von E-Mails (Application)
 9. Mail.Send              - Senden von E-Mails (Application)
10. Sites.Read.All         - Lesen aller SharePoint-Websitesammlungen (Application)
11. Sites.ReadWrite.All    - Lesen und Schreiben aller SharePoint-Websitesammlungen (Application)

Benutzerdefinierte Berechtigung:
--------------------------------
12. Benutzerdefinierte Berechtigung eingeben

"@ -ForegroundColor White

    $done = $false
    while (-not $done) {
        Write-Host "`nNummer eingeben oder 'fertig' zum Abschließen:" -ForegroundColor Yellow
        $choice = Read-Host "Auswahl"

        if ($choice -eq "fertig") {
            $done = $true
        } elseif ($choice -eq "12") {
            $apiId          = Read-Host "API-ID (z.B. 00000003-0000-0000-c000-000000000000 für Microsoft Graph)"
            $permissionName = Read-Host "Berechtigungsname (z.B. User.Read)"
            $permissionType = Read-Host "Berechtigungstyp (Application oder Delegated)"

            $permissions += @{ ApiId = $apiId; PermissionName = $permissionName; Type = $permissionType }
            Write-Host "Benutzerdefinierte Berechtigung hinzugefügt: $permissionName ($permissionType)" -ForegroundColor Green
        } elseif ($choice -in 1..11) {
            $permissionMap = @{
                1  = @{ Name = "User.Read";               Type = "Delegated" }
                2  = @{ Name = "User.ReadBasic.All";      Type = "Delegated" }
                3  = @{ Name = "User.Read.All";           Type = "Application" }
                4  = @{ Name = "Directory.Read.All";      Type = "Application" }
                5  = @{ Name = "Directory.ReadWrite.All"; Type = "Application" }
                6  = @{ Name = "Group.Read.All";          Type = "Application" }
                7  = @{ Name = "Group.ReadWrite.All";     Type = "Application" }
                8  = @{ Name = "Mail.Read";               Type = "Application" }
                9  = @{ Name = "Mail.Send";               Type = "Application" }
                10 = @{ Name = "Sites.Read.All";          Type = "Application" }
                11 = @{ Name = "Sites.ReadWrite.All";     Type = "Application" }
            }
            $sel = $permissionMap[[int]$choice]
            $permissions += @{ ApiId = "00000003-0000-0000-c000-000000000000"; PermissionName = $sel.Name; Type = $sel.Type }
            Write-Host "Berechtigung hinzugefügt: $($sel.Name) ($($sel.Type))" -ForegroundColor Green
        } else {
            Write-Host "Ungültige Auswahl. Bitte 1-12 oder 'fertig'." -ForegroundColor Red
        }
    }
}

# ===== ERSTELLUNGSPROZESS MIT ROLLBACK =====
$app             = $null
$secret          = $null
$servicePrincipal = $null

try {
    Write-Host "`nStarte den Erstellungsprozess..." -ForegroundColor Cyan

    # SCHRITT 1: App-Registrierung erstellen
    Write-Host "1. Erstelle neue App-Registrierung: $AppName..." -ForegroundColor Cyan

    $appParams = @{
        DisplayName     = $AppName
        SignInAudience  = "AzureADMyOrg"
        Notes           = "Erstellt von: $OwnerName am $(Get-Date -Format 'dd.MM.yyyy')"
    }

    $app = New-MgApplication @appParams
    Write-Host "   ✓ App-Registrierung erfolgreich erstellt (Object ID: $($app.Id))" -ForegroundColor Green

    # SCHRITT 2: API-Berechtigungen
    if ($permissions.Count -gt 0) {
        Write-Host "2. Konfiguriere API-Berechtigungen..." -ForegroundColor Cyan
        $currentAccess = @()
        if ($app.RequiredResourceAccess) { $currentAccess = @($app.RequiredResourceAccess) }

        foreach ($perm in $permissions) {
            try {
                $currentAccess = Add-GraphPermissionToApp `
                    -AppObjectId   $app.Id `
                    -ApiId         $perm.ApiId `
                    -PermissionName $perm.PermissionName `
                    -PermType      $perm.Type `
                    -CurrentAccess $currentAccess
            } catch {
                Write-Host "   Warnung: Berechtigung $($perm.PermissionName) konnte nicht gesetzt werden: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }

    # SCHRITT 3: Client Secret erstellen
    Write-Host "3. Generiere Client Secret ($SecretValidityYears Jahr(e))..." -ForegroundColor Cyan
    $endDate = (Get-Date).AddYears($SecretValidityYears)

    $secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential @{
        displayName = "Auto-generiertes Secret"
        endDateTime = $endDate
    }
    Write-Host "   ✓ Client Secret erstellt (gültig bis: $($endDate.ToString('dd.MM.yyyy')))" -ForegroundColor Green

    # SCHRITT 4: Service Principal erstellen
    Write-Host "4. Erstelle Enterprise App (Service Principal)..." -ForegroundColor Cyan
    $servicePrincipal = New-MgServicePrincipal -AppId $app.AppId

    Write-Host "   Warte auf Abschluss der Service Principal-Erstellung..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    $checkSP = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'"
    if ($null -eq $checkSP) {
        Start-Sleep -Seconds 10
        $checkSP = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'"
    }

    if ($null -ne $checkSP) {
        Write-Host "   ✓ Enterprise App erstellt (Object ID: $($checkSP.Id))" -ForegroundColor Green
    } else {
        Write-Host "   Warnung: Enterprise App konnte nicht verifiziert werden (möglicherweise noch in Bearbeitung)." -ForegroundColor Yellow
    }

    # ===== ERGEBNISSE ANZEIGEN =====
    Write-Host @"

========================================================================
                   ERSTELLUNGSPROZESS ABGESCHLOSSEN
========================================================================

"@ -ForegroundColor Green

    Write-Host @"
### KOPIERBEREICH - APP-DETAILS ###

=== App-Registrierung ===
Name:          $AppName
App (Client) ID: $($app.AppId)
Object ID:     $($app.Id)

=== Client Secret ===
Wert:          $($secret.SecretText)
Gültig bis:    $($endDate.ToString('dd.MM.yyyy'))

=== Enterprise App ===
Name:          $AppName
Object ID:     $(if ($null -ne $checkSP) { $checkSP.Id } else { "Nicht verifiziert" })

=== Tenant Information ===
Tenant ID:     $($context.TenantId)
Tenant Name:   $($context.TenantDomain)

### AUTHENTIFIZIERUNGSBEISPIELE ###

# Azure CLI
az login --service-principal -u $($app.AppId) -p "$($secret.SecretText)" --tenant $($context.TenantId)

# PowerShell
`$credential = New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential `$credential -Tenant "$($context.TenantId)"

# Microsoft Graph PowerShell
Connect-MgGraph -ClientId "$($app.AppId)" -TenantId "$($context.TenantId)" -ClientSecretCredential (New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force)))

"@ -ForegroundColor White -BackgroundColor DarkBlue

    # ===== DATEI-EXPORT (nur mit expliziter Zustimmung) =====
    if (-not $SaveToFile) {
        $saveChoice = Read-Host "`n⚠️  Möchten Sie die Details (inkl. Secret) in eine Textdatei speichern? Das Secret ist danach sichtbar! (J/N) [Standard: N]"
        $SaveToFile = ($saveChoice -eq "J" -or $saveChoice -eq "j")
    }

    if ($SaveToFile) {
        $exportPath = Join-Path $OutputPath "EntraID_App_$($AppName)_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
        try {
            $exportContent = @"
========================================================================
              MICROSOFT ENTRA ID APP-DETAILS
========================================================================

⚠️  SICHERHEITSHINWEIS: Diese Datei enthält ein Client Secret im Klartext.
    Bitte sichern oder löschen Sie diese Datei entsprechend Ihrer Sicherheitsrichtlinien.

=== App-Registrierung ===
Name:            $AppName
App (Client) ID: $($app.AppId)
Object ID:       $($app.Id)
Erstellt von:    $OwnerName
Erstellt am:     $(Get-Date)

=== Client Secret ===
Wert:            $($secret.SecretText)
Gültig bis:      $($endDate.ToString('dd.MM.yyyy'))

=== Enterprise App (Service Principal) ===
Name:            $AppName
Object ID:       $(if ($null -ne $checkSP) { $checkSP.Id } else { "Nicht verifiziert" })

=== Tenant Information ===
Tenant ID:       $($context.TenantId)
Tenant Name:     $($context.TenantDomain)

=== Konfigurierte API-Berechtigungen ===
$(if ($permissions.Count -gt 0) {
    ($permissions | ForEach-Object { "$($_.PermissionName) ($($_.Type))" }) -join "`n"
} else { "Keine Berechtigungen konfiguriert" })

=== Verwendung ===

# Azure CLI
az login --service-principal -u $($app.AppId) -p "$($secret.SecretText)" --tenant $($context.TenantId)

# PowerShell
`$credential = New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential `$credential -Tenant "$($context.TenantId)"

WICHTIG: Bewahren Sie diese Informationen sicher auf!
"@
            $exportContent | Out-File -FilePath $exportPath -Encoding UTF8

            # Datei-Berechtigungen einschränken (nur aktueller Benutzer)
            try {
                $acl = Get-Acl $exportPath
                $acl.SetAccessRuleProtection($true, $false)
                $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                    $env:USERNAME, "FullControl", "Allow"
                )
                $acl.SetAccessRule($rule)
                Set-Acl $exportPath $acl
            } catch {
                Write-Warning "ACL-Einschränkung fehlgeschlagen (nicht kritisch): $($_.Exception.Message)"
            }

            Write-Host "`n✓ Details gespeichert: $((Get-Item $exportPath).FullName)" -ForegroundColor Yellow
            Write-Host "  ⚠️  Datei enthält Secret im Klartext – sicher aufbewahren oder sofort löschen!" -ForegroundColor Red
        } catch {
            Write-Host "`nFehler beim Speichern der Datei: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Bitte notieren Sie sich die oben angezeigten Informationen manuell." -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n✓ Kein Datei-Export. Bitte notieren Sie sich das Secret aus dem Kopierbereich oben." -ForegroundColor Cyan
    }
}
catch {
    Write-Host "`n❌ Fehler bei der Erstellung der App:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nFehlerdetails:" -ForegroundColor Yellow
    Write-Host "Typ:      $($_.Exception.GetType().Name)" -ForegroundColor Yellow
    Write-Host "Position: $($_.InvocationInfo.PositionMessage)" -ForegroundColor Yellow

    # ===== ROLLBACK: App löschen wenn vorhanden =====
    if ($null -ne $app) {
        Write-Host "`n🔄 Rollback: Lösche bereits erstellte App-Registrierung '$AppName'..." -ForegroundColor Yellow
        try {
            Remove-MgApplication -ApplicationId $app.Id -Confirm:$false
            Write-Host "   ✓ App-Registrierung wurde entfernt (Rollback erfolgreich)." -ForegroundColor Green
        } catch {
            Write-Host "   ⚠ Rollback fehlgeschlagen: App '$AppName' (ID: $($app.Id)) muss manuell gelöscht werden." -ForegroundColor Red
            Write-Host "   Entra Portal: https://entra.microsoft.com → App registrations → All applications" -ForegroundColor Yellow
        }
    }
}
finally {
    Write-Host "`nSkript abgeschlossen. Vielen Dank für die Verwendung des Entra ID App-Erstellungsskripts." -ForegroundColor Cyan
}
