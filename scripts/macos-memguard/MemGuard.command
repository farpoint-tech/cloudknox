#!/bin/zsh
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
