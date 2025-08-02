try {
    Write-Host "Verwende Standard-Methode zum Entfernen von Funktionen..." -ForegroundColor Cyan
    
    # Alle benutzerdefinierten Funktionen finden
    $userFunctions = Get-ChildItem Function: | Where-Object { 
        $_.Source -eq "" -or $_.Source -eq $null 
    }
    
    $count = $userFunctions.Count
    Write-Host "Gefundene benutzerdefinierte Funktionen: $count" -ForegroundColor Yellow
    
    if ($count -gt 0) {
        # Funktionen auflisten
        $userFunctions | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
        
        # Funktionen entfernen
        $userFunctions | Remove-Item -Force
        Write-Host "✓ ERFOLG: $count Funktionen entfernt" -ForegroundColor Green
    } else {
        Write-Host "✓ Keine benutzerdefinierten Funktionen gefunden" -ForegroundColor Green
    }
}
catch {
    Write-Host "✗ FEHLER: $($_.Exception.Message)" -ForegroundColor Red
}
