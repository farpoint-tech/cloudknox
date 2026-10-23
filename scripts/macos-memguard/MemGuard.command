#!/bin/zsh
set -eu
cd "${0:A:h}/app"
if ! command -v node >/dev/null; then
  print 'MemGuard benötigt Node.js 22 oder neuer. Bitte Node.js installieren und erneut öffnen.'
  read -r '?Zum Schließen Enter drücken.'
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  print 'Node.js ist zu alt. MemGuard benötigt Version 22 oder neuer.'
  exit 1
fi
exec node server.mjs --open
