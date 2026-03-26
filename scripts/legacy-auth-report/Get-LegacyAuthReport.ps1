#Requires -Version 7.0
<#
.SYNOPSIS
    Legacy Authentication Sign-In Report – Entra ID
    Compatible: PowerShell 7 · macOS PowerShell · Azure Cloud Shell

.DESCRIPTION
    Queries Microsoft Graph sign-in logs for all legacy authentication
    attempts and generates a self-contained HTML report with user,
    protocol, IP address, and location details.

    Platform behaviour
    ──────────────────
    Windows PS7    : Interactive browser auth · opens report automatically
    macOS PS7      : Interactive browser auth · opens report with 'open'
    Azure Cloud    : Tries managed identity first, falls back to device code
                     Report path printed; download via Cloud Shell file share

.PARAMETER Days
    Lookback window in days (default: 30 – Graph max retention)
.PARAMETER OutputPath
    HTML output file path  (default: platform-appropriate temp dir)
.PARAMETER TopCount
    Max records to fetch   (default: 2000)
.PARAMETER SkipAutoOpen
    Suppress automatic browser launch after report generation

.EXAMPLE
    # Windows / macOS
    .\Get-LegacyAuthReport.ps1 -Days 30

.EXAMPLE
    # Azure Cloud Shell
    .\Get-LegacyAuthReport.ps1 -Days 14 -SkipAutoOpen

.NOTES
    Required Graph permissions : AuditLog.Read.All, Directory.Read.All
    Required module             : Microsoft.Graph (v2+)

    Install / update:
      Install-Module Microsoft.Graph -Scope CurrentUser -Force
#>

