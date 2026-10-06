#!/bin/sh
# Install the wake watcher: restarts WallpaperAgent on system/display wake so the
# lock-screen aerial resumes (macOS Tahoe fails to resume it after sleep).
# Usage: sh scripts/install-wake-helper.sh [--restart-on-lock]
#   --restart-on-lock  also restart whenever the screen locks (macOS 26 only; untested on 27)
# Requires the Xcode command line tools (swiftc):  xcode-select --install
# Log:        ~/.aerial-manager/wake.log
# Uninstall:  launchctl bootout gui/$(id -u)/com.aerial-manager.wakewatcher && rm ~/Library/LaunchAgents/com.aerial-manager.wakewatcher.plist
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

command -v swiftc >/dev/null || { echo "swiftc not found. Install it: xcode-select --install"; exit 1; }

DEST_DIR="$HOME/.aerial-manager"
BIN="$DEST_DIR/wake-watcher"
LOG="$DEST_DIR/wake.log"
LABEL="com.aerial-manager.wakewatcher"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$DEST_DIR" "$HOME/Library/LaunchAgents"
swiftc -O -o "$BIN" "$HERE/wake-watcher.swift"

EXTRA_ARGS=""
[ "$1" = "--restart-on-lock" ] && EXTRA_ARGS="<string>--restart-on-lock</string>"

sed -e "s|__BIN__|$BIN|" -e "s|<!--__EXTRA_ARGS__-->|$EXTRA_ARGS|" -e "s|__LOG__|$LOG|g" \
  "$HERE/com.aerial-manager.wakewatcher.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout returns before the job is fully gone; retry once if bootstrap races it
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || { sleep 1; launchctl bootstrap "gui/$(id -u)" "$PLIST"; }
rm -f "$DEST_DIR/wake-restart-wallpaper.sh" # left over from the sleepwatcher version
echo "installed and loaded: $LABEL"
echo "  binary: $BIN"
echo "  log:    $LOG"
echo "  restart on lock: $([ -n "$EXTRA_ARGS" ] && echo yes || echo no)"
