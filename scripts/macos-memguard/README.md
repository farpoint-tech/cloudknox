# MemGuard

Stops macOS from freezing into a watchdog kernel panic when memory runs out.

A Mac under extreme memory pressure fills its compressor, creates dozens of swap files and stops responding. After about 90 seconds the kernel's watchdog forces a restart (`watchdog timeout: no checkins from watchdogd`). Everything open is lost.

MemGuard checks memory every 10 seconds:

| Situation | Default | What MemGuard does |
|---|---|---|
| Low | ≤ 20 % free or ≥ 20 swap files | Notification naming the three largest apps |
| Critical | ≤ 10 % free or ≥ 40 swap files | Terminates **only** processes that match your `targets`, then notifies |
| Critical, no target running | | Notification only. MemGuard never kills anything you did not list |

Typical targets are heavy local jobs that are safe to restart: video or image generation, local LLM runners, training scripts. Losing one job is better than losing the whole machine.

- No dependencies. Plain zsh plus tools that ship with macOS. Tested on macOS 26.6 (Apple Silicon). Older versions are untested.
- No admin rights needed for the per-user install.
- No network access, no telemetry.

## Install

**Single Mac, current user, no admin:**

```bash
./install.sh
```

With your own config:

```bash
./install.sh --config my-config.json
```

**Many Macs (MDM, Intune, Jamf) or all users:** deploy `dist/MemGuard-<version>.pkg`. It installs to `/Library/Application Support/MemGuard`, starts in every user's session and links `/usr/local/bin/memguard`.

## Configure

Config lookup order:

1. `~/Library/Application Support/MemGuard/config.json` (per user)
2. `/Library/Application Support/MemGuard/config.json` (pkg default)

```json
{
  "language": "en",
  "notifications": true,
  "interval": 10,
  "warn_free_percent": 20,
  "critical_free_percent": 10,
  "warn_swapfiles": 20,
  "critical_swapfiles": 40,
  "warn_repeat_seconds": 600,
  "terminate_grace_seconds": 8,
  "targets": ["~/ltx-video/", "mlx_video", "ComfyUI/main.py", "ollama runner"]
}
```

- `targets`: plain substrings matched against the full command line (`ps -o args`). `~` expands to the home folder. Empty list means warn only.
- `language`: `en` or `de`.
- Matching processes get SIGTERM, then SIGKILL after `terminate_grace_seconds`.
- Changes are picked up within about 5 minutes, or immediately after `launchctl kickstart -k gui/$(id -u)/tech.farpoint.memguard`.

`src/config.example-ml.json` contains example targets for local AI workloads.

## Use

```bash
memguard status     # free memory, swap files, largest apps, matching targets
memguard pause      # keep measuring, never terminate (creates ~/.memguard-off)
memguard resume
memguard selftest   # terminates a harmless dummy process, nothing else
memguard log 50
```

Log: `~/Library/Logs/MemGuard/memguard.log`

## Uninstall

```bash
./uninstall.sh            # per-user install
sudo ./uninstall.sh       # pkg install
```

Config and logs are kept.

## Build the pkg

```bash
./build-pkg.sh
SIGN_ID="Developer ID Installer: Name (TEAMID)" ./build-pkg.sh   # signed
```

Unsigned packages trigger a Gatekeeper warning when opened by double-click. MDM deployment usually requires a signed package. Signing needs an Apple Developer ID Installer certificate, and notarization (`xcrun notarytool`) is recommended for distribution outside MDM.

Files created by some sandboxed tools carry a `com.apple.provenance` attribute. `pkgutil --payload-files` then lists `._` entries. They are restored as attributes on install, not as files. Build from a regular Terminal session for a clean payload.

## Limits

- The thresholds are starting values. Watch the log for a week and adjust.
- MemGuard cannot help if one process grabs all memory within less than one interval.
- The underlying cause is still too much work for the available RAM. MemGuard buys time, it does not add memory.

---

**Kurz auf Deutsch:** MemGuard verhindert Abstürze durch Speichermangel. Unter 20 % freiem Speicher kommt eine Warnung. Unter 10 % beendet MemGuard nur die Prozesse, die unter `targets` eingetragen sind, etwa lokale Video- oder KI-Jobs. Installation ohne Admin mit `./install.sh`, für viele Macs per `.pkg`. Mit `"language": "de"` kommen die Mitteilungen auf Deutsch.

## License

MIT, see the repository [LICENSE](../../LICENSE).