[CmdletBinding()]
param(
    [ValidateRange(1,30)]
    [int]    $Days         = 30,
    [string] $OutputPath   = '',
    [int]    $TopCount      = 2000,
    [switch] $SkipAutoOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

#region ── PLATFORM DETECTION ────────────────────────────────────────────────────
$Platform = if ($IsWindows)  { 'Windows' }
            elseif ($IsMacOS) { 'macOS' }
            else               { 'Linux' }  # Cloud Shell lands here

$IsCloudShell = $env:AZUREPS_HOST_ENVIRONMENT -eq 'cloud-shell/1.0' -or
                $env:ACC_CLOUD -ne $null

Write-Host ""
Write-Host "  Legacy Auth Report  //  Farpoint Tech" -ForegroundColor DarkGray
Write-Host "  Platform : $Platform$(if($IsCloudShell){' (Azure Cloud Shell)'})" -ForegroundColor DarkGray
Write-Host "  PS Build : $($PSVersionTable.PSEdition) $($PSVersionTable.PSVersion)" -ForegroundColor DarkGray
Write-Host ""
#endregion

#region ── DEFAULT OUTPUT PATH ───────────────────────────────────────────────────
if (-not $OutputPath) {
    $TmpDir     = if ($IsCloudShell -and (Test-Path "$HOME/clouddrive")) {
                      "$HOME/clouddrive"
                  } else {
                      [System.IO.Path]::GetTempPath()
                  }
    $OutputPath = Join-Path $TmpDir "LegacyAuth-Report-$(Get-Date -Format 'yyyyMMdd-HHmm').html"
}
#endregion

#region ── MODULE CHECK ──────────────────────────────────────────────────────────
Write-Host "[*] Checking Microsoft.Graph module..." -ForegroundColor Cyan

$RequiredModules = @('Microsoft.Graph.Authentication','Microsoft.Graph.Reports','Microsoft.Graph.Identity.DirectoryManagement')

foreach ($mod in $RequiredModules) {
    if (-not (Get-Module -ListAvailable -Name $mod)) {
        Write-Warning "$mod not found. Installing Microsoft.Graph..."
        Install-Module Microsoft.Graph -Scope CurrentUser -Force -AllowClobber
        break
    }
}

foreach ($mod in $RequiredModules) { Import-Module $mod -ErrorAction SilentlyContinue }
Write-Host "[+] Modules ready" -ForegroundColor Green
#endregion

#region ── CONNECT ───────────────────────────────────────────────────────────────
Write-Host "[*] Connecting to Microsoft Graph..." -ForegroundColor Cyan

$ConnectParams = @{
    Scopes = @('AuditLog.Read.All','Directory.Read.All')
    NoWelcome = $true
}

# Cloud Shell: try managed identity / existing az context first
if ($IsCloudShell) {
    try {
        Write-Host "    Trying managed identity / existing session..." -ForegroundColor DarkGray
        Connect-MgGraph -Identity -NoWelcome -ErrorAction Stop
    } catch {
        Write-Host "    Falling back to device code auth..." -ForegroundColor DarkGray
        Connect-MgGraph @ConnectParams -UseDeviceCode
    }
} else {
    Connect-MgGraph @ConnectParams
}

$Org        = Get-MgOrganization | Select-Object -First 1
$TenantName = $Org.DisplayName
$TenantId   = $Org.Id
Write-Host "[+] Connected: $TenantName ($TenantId)" -ForegroundColor Green
#endregion

#region ── LEGACY PROTOCOL LIST ──────────────────────────────────────────────────
$LegacyProtocols = @(
    'Exchange ActiveSync',
    'IMAP4',
    'MAPI',
    'POP3',
    'SMTP',
    'Authenticated SMTP',
    'Exchange Web Services',
    'Autodiscover',
    'Exchange RPC',
    'Exchange Online PowerShell',
    'Other clients'
)
#endregion

#region ── QUERY SIGN-IN LOGS ────────────────────────────────────────────────────
Write-Host "[*] Querying sign-in logs (last $Days days, up to $TopCount records)..." -ForegroundColor Cyan

$StartDate    = (Get-Date).AddDays(-$Days).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$ProtoFilter  = ($LegacyProtocols | ForEach-Object { "clientAppUsed eq '$_'" }) -join ' or '
$FilterString = "createdDateTime ge $StartDate and ($ProtoFilter)"

$SignIns = Get-MgAuditLogSignIn `
    -Filter $FilterString `
    -Top $TopCount `
    -Property id,createdDateTime,userPrincipalName,userDisplayName,
              clientAppUsed,ipAddress,location,status,
              appDisplayName,conditionalAccessStatus,
              riskLevelDuringSignIn,riskState

Write-Host "[+] $($SignIns.Count) legacy auth sign-in records found" -ForegroundColor Green

if ($SignIns.Count -eq 0) {
    Write-Host "[!] No legacy auth events found. Great news — or CA is already blocking them." -ForegroundColor Yellow
    Disconnect-MgGraph | Out-Null
    exit 0
}
#endregion

#region ── PROCESS DATA ──────────────────────────────────────────────────────────
Write-Host "[*] Processing records..." -ForegroundColor Cyan

$Records = foreach ($s in $SignIns) {
    $City     = if ($s.Location.City)            { $s.Location.City }            else { '—' }
    $Country  = if ($s.Location.CountryOrRegion) { $s.Location.CountryOrRegion } else { '—' }
    $State    = if ($s.Location.State)           { $s.Location.State }           else { '' }
    $Loc      = if ($State -and $City -ne '—')  { "$City, $State, $Country" }
                elseif ($City -ne '—')            { "$City, $Country" }
                else                               { $Country }

    [PSCustomObject]@{
        DateTime        = $s.CreatedDateTime
        DateDisplay     = ([DateTime]$s.CreatedDateTime).ToLocalTime().ToString('yyyy-MM-dd HH:mm')
        User            = if ($s.UserDisplayName) { $s.UserDisplayName } else { $s.UserPrincipalName }
        UPN             = $s.UserPrincipalName
        Protocol        = $s.ClientAppUsed
        App             = if ($s.AppDisplayName) { $s.AppDisplayName } else { '—' }
        IP              = if ($s.IpAddress)       { $s.IpAddress }       else { '—' }
        Location        = $Loc
        Status          = if ($s.Status.ErrorCode -eq 0) { 'Success' } else { 'Failure' }
        Risk            = $s.RiskLevelDuringSignIn ?? 'none'
        CA              = $s.ConditionalAccessStatus ?? '—'
    }
}

$Records = $Records | Sort-Object `
    @{Expression={if($_.Status -eq 'Failure'){0}else{1}}; Ascending=$true}, `
    @{Expression={switch($_.Risk){'high'{0}'medium'{1}default{2}}}; Ascending=$true}, `
    @{Expression={$_.User}; Ascending=$true}, `
    @{Expression={$_.DateTime}; Descending=$true}

# Summary
$Total     = $Records.Count
$UniqueU   = ($Records.UPN | Sort-Object -Unique).Count
$UniqueIP  = ($Records | Where-Object {  $_.IP -ne '—' } | Select-Object -ExpandProperty IP -Unique).Count
$Failures  = ($Records | Where-Object { $_.Status -eq 'Failure' }).Count
$HighRisk  = ($Records | Where-Object { $_.Risk   -eq 'high' }).Count
$ProtoBD   = $Records | Group-Object Protocol | Sort-Object Count -Descending
#endregion

#region ── BUILD HTML ────────────────────────────────────────────────────────────
Write-Host "[*] Building HTML report..." -ForegroundColor Cyan

# Protocol sidebar items
$ProtoItems = ($ProtoBD | ForEach-Object {
    $pct = [math]::Round(($_.Count / $Total) * 100, 1)
    "<div class='pi'><span class='pn'>$($_.Name)</span><span class='pc'>$($_.Count)</span><div class='pb'><div class='pbf' style='width:${pct}%'></div></div></div>"
}) -join "`n"

# Table rows
$Rows = ($Records | ForEach-Object {
    $sc = if ($_.Status -eq 'Success') { 'bs' } else { 'bf' }
    $rc = switch ($_.Risk) { 'high'{'rh'} 'medium'{'rm'} 'low'{'rl'} default{'rn'} }
    $cc = switch ($_.CA)   { 'success'{'cok'} 'failure'{'cfl'} 'notApplied'{'cwn'} default{'cno'} }
    $cl = switch ($_.CA)   { 'success'{'✓ Applied'} 'failure'{'✗ Blocked'} 'notApplied'{'⚠ None'} default{'—'} }
    $av = $_.User.Substring(0,[Math]::Min(2,$_.User.Length)).ToUpper()
    "<tr>
      <td class='tm'>$($_.DateDisplay)</td>
      <td><div class='uc'><div class='ua'>$av</div><div><div class='un'>$($_.User)</div><div class='uu'>$($_.UPN)</div></div></div></td>
      <td><span class='pb2'>$($_.Protocol)</span></td>
      <td class='ta'>$($_.App)</td>
      <td class='ti'><code>$($_.IP)</code></td>
      <td class='tl'>$($_.Location)</td>
      <td><span class='badge $sc'>$($_.Status)</span></td>
      <td><span class='rd $rc'></span></td>
      <td><span class='badge $cc'>$cl</span></td>
    </tr>"
}) -join "`n"

$GenAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

$HTML = @"
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legacy Auth – $TenantName</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0d0f14;--s1:#13161e;--s2:#1a1e2a;--br:#252936;--ac:#f97316;--tx:#e2e8f0;--mu:#64748b;--ok:#22c55e;--er:#ef4444;--wn:#f59e0b;--nf:#38bdf8;--fn:'IBM Plex Sans',sans-serif;--mn:'IBM Plex Mono',monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:var(--fn);font-size:13px;line-height:1.5;min-height:100vh}
.hdr{background:linear-gradient(135deg,#0d0f14,#13161e 60%,#1a0a00);border-bottom:1px solid var(--br);padding:28px 36px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.hl{display:flex;flex-direction:column;gap:6px}
.eye{font-family:var(--mn);font-size:10px;color:var(--ac);letter-spacing:.15em;text-transform:uppercase;display:flex;align-items:center;gap:6px}
.eye::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ac);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
h1{font-size:24px;font-weight:600;letter-spacing:-.02em;color:#fff}
h1 span{color:var(--ac)}
.hm{font-size:12px;color:var(--mu);font-family:var(--mn)}
.hr{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.tb{background:var(--s2);border:1px solid var(--br);border-radius:6px;padding:6px 12px;font-family:var(--mn);font-size:11px;color:var(--mu)}
.tb strong{color:var(--tx)}
.sr{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--br);border-bottom:1px solid var(--br)}
.sc{background:var(--s1);padding:20px 24px;display:flex;flex-direction:column;gap:4px}
.sl{font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;font-family:var(--mn)}
.sv{font-size:28px;font-weight:600;font-family:var(--mn);color:#fff;line-height:1}
.sv.danger{color:var(--er)}.sv.warn{color:var(--wn)}.sv.info{color:var(--nf)}
.ss{font-size:11px;color:var(--mu)}
.bg{display:grid;grid-template-columns:260px 1fr}
.sb{background:var(--s1);border-right:1px solid var(--br);padding:20px 16px}
.st{font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:.12em;font-family:var(--mn);padding-bottom:12px;border-bottom:1px solid var(--br);margin-bottom:14px}
.pi{margin-bottom:12px}
.pn{font-size:11px;color:var(--tx);display:block;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc{float:right;font-family:var(--mn);font-size:11px;color:var(--ac)}
.pb{background:var(--s2);border-radius:2px;height:3px;margin-top:4px;clear:both}
.pbf{background:var(--ac);height:3px;border-radius:2px;min-width:2px}
.tw{overflow:auto}
.ct{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--br);background:var(--s2);flex-wrap:wrap}
.sx{background:var(--s1);border:1px solid var(--br);border-radius:6px;color:var(--tx);font-family:var(--mn);font-size:12px;padding:6px 10px;outline:none;min-width:220px;transition:border-color .2s}
.sx:focus{border-color:var(--ac)}.sx::placeholder{color:var(--mu)}
.fb{background:var(--s1);border:1px solid var(--br);border-radius:6px;color:var(--mu);font-family:var(--mn);font-size:11px;padding:6px 10px;cursor:pointer;transition:all .2s}
.fb:hover,.fb.active{border-color:var(--ac);color:var(--ac)}
.cr{margin-left:auto;font-family:var(--mn);font-size:11px;color:var(--mu)}
table{width:100%;border-collapse:collapse;min-width:1000px}
thead th{background:var(--s2);color:var(--mu);font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.1em;padding:10px 12px;text-align:left;border-bottom:1px solid var(--br);white-space:nowrap;cursor:pointer;user-select:none}
thead th:hover{color:var(--ac)}
tbody tr{border-bottom:1px solid var(--br);transition:background .12s}
tbody tr:hover{background:var(--s2)}
td{padding:10px 12px;vertical-align:middle}
.tm{font-family:var(--mn);font-size:11px;color:var(--mu);white-space:nowrap}
.ti{font-size:11px;white-space:nowrap}
.ta{color:var(--mu);font-size:11px}
.tl{font-size:12px;white-space:nowrap}
code{font-family:var(--mn);font-size:11px;color:var(--nf)}
.uc{display:flex;align-items:center;gap:8px}
.ua{width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#1e3a5f,#0f2944);border:1px solid #1e3a5f;color:var(--nf);font-family:var(--mn);font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.un{font-size:12px;font-weight:500;color:var(--tx)}.uu{font-size:10px;color:var(--mu);font-family:var(--mn)}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:500;font-family:var(--mn);white-space:nowrap}
.bs{background:rgba(34,197,94,.12);color:var(--ok);border:1px solid rgba(34,197,94,.25)}
.bf{background:rgba(239,68,68,.12);color:var(--er);border:1px solid rgba(239,68,68,.25)}
.cok{background:rgba(34,197,94,.08);color:#86efac;border:1px solid rgba(34,197,94,.2)}
.cfl{background:rgba(239,68,68,.08);color:#fca5a5;border:1px solid rgba(239,68,68,.2)}
.cwn{background:rgba(245,158,11,.08);color:#fcd34d;border:1px solid rgba(245,158,11,.2)}
.cno{background:rgba(100,116,139,.08);color:var(--mu);border:1px solid var(--br)}
.pb2{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-family:var(--mn);background:rgba(249,115,22,.1);color:var(--ac);border:1px solid rgba(249,115,22,.25);white-space:nowrap}
.rd{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid}
.rh{background:rgba(239,68,68,.3);border-color:var(--er)}.rm{background:rgba(245,158,11,.3);border-color:var(--wn)}.rl{background:rgba(34,197,94,.3);border-color:var(--ok)}.rn{background:rgba(100,116,139,.2);border-color:var(--mu)}
.fw{padding:14px 24px;border-top:1px solid var(--br);display:flex;justify-content:space-between;align-items:center;font-family:var(--mn);font-size:10px;color:var(--mu);background:var(--s1)}
.wa{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:10px 16px;margin:16px 24px;font-size:12px;color:#fcd34d;display:flex;gap:8px}
tr.hr2{display:none}
</style></head><body>
<div class="hdr">
  <div class="hl">
    <div class="eye">Entra ID · Security Report</div>
    <h1>Legacy <span>Authentication</span> Audit</h1>
    <div class="hm">Lookback: $Days days &nbsp;|&nbsp; Generated: $GenAt</div>
  </div>
  <div class="hr">
    <div class="tb"><strong>$TenantName</strong></div>
    <div class="tb" style="margin-top:4px;font-size:10px;">$TenantId</div>
  </div>
</div>
<div class="sr">
  <div class="sc"><div class="sl">Total Sign-Ins</div><div class="sv">$Total</div><div class="ss">legacy auth events</div></div>
  <div class="sc"><div class="sl">Affected Users</div><div class="sv info">$UniqueU</div><div class="ss">unique identities</div></div>
  <div class="sc"><div class="sl">Unique Source IPs</div><div class="sv">$UniqueIP</div><div class="ss">distinct addresses</div></div>
  <div class="sc"><div class="sl">Failures</div><div class="sv danger">$Failures</div><div class="ss">failed attempts</div></div>
  <div class="sc"><div class="sl">High Risk</div><div class="sv warn">$HighRisk</div><div class="ss">risk-flagged events</div></div>
</div>
<div class="bg">
  <div class="sb">
    <div class="st">Protocol Breakdown</div>
    $ProtoItems
  </div>
  <div class="tw">
    <div class="ct">
      <input type="text" id="sx" class="sx" placeholder="Filter by user, IP, location, protocol…" oninput="ft()">
      <button class="fb" id="bf" onclick="tf('f')">Failures only</button>
      <button class="fb" id="bh" onclick="tf('h')">High risk only</button>
      <button class="fb" id="bn" onclick="tf('n')">No CA applied</button>
      <div class="cr">Showing <span id="vc">$Total</span> of $Total records</div>
    </div>
    <table id="t">
      <thead><tr>
        <th onclick="st(0)">Date / Time ↕</th><th onclick="st(1)">User</th>
        <th onclick="st(2)">Protocol</th><th onclick="st(3)">Application</th>
        <th onclick="st(4)">IP Address</th><th onclick="st(5)">Location</th>
        <th onclick="st(6)">Status</th><th onclick="st(7)">Risk</th>
        <th onclick="st(8)">Cond. Access</th>
      </tr></thead>
      <tbody id="tb">$Rows</tbody>
    </table>
  </div>
</div>
<div class="wa"><span>⚠</span><span>Legacy authentication bypasses MFA and Conditional Access. Block it via <strong>Entra Admin Center → Protection → Conditional Access</strong> with a policy targeting <em>Exchange ActiveSync clients</em> and <em>Other clients</em>.</span></div>
<div class="fw"><span>Farpoint Tech · $TenantName</span><span>Generated $GenAt · $Total records</span></div>
<script>
const af={f:!1,h:!1,n:!1};
function ft(){const q=document.getElementById('sx').value.toLowerCase(),rows=document.querySelectorAll('#tb tr');let v=0;
rows.forEach(r=>{const t=r.textContent.toLowerCase(),fail=t.includes('failure'),high=r.querySelector('.rh')!==null,noca=r.querySelector('.cwn')!==null;
const ok=(!q||t.includes(q))&&(!af.f||fail)&&(!af.h||high)&&(!af.n||noca);
r.classList.toggle('hr2',!ok);if(ok)v++;});document.getElementById('vc').textContent=v;}
function tf(k){af[k]=!af[k];document.getElementById({f:'bf',h:'bh',n:'bn'}[k]).classList.toggle('active',af[k]);ft();}
let sd={};function st(c){const tb=document.getElementById('tb'),rows=[...tb.querySelectorAll('tr')];sd[c]=!sd[c];
rows.sort((a,b)=>{const at=a.cells[c]?.textContent.trim()||'',bt=b.cells[c]?.textContent.trim()||'';return sd[c]?at.localeCompare(bt,undefined,{numeric:!0}):bt.localeCompare(at,undefined,{numeric:!0});});
rows.forEach(r=>tb.appendChild(r));}
</script></body></html>
"@
#endregion

#region ── WRITE & OPEN ──────────────────────────────────────────────────────────
$HTML | Set-Content -Path $OutputPath -Encoding UTF8 -Force
Write-Host "[+] Report saved: $OutputPath" -ForegroundColor Green

if (-not $SkipAutoOpen) {
    try {
        switch ($Platform) {
            'Windows' { Start-Process $OutputPath }
            'macOS'   { & open $OutputPath }
            'Linux'   {
                if ($IsCloudShell) {
                    Write-Host ""
                    Write-Host "  Azure Cloud Shell: Download via the upload/download button" -ForegroundColor Yellow
                    Write-Host "  or access at: $OutputPath" -ForegroundColor Yellow
                    if (Test-Path "$HOME/clouddrive") {
                        Write-Host "  File is in your Cloud Drive – accessible from Azure Files." -ForegroundColor Cyan
                    }
                } else {
                    & xdg-open $OutputPath 2>$null
                }
            }
        }
    } catch {
        Write-Warning "Could not open report automatically. Path: $OutputPath"
    }
}
#endregion

#region ── SUMMARY ───────────────────────────────────────────────────────────────
Disconnect-MgGraph | Out-Null

Write-Host ""
Write-Host "── SUMMARY ───────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Sign-ins     : $Total"    -ForegroundColor White
Write-Host "  Unique users : $UniqueU"  -ForegroundColor Cyan
Write-Host "  Unique IPs   : $UniqueIP" -ForegroundColor White
Write-Host "  Failures     : $Failures" -ForegroundColor ($Failures -gt 0 ? 'Red' : 'Green')
Write-Host "  High risk    : $HighRisk" -ForegroundColor ($HighRisk -gt 0 ? 'Yellow' : 'Green')
Write-Host ""
Write-Host "  Protocol breakdown:" -ForegroundColor DarkGray
$ProtoBD | ForEach-Object { Write-Host "    $($_.Name.PadRight(32)) $($_.Count)" -ForegroundColor White }
Write-Host "──────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""
#endregion
