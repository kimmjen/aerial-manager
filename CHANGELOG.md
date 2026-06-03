# Changelog

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

- Reworked apply flow: start from a library video and pick the target slot via an "Apply to ▾" menu (any slot, live or not)
- Removed the confusing two-step select-then-apply: the global selection state and the slot "Apply Selected" button are gone
- Slots keep their own "Replace…" (upload a file to that slot), Restore, and Set as Lock Screen actions
