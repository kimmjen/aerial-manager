# Changelog

## v0.5.2 — 2026-10-14

- No aerial downloaded yet? The app now explains it and opens Wallpaper settings for you; new slots appear as soon as you come back
- After applying a video, the app tells you how to see it: lock your Mac, or click Set live if it went to another slot
- "Upload" is now "Add videos"; an empty library explains how to add videos
- First-run settings no longer show the web-app import to new users

## v0.5.1 — 2026-10-13

- New app icon (a padlock framing a dusk aerial) and a monochrome menu-bar icon that follows light/dark mode
- README: step-by-step install for the unsigned app, with screenshots

## v0.5.0 — 2026-10-12

- **Desktop app**: Aerial Manager is now a macOS menu-bar app (Tauri) instead of a local Next.js web app — no Node, terminal or `.env.local`. Download the universal `.dmg` from GitHub Releases (unsigned for now; see README)
- ffmpeg is bundled (an LGPL build from source, `scripts/build-ffmpeg.sh`); Homebrew ffmpeg is used when installed
- Settings screen for library and backup folders, refresh-on-lock and open-at-login; replaces the `LIBRARY_DIRS`/`BACKUP_DIR`/`FFMPEG_PATH` env vars
- Lock/wake handling is built into the app; the separate wake helper (`scripts/install-wake-helper.sh`) is gone. Settings offers to remove an installed one
- Import the web app's `data/slots.json` from Settings so Restore keeps working
- Blur padding uses `avgblur` (LGPL) instead of `boxblur`; VideoToolbox may fall back to software encoding on Macs without an HEVC encoder
- Removed: the web app, LAN access (`ALLOWED_DEV_ORIGINS`), browser uploads
- Wake helper restarts WallpaperAgent on screen lock by default again; opt out with `install-wake-helper.sh --no-restart-on-lock`. The macOS 27 report that prompted the opt-in turned out to be an unsupported setup (separate still desktop) and an incompatible video format, not a macOS 27 issue
- README: explain that macOS has no separate still-desktop option for aerials, and that videos must be applied through the app
- Wake helper rewritten as a small native Swift watcher (`scripts/wake-watcher.swift`) that restarts WallpaperAgent whenever the lock screen comes up (same effect as re-locking) or the system/display wakes. Replaces sleepwatcher, whose hooks never fired on this setup (no system sleep; display-wake hook silent on Apple Silicon/Tahoe). Events are logged to `~/.aerial-manager/wake.log`. Re-run `sh scripts/install-wake-helper.sh`

## v0.4.1 — 2026-06-03

- Allow LAN access to the dev server via `ALLOWED_DEV_ORIGINS` (comma-separated hosts) so a phone/another device can open it; localhost still works without any config

## v0.4.0 — 2026-06-03

- Auto-reformat on upload: videos whose codec can't live in a `.mov` (e.g. AV1) are re-encoded to H.264 in the background right after upload, so applying them later is always a fast lossless copy
- Library items now expose `codec` and a `status` (`ready` / `converting` / `incompatible` / `error`); a minimal badge surfaces non-ready states (restyle freely)
- Library list reflects conversion progress; the page polls while any conversion is in flight
- Codec probing is cached by file mtime so listings stay fast with many videos

## v0.1.0 — 2026-06-02

Initial release.

- Video library with hover-to-play previews, upload, rename, delete
- Live hero showing the video currently on the lock screen
- One-click replace: upload a file or pick a library video → applied to the live slot
- Slot board: apply any video to any aerial slot, restore Apple originals from automatic backups
- Switch the displayed slot (rewrites the wallpaper store `assetID`)
- Dynamic slot discovery, configurable via `LIBRARY_DIRS` / `BACKUP_DIR` / `FFMPEG_PATH`

## v0.1.1 — 2026-06-02

- Fix: page rendered with a white background on light-mode systems (scaffold CSS overrode the dark theme); the app is now dark-only with `color-scheme: dark`
- Fix: Geist font was overridden by Arial
- Updated README screenshot

## v0.2.0 — 2026-06-02

- Per-slot replace: every slot (not just the live one) now has a Replace… button that picks a file, uploads it, and applies it to that slot directly
- Slot Apply button renamed to Apply Selected for clarity

## v0.3.0 — 2026-06-03

- Reworked apply flow: start from a library video and pick the target slot via an "Apply to ▾" menu (any slot, live or not); the live slot is listed first
- Removed the confusing two-step select-then-apply: the global selection state and the slot "Apply Selected" button are gone
- Slots keep their own "Replace…" (upload a file to that slot), Restore, and Set as Lock Screen actions
- Design: single primary (white) CTA in the header; all other actions are quiet bordered buttons, for a clear focal point and a calmer grid. Apply-to menu closes on outside click
- Fix: applying a video whose codec can't live in a `.mov` (e.g. AV1) now re-encodes to H.264 via VideoToolbox instead of failing; compatible codecs (H.264/HEVC) are still stream-copied losslessly
