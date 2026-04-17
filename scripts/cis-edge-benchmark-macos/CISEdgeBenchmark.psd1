@{
    RootModule        = 'CISEdgeBenchmark.psm1'
    ModuleVersion     = '1.0.0'
    GUID              = '2a7f9d3e-8c14-4b5a-a62f-dc93e8b1f374'
    Author            = 'CIS Edge Benchmark Contributors'
    CompanyName       = 'Community'
    Copyright         = '(c) 2025. All rights reserved.'
    Description       = 'Audit and enforce Microsoft Edge browser settings against CIS Benchmark v4.0.0 on macOS. Uses the macOS defaults system instead of the Windows registry. Includes 128 checks across Level 1 and Level 2, an interactive HTML dashboard, and enforcement capabilities.'
    PowerShellVersion = '7.0'
    FunctionsToExport = @(
        'Invoke-CISEdgeAudit',
        'Invoke-CISEdgeEnforce',
        'Show-CISEdgeDashboard'
    )
    CmdletsToExport   = @()
    VariablesToExport  = @()
    AliasesToExport    = @()
    FileList          = @(
        'CISEdgeBenchmark.psm1',
        'CISEdgeBenchmark.psd1',
        'cis_checks.json',
        'dashboard.html'
    )
    PrivateData       = @{
        PSData = @{
            Tags         = @('CIS', 'Edge', 'Benchmark', 'Security', 'Audit', 'Compliance', 'Hardening', 'macOS', 'Browser', 'defaults', 'plist')
            LicenseUri   = ''
            ProjectUri   = ''
            ReleaseNotes = 'macOS port of CIS Microsoft Edge Benchmark v4.0.0 (128 checks). Replaces Windows registry access with macOS defaults/plist reads and writes.'
        }
    }
}
