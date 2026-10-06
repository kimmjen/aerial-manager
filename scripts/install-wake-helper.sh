#!/bin/sh
# Install the wake-restart helper: restarts WallpaperAgent on wake so the
# lock-screen aerial resumes (macOS Tahoe fails to resume it after sleep).
# Requires sleepwatcher:  brew install sleepwatcher
# Uninstall:  launchctl bootout gui/$(id -u)/com.aerial-manager.wakewatcher && rm ~/Library/LaunchAgents/com.aerial-manager.wakewatcher.plist
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"

SW="$(command -v sleepwatcher || true)"
[ -x "$SW" ] || SW="/opt/homebrew/sbin/sleepwatcher"
[ -x "$SW" ] || { echo "sleepwatcher not found. Install it: brew install sleepwatcher"; exit 1; }

DEST_DIR="$HOME/.aerial-manager"
SCRIPT="$DEST_DIR/wake-restart-wallpaper.sh"
LABEL="com.aerial-manager.wakewatcher"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$DEST_DIR" "$HOME/Library/LaunchAgents"
cp "$HERE/wake-restart-wallpaper.sh" "$SCRIPT"
chmod +x "$SCRIPT"

sed -e "s|__SLEEPWATCHER__|$SW|" -e "s|__SCRIPT__|$SCRIPT|" \
  "$HERE/com.aerial-manager.wakewatcher.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout returns before the job is fully gone; retry once if bootstrap races it
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || { sleep 1; launchctl bootstrap "gui/$(id -u)" "$PLIST"; }
echo "installed and loaded: $LABEL"
echo "  sleepwatcher: $SW"
echo "  wake script:  $SCRIPT"
