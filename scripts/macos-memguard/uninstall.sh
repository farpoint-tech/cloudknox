#!/bin/zsh
# Removes MemGuard (per-user and, with sudo, system-wide). Logs are kept.
set -u
LABEL="tech.farpoint.memguard"
CU=$(stat -f %Su /dev/console); CUID=$(id -u "$CU")
launchctl bootout "gui/$CUID/$LABEL" 2>/dev/null && print "stopped agent for $CU"
UHOME=$(dscl . -read "/Users/$CU" NFSHomeDirectory | awk '{print $2}')
rm -f "$UHOME/Library/LaunchAgents/$LABEL.plist" "$UHOME/Library/Application Support/MemGuard/memguard"
if [[ -e "/Library/LaunchAgents/$LABEL.plist" || -d "/Library/Application Support/MemGuard" ]]; then
  if [[ $EUID -ne 0 ]]; then print "system-wide install found: run again with sudo to remove it"; exit 1; fi
  rm -f "/Library/LaunchAgents/$LABEL.plist" /usr/local/bin/memguard
  rm -rf "/Library/Application Support/MemGuard"
  pkgutil --forget "$LABEL" >/dev/null 2>&1
  print "removed system-wide install"
fi
print "done. Kept: user config in ~/Library/Application Support/MemGuard/config.json and logs in ~/Library/Logs/MemGuard"
