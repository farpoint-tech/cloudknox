#!/bin/zsh
# KLASSIFIKATION (Nexus.365-Klassifikationsstandard, sinngemäß für lokale macOS-Werkzeuge)
#   tier: 2                Endgerät des Benutzers (User Plane), kein Tenant-Zugriff
#   userImpact: medium     Installiert und startet den Monitor für den aktuellen Benutzer; danach gilt dessen schlimmster Pfad.
#   adminInterference: medium Reversibilität: LaunchAgent und Konfiguration pro Benutzer, rückgängig mit uninstall.sh.
# Per-user install of MemGuard. No admin rights needed.
# Usage: ./install.sh [--config path/to/config.json]
set -eu
SRC="${0:A:h}/src"
LABEL="tech.farpoint.memguard"
DIR="$HOME/Library/Application Support/MemGuard"
BIN="$DIR/memguard"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_=$(id -u)
ROOT="${0:A:h}"
APP="$ROOT/dist/MemGuard.app"
if [[ ! -d "$APP" ]]; then
  print -u2 'MemGuard.app fehlt. Zuerst zsh build-app.sh ausführen oder das vollständige ZIP verwenden.'; exit 1
fi
/usr/bin/codesign --verify --deep --strict "$APP"

if [[ -f "/Library/LaunchAgents/$LABEL.plist" ]]; then
  print "A system-wide MemGuard (pkg) is already installed. Use that one or remove it first."; exit 1
fi
mkdir -p "$DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/MemGuard"
BACKUP=$(mktemp -d "$DIR/update-backup.XXXXXXXX")
for file in "$BIN" "$AGENT" "$DIR/config.json"; do
  [[ ! -e "$file" ]] || cp -p "$file" "$BACKUP/"
done
[[ ! -d "$DIR/MemGuard.app" ]] || /usr/bin/ditto --norsrc "$DIR/MemGuard.app" "$BACKUP/MemGuard.app"
print "Recovery files: $BACKUP"
launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
install -m 755 "$SRC/memguard" "$BIN"
/usr/bin/ditto --norsrc "$APP" "$DIR/MemGuard.app"
/usr/bin/xattr -cr "$DIR/MemGuard.app"
/usr/bin/codesign --verify --deep --strict "$DIR/MemGuard.app"
if [[ "${1:-}" == "--config" && -n "${2:-}" ]]; then
  install -m 644 "$2" "$DIR/config.json"; print "config: copied from $2"
elif [[ ! -f "$DIR/config.json" ]]; then
  install -m 644 "$SRC/config.default.json" "$DIR/config.json"; print "config: default (warn only, no targets)"
else
  print "config: kept existing $DIR/config.json"
fi
sed "s|__BIN__|$BIN|" "$SRC/$LABEL.plist" > "$AGENT"
plutil -lint -s "$AGENT"
launchctl bootstrap "gui/$UID_" "$AGENT"
sleep 2
"$BIN" status
print "\nInstalled. Optional: ln -s \"$BIN\" /usr/local/bin/memguard"
print 'Notification activation opens MemGuard.app and the local statistics dashboard.'
