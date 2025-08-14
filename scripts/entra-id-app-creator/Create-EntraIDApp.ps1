<#
.SYNOPSIS
    Erstellt automatisch eine App-Registrierung und Enterprise App in Microsoft Entra ID.

.DESCRIPTION
    Dieses Skript automatisiert den Prozess der Erstellung einer App-Registrierung und der zugehörigen 
    Enterprise App (Service Principal) in Microsoft Entra ID. Es ermöglicht die Konfiguration von API-Berechtigungen
    und generiert ein Client Secret für die Authentifizierung.

.PARAMETER None
    Das Skript verwendet interaktive Eingabeaufforderungen für alle erforderlichen Parameter.

.EXAMPLE
    .\Create-EntraIDApp.ps1
    Führt das Skript aus und folgt den interaktiven Anweisungen.

.NOTES
    Erforderliche Berechtigungen:
    - Global Administrator oder Application Administrator in Entra ID
    - Die Microsoft Graph PowerShell-Module müssen installiert sein oder werden automatisch installiert

    Das generierte Client Secret sollte sicher aufbewahrt werden, da es nach der ersten Anzeige 
    nicht mehr abgerufen werden kann.
#>

# Modul für Microsoft Graph installieren, falls nicht vorhanden
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph)) {
    Write-Host "Microsoft Graph PowerShell Modul wird installiert..." -ForegroundColor Yellow
    Install-Module -Name Microsoft.Graph -Scope CurrentUser -Force
}

# Importieren der benötigten Module
Import-Module Microsoft.Graph.Authentication
Import-Module Microsoft.Graph.Applications

# Banner und Einführung anzeigen
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

# Tenant-Abfrage
$tenantId = Read-Host "Bitte geben Sie die Tenant-ID oder den Tenant-Namen ein (z.B. contoso.onmicrosoft.com)"

# Benutzeranmeldung mit den erforderlichen Berechtigungen
Write-Host "`nBitte melden Sie sich mit einem Benutzer an, der ausreichende Berechtigungen hat (Global Admin oder App Administrator)." -ForegroundColor Cyan
try {
    Connect-MgGraph -TenantId $tenantId -Scopes "Application.ReadWrite.All", "Directory.ReadWrite.All"
    
    # Überprüfen, ob die Anmeldung erfolgreich war
    $context = Get-MgContext
    if ($null -eq $context) {
        throw "Anmeldung fehlgeschlagen."
    }
    
    Write-Host "Erfolgreich angemeldet als: $($context.Account)" -ForegroundColor Green
    Write-Host "Verbunden mit Tenant: $($context.TenantId)`n" -ForegroundColor Green
}
catch {
    Write-Host "Fehler bei der Anmeldung: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Bitte stellen Sie sicher, dass Sie die richtigen Anmeldeinformationen verwenden und über ausreichende Berechtigungen verfügen." -ForegroundColor Yellow
    exit
}

# Benutzerabfragen für die App-Details
Write-Host "Bitte geben Sie die Details für die neue App ein:" -ForegroundColor Cyan
$appName = Read-Host "Name der App (wird sowohl für App-Registrierung als auch Enterprise App verwendet)"
$appOwner = Read-Host "Name des Autors/Owners (wird in den Notizen der App gespeichert)"
$secretValidityYears = Read-Host "Gültigkeitsdauer des Client Secrets in Jahren [Standard: 1]"

# Standardwert für Secret-Gültigkeit
if ([string]::IsNullOrEmpty($secretValidityYears)) {
    $secretValidityYears = 1
}

# Berechtigungen konfigurieren
$configurePermissions = Read-Host "Möchten Sie API-Berechtigungen für die App konfigurieren? (J/N) [Standard: N]"
$permissions = @()

