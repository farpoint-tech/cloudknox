#!/bin/zsh
set -eu
ROOT="${0:A:h}"
VERSION=$(awk -F'"' '/^VERSION=/{print $2}' "$ROOT/src/memguard")
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/MemGuard/app" "$ROOT/dist"
for file in MemGuard.command README.md REVIEW.md install.sh uninstall.sh build-pkg.sh build-release.sh; do
  cp "$ROOT/$file" "$STAGE/MemGuard/$file"
done
cp -R "$ROOT/src" "$ROOT/pkg" "$STAGE/MemGuard/"
for file in package.json server.mjs core.mjs public test; do
  cp -R "$ROOT/app/$file" "$STAGE/MemGuard/app/$file"
done
chmod +x "$STAGE/MemGuard/MemGuard.command"
COPYFILE_DISABLE=1 /usr/bin/ditto -c -k --norsrc --keepParent "$STAGE/MemGuard" "$ROOT/dist/MemGuard-$VERSION.zip"
/usr/bin/shasum -a 256 "$ROOT/dist/MemGuard-$VERSION.zip" > "$ROOT/dist/MemGuard-$VERSION.zip.sha256"
print "Paket: $ROOT/dist/MemGuard-$VERSION.zip"
