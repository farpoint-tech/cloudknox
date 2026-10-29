#!/bin/zsh
# KLASSIFIKATION (Nexus.365-Klassifikationsstandard, sinngemäß für lokale macOS-Werkzeuge)
#   tier: 2                Endgerät des Benutzers (User Plane), kein Tenant-Zugriff
#   userImpact: none       Kein Effekt für Benutzer; baut nur ein Paket.
#   adminInterference: low Schreibt nur nach dist/ und in temporäre Ordner.
# Builds dist/MemGuard-<version>.pkg. Optional: SIGN_ID="Developer ID Installer: ..." ./build-pkg.sh
set -eu
R="${0:A:h}"; SRC="$R/src"; LABEL="tech.farpoint.memguard"
VER=$(awk -F'"' '/^VERSION=/{print $2}' "$SRC/memguard")
ROOT=$(mktemp -d); trap 'rm -rf "$ROOT"' EXIT
[[ -d "$R/dist/MemGuard.app" ]] || { print -u2 'Build MemGuard.app first: zsh build-app.sh'; exit 1; }
APP="$ROOT/Library/Application Support/MemGuard"
mkdir -p "$APP" "$ROOT/Library/LaunchAgents"
install -m 755 "$SRC/memguard" "$APP/memguard"
/usr/bin/ditto --norsrc "$R/dist/MemGuard.app" "$APP/MemGuard.app"
install -m 644 "$SRC/config.default.json" "$APP/config.json"
install -m 644 "$SRC/config.example-ml.json" "$APP/config.example-ml.json"
install -m 755 "$R/uninstall.sh" "$APP/uninstall.sh"
sed "s|__BIN__|/Library/Application Support/MemGuard/memguard|" "$SRC/$LABEL.plist" > "$ROOT/Library/LaunchAgents/$LABEL.plist"
chmod 755 "$R/pkg/scripts/"*
xattr -cr "$ROOT" "$R/pkg/scripts"; export COPYFILE_DISABLE=1
mkdir -p "$R/dist"
OUT="$R/dist/MemGuard-$VER.pkg"
pkgbuild --root "$ROOT" --identifier "$LABEL" --version "$VER" --install-location / \
  --scripts "$R/pkg/scripts" --filter "\.DS_Store" --filter "/\._" --filter "\.svn" --filter "CVS" ${SIGN_ID:+--sign "$SIGN_ID"} "$OUT"
shasum -a 256 "$OUT" | tee "$OUT.sha256"
