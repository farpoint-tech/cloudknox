#!/usr/bin/env bash
# Installs the AI Usage Stream Deck plugin and the Sunday-20:00 launchd backup sync.
#   bash tools/install.sh          copy the .sdPlugin (recommended)
#   bash tools/install.sh --link   symlink instead (development; Stream Deck then reads from ~/Documents)
set -euo pipefail

UUID="tech.farpoint.ai-usage"
LABEL="$UUID.sync"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/$UUID.sdPlugin"
PLUGINS="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins"
DEST="$PLUGINS/$UUID.sdPlugin"
PLIST_SRC="$ROOT/tools/$LABEL.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

[[ -f "$SRC/bin/plugin.js" && -f "$SRC/bin/cli.js" ]] || { echo "Build fehlt: zuerst 'npm run build' im Projektordner." >&2; exit 1; }
[[ -d "$PLUGINS" ]] || { echo "Stream-Deck-Pluginordner fehlt: $PLUGINS" >&2; exit 1; }

# Only ever replaces our own plugin folder.
if [[ -L "$DEST" ]]; then rm "$DEST"; elif [[ -d "$DEST" ]]; then rm -rf "$DEST"; fi
if [[ "${1:-}" == "--link" ]]; then
	ln -s "$SRC" "$DEST"
	echo "Plugin verlinkt: $DEST -> $SRC"
else
	cp -R "$SRC" "$DEST"
	echo "Plugin kopiert: $DEST"
fi

mkdir -p "$HOME/.config/ai-usage-deck" "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DEST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
echo "launchd-Job geladen: $LABEL (Sonntag 20:00)"
launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|path" | head -3 || true

echo
echo "Stream Deck neu starten, damit das Plugin geladen wird:"
echo "  osascript -e 'quit app \"Elgato Stream Deck\"'; sleep 2; open -a \"Elgato Stream Deck\""
echo "Prüfen: node \"$DEST/bin/cli.js\" doctor"
