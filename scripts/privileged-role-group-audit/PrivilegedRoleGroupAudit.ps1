#Requires -Modules Microsoft.Graph.Authentication, Microsoft.Graph.Identity.DirectoryManagement

<#
.SYNOPSIS
    Identifies all Entra ID groups that hold privileged directory roles.

.DESCRIPTION
    Connects to Microsoft Graph and enumerates all activated directory roles.
    For each role it checks whether any groups (Security, M365, role-assignable)
    are members, then outputs a consolidated console report and exports a
    timestamped CSV file to the script's own directory.

.NOTES
    Required API permissions (Delegated):
        Directory.Read.All   (or RoleManagement.Read.Directory)

    PowerShell 7+ is recommended but PowerShell 5.1 is supported.
#>

# ---------------------------------------------------------------------------
# Well-known privileged role template IDs
# Add or remove entries to adjust which roles are flagged as "highly privileged".
# ---------------------------------------------------------------------------
$PrivilegedRoleTemplates = @{
    '62e90394-69f5-4237-9190-012177145e10' = 'Global Administrator'
    'e8611ab8-c189-46e8-94e1-60213ab1f814' = 'Privileged Role Administrator'
    '194ae4cb-b126-40b2-bd5b-6091b380977d' = 'Security Administrator'
    'f28a1f50-f6e7-4571-818b-6a12f2af6b6c' = 'SharePoint Administrator'
    '29232cdf-9323-42fd-ade2-1d097af3e4de' = 'Exchange Administrator'
    'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9' = 'Conditional Access Administrator'
    '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3' = 'Application Administrator'
    '158c047a-c907-4556-b7ef-446551a6b5f7' = 'Cloud Application Administrator'
    '966707d0-3269-4727-9be2-8c3a10f19b9d' = 'Password Administrator'
    '7be44c8a-adaf-4e2a-84d6-ab2649e08a13' = 'Privileged Authentication Administrator'
    'c4e39bd9-1100-46d3-8c65-fb160da0071f' = 'Authentication Administrator'
    'e3973bdf-4987-49ae-837a-ba8e231c7286' = 'Azure DevOps Administrator'
    '7698a772-787b-4ac8-901f-60d6b08affd2' = 'Cloud Device Administrator'
    'b0f54661-2d74-4c50-afa3-1ec803f12efe' = 'Billing Administrator'
    'fe930be7-5e62-47db-91af-98c3a49a38b1' = 'User Administrator'
    'f023fd81-a637-4b56-95fd-791ac0226033' = 'Service Support Administrator'
    '729827e3-9c14-49f7-bb1b-9608f156bbb8' = 'Helpdesk Administrator'
    '8ac3fc64-6eca-42ea-9e69-59f4c7b60eb2' = 'Hybrid Identity Administrator'
    '3a2c62db-5318-420d-8d74-23affee5d9d5' = 'Intune Administrator'
    '44367163-eba1-44c3-98af-f5787879f96a' = 'Dynamics 365 Administrator'
    '11648597-926c-4cf3-9c36-bcebb0ba8dcc' = 'Power Platform Administrator'
    '5f2222b1-57c3-48ba-8ad5-d4759f1fde6f' = 'Security Operator'
    '5d6b6bb7-de71-4623-b4af-96380a352509' = 'Security Reader'
    '17315797-102d-40b4-93e0-432062caca18' = 'Compliance Administrator'
    'fdd7a751-b60b-444a-984c-02652fe8fa1c' = 'Groups Administrator'
    '9f06204d-73c1-4d4c-880a-6edb90606fd8' = 'Azure AD Joined Device Local Admin'
    '38a96431-2bdf-4b4c-8b6e-5d3d8abac1a4' = 'Desktop Analytics Administrator'
    '4a5d8f65-41da-4de4-8968-e035b65339cf' = 'Reports Reader'
    '790c1fb9-7f7d-4f88-86a1-ef1f95c05c1b' = 'External Identity Provider Admin'
    'aaf43236-0c0d-4d5f-883a-6955382ac081' = 'Domain Name Administrator'
    'baf37b3a-610e-45da-9e62-d9d1e5e8914b' = 'Teams Communications Administrator'
    '69091246-20e8-4a56-aa4d-066075b2a7a8' = 'Teams Administrator'
    'eb1f4a8d-243a-41f0-9fbd-c7cdf6c5ef7c' = 'Knowledge Administrator'
    '3f1acade-1e04-4fbc-9b69-f0302cd84aef' = 'Windows 365 Administrator'
}