if ($configurePermissions -eq "J" -or $configurePermissions -eq "j") {
    Write-Host "`n=== API-Berechtigungen konfigurieren ===" -ForegroundColor Cyan
    Write-Host "Bitte wählen Sie die gewünschten API-Berechtigungen aus den folgenden Optionen:" -ForegroundColor Cyan
    
    Write-Host @"

Häufig verwendete Microsoft Graph Berechtigungen:
------------------------------------------------
1. User.Read - Lesen des Benutzerprofils
2. User.ReadBasic.All - Lesen grundlegender Profile aller Benutzer
3. User.Read.All - Lesen aller Benutzerprofile
4. Directory.Read.All - Lesen von Verzeichnisdaten
5. Directory.ReadWrite.All - Lesen und Schreiben von Verzeichnisdaten
6. Group.Read.All - Lesen aller Gruppenprofile
7. Group.ReadWrite.All - Lesen und Schreiben von Gruppenprofilen
8. Mail.Read - Lesen von E-Mails
9. Mail.Send - Senden von E-Mails
10. Sites.Read.All - Lesen aller SharePoint-Websitesammlungen
11. Sites.ReadWrite.All - Lesen und Schreiben aller SharePoint-Websitesammlungen

Benutzerdefinierte Berechtigung:
--------------------------------
12. Benutzerdefinierte Berechtigung eingeben

"@ -ForegroundColor White

    $done = $false
    while (-not $done) {
        Write-Host "`nGeben Sie die Nummer der gewünschten Berechtigung ein oder 'fertig' zum Abschließen:" -ForegroundColor Yellow
        $choice = Read-Host "Auswahl"
        
        if ($choice -eq "fertig") {
            $done = $true
        }
        elseif ($choice -eq "12") {
            Write-Host "`nBitte geben Sie die Details für die benutzerdefinierte Berechtigung ein:" -ForegroundColor Cyan
            $apiId = Read-Host "API-ID (z.B. 00000003-0000-0000-c000-000000000000 für Microsoft Graph)"
            $permissionName = Read-Host "Berechtigungsname (z.B. User.Read)"
            $permissionType = Read-Host "Berechtigungstyp (Delegated oder Application)"
            
            $permissions += @{
                ApiId = $apiId
                PermissionName = $permissionName
                Type = $permissionType
            }
            
            Write-Host "Benutzerdefinierte Berechtigung hinzugefügt: $permissionName ($permissionType)" -ForegroundColor Green
        }
        elseif ($choice -in 1..11) {
            $permissionMap = @{
                1 = @{ Name = "User.Read"; Type = "Delegated" }
                2 = @{ Name = "User.ReadBasic.All"; Type = "Delegated" }
                3 = @{ Name = "User.Read.All"; Type = "Application" }
                4 = @{ Name = "Directory.Read.All"; Type = "Application" }
                5 = @{ Name = "Directory.ReadWrite.All"; Type = "Application" }
                6 = @{ Name = "Group.Read.All"; Type = "Application" }
                7 = @{ Name = "Group.ReadWrite.All"; Type = "Application" }
                8 = @{ Name = "Mail.Read"; Type = "Application" }
                9 = @{ Name = "Mail.Send"; Type = "Application" }
                10 = @{ Name = "Sites.Read.All"; Type = "Application" }
                11 = @{ Name = "Sites.ReadWrite.All"; Type = "Application" }
            }
            
            $selectedPerm = $permissionMap[[int]$choice]
            $permissions += @{
                ApiId = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
                PermissionName = $selectedPerm.Name
                Type = $selectedPerm.Type
            }
            
            Write-Host "Berechtigung hinzugefügt: $($selectedPerm.Name) ($($selectedPerm.Type))" -ForegroundColor Green
        }
        else {
            Write-Host "Ungültige Auswahl. Bitte wählen Sie eine Nummer zwischen 1-12 oder 'fertig'." -ForegroundColor Red
        }
    }
}

