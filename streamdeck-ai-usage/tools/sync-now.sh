#!/usr/bin/env bash
# Manual full reconcile (writes one line per provider to ~/.config/ai-usage-deck/history.jsonl).
set -euo pipefail
NODE="${NODE:-/Users/supreme/.nvm/versions/node/v24.17.0/bin/node}"
exec "$NODE" "$(cd "$(dirname "$0")/.." && pwd)/bin/cli.js" sync
