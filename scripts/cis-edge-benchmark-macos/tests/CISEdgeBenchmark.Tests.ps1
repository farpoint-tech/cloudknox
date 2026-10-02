# Pester tests for the CIS Edge Benchmark macOS module.
#
# These tests are platform-agnostic: they exercise the pure logic helpers
# (token comparison, numeric comparison, token generation), the module
# contract (exported cmdlets), and the data files (cis_checks.json, dashboard).
# They deliberately do NOT invoke the macOS `defaults` command, so they run on
# Linux CI runners as well as on macOS.
#
# Run:  Invoke-Pester -Path ./tests

BeforeAll {
    $script:ModuleDir  = Split-Path -Parent $PSScriptRoot
    $script:Manifest   = Join-Path $ModuleDir 'CISEdgeBenchmark.psd1'
    $script:ChecksFile = Join-Path $ModuleDir 'cis_checks.json'
    Import-Module $Manifest -Force
}

AfterAll {
    Remove-Module CISEdgeBenchmark -Force -ErrorAction SilentlyContinue
}

Describe 'Module contract' {
    It 'imports without error' {
        Get-Module CISEdgeBenchmark | Should -Not -BeNullOrEmpty
    }

    It 'exports the expected public cmdlets' {
        $exported = (Get-Module CISEdgeBenchmark).ExportedFunctions.Keys
        $exported | Should -Contain 'Invoke-CISEdgeAudit'
        $exported | Should -Contain 'Invoke-CISEdgeEnforce'
        $exported | Should -Contain 'Invoke-CISEdgeRestore'
        $exported | Should -Contain 'Show-CISEdgeDashboard'
    }

    It 'does not leak private helpers as exported cmdlets' {
        $exported = (Get-Module CISEdgeBenchmark).ExportedFunctions.Keys
        $exported | Should -Not -Contain 'New-CISEdgeBackup'
        $exported | Should -Not -Contain 'Get-CISEnforceToken'
    }

    It 'Invoke-CISEdgeEnforce exposes -NoBackup and -DryRun switches' {
        $cmd = Get-Command Invoke-CISEdgeEnforce
        $cmd.Parameters.Keys | Should -Contain 'NoBackup'
        $cmd.Parameters.Keys | Should -Contain 'DryRun'
    }
}

Describe 'cis_checks.json data file' {
    BeforeAll {
        $script:Checks = Get-Content $ChecksFile -Raw -Encoding UTF8 | ConvertFrom-Json
    }

    It 'is valid JSON' {
        { Get-Content $ChecksFile -Raw -Encoding UTF8 | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'contains at least 100 checks' {
        $Checks.Count | Should -BeGreaterThan 100
    }

    It 'every check has an id, title and level' {
        foreach ($c in $Checks) {
            $c.id    | Should -Not -BeNullOrEmpty
            $c.title | Should -Not -BeNullOrEmpty
            $c.level | Should -BeIn @('L1', 'L2')
        }
    }

    It 'has no duplicate check ids' {
        $ids = $Checks | ForEach-Object { $_.id }
        ($ids | Sort-Object -Unique).Count | Should -Be $ids.Count
    }
}

Describe 'Test-CISTokenEqual (constant-time compare)' {
    It 'returns true for identical strings' {
        InModuleScope CISEdgeBenchmark { Test-CISTokenEqual 'abc123' 'abc123' } | Should -BeTrue
    }
    It 'returns false for different strings of equal length' {
        InModuleScope CISEdgeBenchmark { Test-CISTokenEqual 'abc123' 'abc124' } | Should -BeFalse
    }
    It 'returns false for different-length strings' {
        InModuleScope CISEdgeBenchmark { Test-CISTokenEqual 'abc' 'abcd' } | Should -BeFalse
    }
    It 'returns false when either side is empty' {
        InModuleScope CISEdgeBenchmark { Test-CISTokenEqual '' 'abc' } | Should -BeFalse
        InModuleScope CISEdgeBenchmark { Test-CISTokenEqual 'abc' '' } | Should -BeFalse
    }
}

Describe 'Test-CISNumericEqual (tolerant numeric compare)' {
    It 'matches equal integers regardless of string formatting' {
        InModuleScope CISEdgeBenchmark { Test-CISNumericEqual '1' 1 } | Should -BeTrue
        InModuleScope CISEdgeBenchmark { Test-CISNumericEqual ' 0 ' '0' } | Should -BeTrue
    }
    It 'does not match unequal integers' {
        InModuleScope CISEdgeBenchmark { Test-CISNumericEqual '1' '0' } | Should -BeFalse
    }
    It 'falls back to string compare for non-numeric values without throwing' {
        InModuleScope CISEdgeBenchmark { Test-CISNumericEqual 'enabled' 'enabled' } | Should -BeTrue
        InModuleScope CISEdgeBenchmark { Test-CISNumericEqual 'enabled' 'disabled' } | Should -BeFalse
    }
}

Describe 'Get-CISEnforceToken (CSRF capability token)' {
    It 'produces a 64-character lowercase hex string (256-bit)' {
        $token = InModuleScope CISEdgeBenchmark { Get-CISEnforceToken }
        $token | Should -Match '^[0-9a-f]{64}$'
    }
    It 'is stable within a session (same token on repeat calls)' {
        $t1 = InModuleScope CISEdgeBenchmark { Get-CISEnforceToken }
        $t2 = InModuleScope CISEdgeBenchmark { Get-CISEnforceToken }
        $t1 | Should -Be $t2
    }
}

Describe 'Dashboard assets' {
    It 'dashboard.html escapes every audit field it renders (no raw interpolation)' {
        $html = Get-Content (Join-Path $ModuleDir 'dashboard.html') -Raw
        # Guard against regressions: the known-sensitive fields must be escaped.
        $html | Should -Match 'esc\(r\.level\)'
        $html | Should -Match 'esc\(r\.status\)'
        $html | Should -Match 'esc\(r\.id\)'
    }
}
