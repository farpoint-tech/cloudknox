#!/bin/zsh
# KLASSIFIKATION (Nexus.365-Klassifikationsstandard, sinngemäß für lokale macOS-Werkzeuge)
#   tier: 2                Endgerät des Benutzers (User Plane), kein Tenant-Zugriff
#   userImpact: none       Kein Effekt für Benutzer; baut nur die App.
#   adminInterference: low Schreibt nur in den Ausgabeordner und temporäre Ordner.
# Build an actual application; Finder/notification activation opens the dashboard.
set -eu
ROOT="${0:A:h}"
VERSION=$(awk -F'"' '/^VERSION=/{print $2}' "$ROOT/src/memguard")
OUT="${MEMGUARD_APP_OUTPUT:-$ROOT/dist/MemGuard.app}"
if [[ -e "$OUT" ]]; then
  print -u2 "Output already exists: $OUT. Use a fresh MEMGUARD_APP_OUTPUT for a new build."; exit 1
fi
mkdir -p "${OUT:h}"
# File-provider folders can attach FinderInfo during compilation, breaking signing.
STAGE=$(mktemp -d /tmp/memguard-app-build.XXXXXXXX)
BUNDLE="$STAGE/MemGuard.app"
/usr/bin/osacompile -o "$BUNDLE" "$ROOT/native/MemGuard.applescript"
INFO="$BUNDLE/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleIdentifier -string tech.farpoint.memguard.app "$INFO"
/usr/bin/plutil -replace CFBundleName -string MemGuard "$INFO"
/usr/bin/plutil -replace CFBundleDisplayName -string MemGuard "$INFO"
/usr/bin/plutil -replace CFBundleShortVersionString -string "$VERSION" "$INFO"
/usr/bin/plutil -replace CFBundleVersion -string "$VERSION" "$INFO"
/usr/bin/plutil -replace LSUIElement -bool true "$INFO"
RUNTIME="$BUNDLE/Contents/Resources/MemGuard"
mkdir -p "$RUNTIME/app" "$RUNTIME/src"
cp "$ROOT/MemGuard.command" "$RUNTIME/"
cp "$ROOT/src/config.default.json" "$RUNTIME/src/"
cp "$ROOT/src/memguard" "$RUNTIME/src/"
for file in server.mjs core.mjs open-dashboard.mjs package.json public; do cp -R "$ROOT/app/$file" "$RUNTIME/app/"; done
chmod 755 "$RUNTIME/MemGuard.command"
# Ad-hoc signing provides a consistent local bundle, not Developer ID/notarization.
/usr/bin/xattr -cr "$BUNDLE"
/usr/bin/codesign --force --sign - "$BUNDLE"
/usr/bin/ditto --norsrc "$BUNDLE" "$OUT"
/usr/bin/xattr -cr "$OUT"
/usr/bin/codesign --verify --deep --strict "$OUT"
print "Build staging: $STAGE"
print "Application: $OUT"