try {
    Write-Host "`nStarte den Erstellungsprozess..." -ForegroundColor Cyan
    Write-Host "1. Erstelle neue App-Registrierung: $appName..." -ForegroundColor Cyan

    # App erstellen mit expliziten Parametern
    $appParams = @{
        DisplayName = $appName
        SignInAudience = "AzureADMyOrg"  # Nur für diesen Tenant
        Notes = "Erstellt von: $appOwner am $(Get-Date -Format 'dd.MM.yyyy')"
    }
    
    $app = New-MgApplication @appParams
    Write-Host "   ✓ App-Registrierung erfolgreich erstellt (Object ID: $($app.Id))" -ForegroundColor Green
    
    # API-Berechtigungen hinzufügen, falls ausgewählt
    if ($permissions.Count -gt 0) {
        Write-Host "2. Konfiguriere API-Berechtigungen..." -ForegroundColor Cyan
        
        foreach ($permission in $permissions) {
            try {
                if ($permission.Type -eq "Application") {
                    # Application-Berechtigung hinzufügen
                    $graphServicePrincipal = Get-MgServicePrincipal -Filter "appId eq '$($permission.ApiId)'"
                    $appRole = $graphServicePrincipal.AppRoles | Where-Object { $_.Value -eq $permission.PermissionName }
                    
                    if ($appRole) {
                        # Berechtigung zur App hinzufügen
                        $requiredResourceAccess = @{
                            ResourceAppId = $permission.ApiId
                            ResourceAccess = @(
                                @{
                                    Id = $appRole.Id
                                    Type = "Role"
                                }
                            )
                        }
                        
                        # Aktuelle Berechtigungen abrufen und neue hinzufügen
                        $currentAccess = @()
                        if ($app.RequiredResourceAccess) {
                            $currentAccess = $app.RequiredResourceAccess
                        }
                        
                        # Prüfen, ob die API bereits in den Berechtigungen vorhanden ist
                        $existingApi = $currentAccess | Where-Object { $_.ResourceAppId -eq $permission.ApiId }
                        if ($existingApi) {
                            # Prüfen, ob die Berechtigung bereits vorhanden ist
                            $existingPermission = $existingApi.ResourceAccess | Where-Object { $_.Id -eq $appRole.Id }
                            if (-not $existingPermission) {
                                $existingApi.ResourceAccess += @{
                                    Id = $appRole.Id
                                    Type = "Role"
                                }
                            }
                        } else {
                            $currentAccess += $requiredResourceAccess
                        }
                        
                        Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess $currentAccess
                        Write-Host "   ✓ Application-Berechtigung hinzugefügt: $($permission.PermissionName)" -ForegroundColor Green
                    }
                    else {
                        Write-Host "   ⚠ Konnte Berechtigung nicht finden: $($permission.PermissionName)" -ForegroundColor Yellow
                    }
                }
                elseif ($permission.Type -eq "Delegated") {
                    # Delegated-Berechtigung hinzufügen
                    $graphServicePrincipal = Get-MgServicePrincipal -Filter "appId eq '$($permission.ApiId)'"
                    $scope = $graphServicePrincipal.OAuth2PermissionScopes | Where-Object { $_.Value -eq $permission.PermissionName }
                    
                    if ($scope) {
                        # Berechtigung zur App hinzufügen
                        $requiredResourceAccess = @{
                            ResourceAppId = $permission.ApiId
                            ResourceAccess = @(
                                @{
                                    Id = $scope.Id
                                    Type = "Scope"
                                }
                            )
                        }
                        
                        # Aktuelle Berechtigungen abrufen und neue hinzufügen
                        $currentAccess = @()
                        if ($app.RequiredResourceAccess) {
                            $currentAccess = $app.RequiredResourceAccess
                        }
                        
                        # Prüfen, ob die API bereits in den Berechtigungen vorhanden ist
                        $existingApi = $currentAccess | Where-Object { $_.ResourceAppId -eq $permission.ApiId }
                        if ($existingApi) {
                            # Prüfen, ob die Berechtigung bereits vorhanden ist
                            $existingPermission = $existingApi.ResourceAccess | Where-Object { $_.Id -eq $scope.Id }
                            if (-not $existingPermission) {
                                $existingApi.ResourceAccess += @{
                                    Id = $scope.Id
                                    Type = "Scope"
                                }
                            }
                        } else {
                            $currentAccess += $requiredResourceAccess
                        }
                        
                        Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess $currentAccess
                        Write-Host "   ✓ Delegated-Berechtigung hinzugefügt: $($permission.PermissionName)" -ForegroundColor Green
                    }
                    else {
                        Write-Host "   ⚠ Konnte Berechtigung nicht finden: $($permission.PermissionName)" -ForegroundColor Yellow
                    }
                }
            }
            catch {
                Write-Host "   ⚠ Fehler beim Hinzufügen der Berechtigung $($permission.PermissionName): $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    
    # Secret erstellen
    Write-Host "3. Generiere Client Secret mit $secretValidityYears Jahr(en) Gültigkeit..." -ForegroundColor Cyan
    $startDate = Get-Date
    $endDate = $startDate.AddYears([int]$secretValidityYears)
    
    $passwordCredential = @{
        displayName = "Auto-generiertes Secret"
        endDateTime = $endDate
    }
    
    $secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential $passwordCredential
    Write-Host "   ✓ Client Secret erfolgreich generiert (gültig bis: $($endDate))" -ForegroundColor Green
    
    # Service Principal erstellen (Enterprise App)
    Write-Host "4. Erstelle Enterprise App (Service Principal)..." -ForegroundColor Cyan
    $servicePrincipal = New-MgServicePrincipal -AppId $app.AppId
    
    # Warten, bis der Service Principal vollständig erstellt wurde
    Write-Host "   Warte auf Abschluss der Service Principal-Erstellung..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    # Überprüfen, ob der Service Principal erstellt wurde
    $checkSP = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'"
    
    if ($null -eq $checkSP) {
        Write-Host "   Service Principal nicht sofort gefunden. Warte weitere 10 Sekunden..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        $checkSP = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'"
    }
    
    if ($null -ne $checkSP) {
        Write-Host "   ✓ Enterprise App erfolgreich erstellt (Object ID: $($checkSP.Id))" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Enterprise App konnte nicht verifiziert werden. Möglicherweise ist sie noch in Bearbeitung." -ForegroundColor Yellow
    }
    
    # Ergebnisse anzeigen
    Write-Host @"

========================================================================
                       ERSTELLUNGSPROZESS ABGESCHLOSSEN
========================================================================

"@ -ForegroundColor Green

    # Bereich für Copy & Paste der Ergebnisse
    Write-Host @"
### KOPIERBEREICH - APP-DETAILS ###

=== App-Registrierung ===
Name: $appName
App (Client) ID: $($app.AppId)
Object ID: $($app.Id)

=== Client Secret ===
Wert: $($secret.SecretText)
Gültig bis: $($endDate)

=== Enterprise App ===
Name: $appName
Object ID: $(if ($null -ne $checkSP) { $checkSP.Id } else { "Nicht verifiziert" })

=== Tenant Information ===
Tenant ID: $($context.TenantId)
Tenant Name: $($context.TenantDomain)

### KOPIERBEREICH - AUTHENTIFIZIERUNGSBEISPIELE ###

# Azure CLI Anmeldung
az login --service-principal -u $($app.AppId) -p "$($secret.SecretText)" --tenant $($context.TenantId)

# PowerShell Anmeldung
\$credential = New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential \$credential -Tenant "$($context.TenantId)"

"@ -ForegroundColor White -BackgroundColor DarkBlue
    
    # Ergebnisse in eine Datei exportieren - im aktuellen Verzeichnis
    $exportPath = ".\EntraID_App_$($appName)_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
    
    try {
        @"
========================================================================
                  MICROSOFT ENTRA ID APP-DETAILS
========================================================================

=== App-Registrierung ===
Name: $appName
App (Client) ID: $($app.AppId)
Object ID: $($app.Id)
Erstellt von: $appOwner
Erstellt am: $(Get-Date)

=== Client Secret ===
Wert: $($secret.SecretText)
Gültig bis: $($endDate)

=== Enterprise App (Service Principal) ===
Name: $appName
Object ID: $(if ($null -ne $checkSP) { $checkSP.Id } else { "Nicht verifiziert" })

=== Tenant Information ===
Tenant ID: $($context.TenantId)
Tenant Name: $($context.TenantDomain)

=== Konfigurierte API-Berechtigungen ===
$(if ($permissions.Count -gt 0) {
    $permissions | ForEach-Object { "$($_.PermissionName) ($($_.Type))" }
} else {
    "Keine Berechtigungen konfiguriert"
})

=== Verwendung für Azure CLI ===
az login --service-principal -u $($app.AppId) -p "$($secret.SecretText)" --tenant $($context.TenantId)

=== Verwendung für PowerShell ===
\$credential = New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential \$credential -Tenant "$($context.TenantId)"

WICHTIG: Bewahren Sie diese Informationen sicher auf!
"@ | Out-File -FilePath $exportPath

        Write-Host "`nDie Details wurden gespeichert unter: $((Get-Item $exportPath).FullName)" -ForegroundColor Yellow
    }
    catch {
        Write-Host "`nFehler beim Speichern der Datei: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Bitte notieren Sie sich die oben angezeigten Informationen manuell." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "`n❌ Fehler bei der Erstellung der App:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    # Zusätzliche Fehlerdiagnose
    Write-Host "`nFehlerdetails für die Fehlerbehebung:" -ForegroundColor Yellow
    Write-Host "Fehlertyp: $($_.Exception.GetType().Name)" -ForegroundColor Yellow
    Write-Host "Fehlerposition: $($_.InvocationInfo.PositionMessage)" -ForegroundColor Yellow
}
finally {
    Write-Host "`nSkript abgeschlossen. Vielen Dank für die Verwendung des Entra ID App-Erstellungsskripts." -ForegroundColor Cyan
}
