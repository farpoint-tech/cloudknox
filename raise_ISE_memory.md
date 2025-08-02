try {
    Write-Host "Erweitere ISE-Speicher..." -ForegroundColor Cyan
    
    # Funktionstabelle-Kapazität erweitern (nicht leeren!)
    $functionTableField = [System.Management.Automation.SessionState].GetField('_functionTable', 'NonPublic,Instance')
    
    if ($functionTableField) {
        $currentTable = $functionTableField.GetValue($ExecutionContext.SessionState)
        $currentCount = $currentTable.Count
        $currentCapacity = if ($currentTable.GetType().GetProperty('Capacity')) { $currentTable.Capacity } else { "Unbekannt" }
        
        Write-Host "✓ Aktuelle Funktionen: $currentCount" -ForegroundColor Yellow
        Write-Host "✓ Aktuelle Kapazität: $currentCapacity" -ForegroundColor Yellow
        
        # Neue größere Funktionstabelle mit erweiteter Kapazität
        $expandedTable = New-Object 'System.Collections.Generic.Dictionary[string,System.Management.Automation.FunctionInfo]' -ArgumentList 10000
        
        # Alle existierenden Funktionen kopieren
        foreach ($kvp in $currentTable.GetEnumerator()) {
            $expandedTable.Add($kvp.Key, $kvp.Value)
        }
        
        # Erweiterte Tabelle setzen
        $functionTableField.SetValue($ExecutionContext.SessionState, $expandedTable)
        
        Write-Host "✓ ERFOLG: ISE-Speicher erweitert!" -ForegroundColor Green -BackgroundColor DarkGreen
        Write-Host "  Neue Kapazität: $($expandedTable.Capacity)" -ForegroundColor White
        Write-Host "  Funktionen erhalten: $($expandedTable.Count)" -ForegroundColor White
        
    } else {
        Write-Host "✗ FEHLER: Funktionstabelle nicht gefunden" -ForegroundColor Red
    }
    
    # Zusätzliche ISE-Speicheroptimierung
    if ($psISE) {
        Write-Host "✓ ISE-Speicher wird optimiert..." -ForegroundColor Cyan
        
        # Garbage Collection optimieren
        [System.GC]::Collect(2, [System.GCCollectionMode]::Optimized)
        [System.GC]::WaitForPendingFinalizers()
        
        # Arbeitsspeicher-Info
        $memory = [System.GC]::GetTotalMemory($false)
        Write-Host "✓ Aktueller Speicherverbrauch: $([math]::Round($memory/1MB, 2)) MB" -ForegroundColor Green
    }
    
}
catch {
    Write-Host "✗ FEHLER beim Speicher erweitern: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nISE-Speichererweiterung abgeschlossen." -ForegroundColor White