# ---------------------------------------------------------------------------
# Connect to Microsoft Graph (reuse an existing session if available)
# ---------------------------------------------------------------------------
Write-Host "`nConnecting to Microsoft Graph..." -ForegroundColor Cyan

try {
    $context = Get-MgContext -ErrorAction Stop
    if (-not $context) { throw "no active context" }
    Write-Host "   Already connected as $($context.Account)" -ForegroundColor Green
}
catch {
    Connect-MgGraph -Scopes "Directory.Read.All", "RoleManagement.Read.Directory" -ErrorAction Stop
    $context = Get-MgContext
    Write-Host "   Connected as $($context.Account)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Retrieve all activated directory roles
# ---------------------------------------------------------------------------
Write-Host "`nFetching activated directory roles..." -ForegroundColor Cyan
$directoryRoles = Get-MgDirectoryRole -All -ErrorAction Stop
Write-Host "   Found $($directoryRoles.Count) activated roles" -ForegroundColor Gray

# ---------------------------------------------------------------------------
# Check each role for group members
# ---------------------------------------------------------------------------
Write-Host "Scanning role members for groups...`n" -ForegroundColor Cyan

$results = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($role in $directoryRoles) {
    $members = Get-MgDirectoryRoleMember -DirectoryRoleId $role.Id -All -ErrorAction SilentlyContinue

    foreach ($member in $members) {
        # Skip anything that is not a group
        if ($member.AdditionalProperties.'@odata.type' -ne '#microsoft.graph.group') {
            continue
        }

        $isPrivileged = $PrivilegedRoleTemplates.ContainsKey($role.RoleTemplateId)

        $results.Add([PSCustomObject]@{
            RoleName           = $role.DisplayName
            RoleTemplateId     = $role.RoleTemplateId
            GroupName          = $member.AdditionalProperties.displayName
            GroupId            = $member.Id
            IsHighlyPrivileged = $isPrivileged
        })
    }
}

# ---------------------------------------------------------------------------
# Console output
# ---------------------------------------------------------------------------
if ($results.Count -eq 0) {
    Write-Host "No groups are assigned to any directory role." -ForegroundColor Green
    return
}

$privileged = $results | Where-Object { $_.IsHighlyPrivileged }  | Sort-Object RoleName, GroupName
$other      = $results | Where-Object { -not $_.IsHighlyPrivileged } | Sort-Object RoleName, GroupName

Write-Host ("=" * 65) -ForegroundColor Red
Write-Host "  GROUPS IN HIGHLY PRIVILEGED ROLES ($($privileged.Count) assignments)" -ForegroundColor Red
Write-Host ("=" * 65) -ForegroundColor Red

if ($privileged.Count -gt 0) {
    $privileged | Format-Table -AutoSize -Property RoleName, GroupName, GroupId
}
else {
    Write-Host "   (none)`n" -ForegroundColor Green
}

Write-Host ("-" * 65) -ForegroundColor Yellow
Write-Host "  GROUPS IN OTHER DIRECTORY ROLES ($($other.Count) assignments)" -ForegroundColor Yellow
Write-Host ("-" * 65) -ForegroundColor Yellow

if ($other.Count -gt 0) {
    $other | Format-Table -AutoSize -Property RoleName, GroupName, GroupId
}
else {
    Write-Host "   (none)`n" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# Export to CSV (saved next to the script file)
# ---------------------------------------------------------------------------
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$csvPath   = Join-Path $PSScriptRoot "PrivilegedRoleGroups_$timestamp.csv"

$results |
    Sort-Object IsHighlyPrivileged, RoleName |
    Select-Object RoleName, RoleTemplateId, GroupName, GroupId, IsHighlyPrivileged |
    Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

Write-Host "Report exported to: $csvPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "-- Summary --" -ForegroundColor White
Write-Host "   Total group-role assignments : $($results.Count)"
Write-Host "   Highly privileged            : $($privileged.Count)" -ForegroundColor Red
Write-Host "   Other roles                  : $($other.Count)"      -ForegroundColor Yellow
Write-Host "   Unique groups involved       : $(($results | Select-Object -ExpandProperty GroupId -Unique).Count)"
Write-Host ""
