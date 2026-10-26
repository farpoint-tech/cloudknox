#!/bin/zsh
# KLASSIFIKATION (Nexus.365-Klassifikationsstandard, sinngemäß für lokale macOS-Werkzeuge)
#   tier: 2                Endgerät des Benutzers (User Plane), kein Tenant-Zugriff
#   userImpact: medium     Startet nur die Oberfläche. Nach Bestätigung kann sie den Monitor starten, dann gilt dessen schlimmster Pfad.
#   adminInterference: medium Reversibilität wie Monitor; Konfigurationsänderungen nur mit Ist/Soll-Bestätigung und Sicherungskopie.
set -eu
cd "${0:A:h}/app"
# Finder/LaunchServices does not inherit the interactive shell's PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
if ! command -v node >/dev/null; then
  print 'MemGuard benötigt Node.js 22 oder neuer. Bitte Node.js installieren und erneut öffnen.'
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  print 'Node.js ist zu alt. MemGuard benötigt Version 22 oder neuer.'
  exit 1
fi
exec node open-dashboard.mjs
