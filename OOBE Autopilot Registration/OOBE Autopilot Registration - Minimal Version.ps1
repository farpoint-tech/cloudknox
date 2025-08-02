
Set-ExecutionPolicy Bypass -Force [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 Install-Script Get-WindowsAutoPilotInfo -Force -Scope CurrentUser Get-WindowsAutoPilotInfo -GroupTag "userdriven" -Online Write-Host "SUCCESS: Autopilot Registration completed!" -ForegroundColor Green
