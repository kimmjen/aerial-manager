# Changelog

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
