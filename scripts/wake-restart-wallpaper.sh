#!/bin/sh
# Aerial Manager — work around the macOS Tahoe bug where the lock-screen aerial
# fails to resume after sleep (it shows a black/frozen frame). Manually re-locking
# (Ctrl+Cmd+Q) fixes it; so does restarting WallpaperAgent. This script does the
# latter automatically on wake. It is run by sleepwatcher's -w (system wake) and
# -W (display wake) hooks — a Mac on power often only sleeps its display.
sleep 1
/usr/bin/killall WallpaperAgent 2>/dev/null || true
