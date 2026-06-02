# Aerial Manager

Put **your own videos on the macOS lock screen** — through a local web UI.

macOS plays "aerial" videos on the lock screen and as a screen saver. On **macOS 26 (Tahoe)** the downloaded aerial videos live in a user-writable folder:

```
~/Library/Application Support/com.apple.wallpaper/aerials/videos/<UUID>.mov
```

Aerial Manager swaps those files with videos of your choice (remuxed with ffmpeg, no re-encoding), backs up the Apple originals automatically, and lets you pick which slot the lock screen displays.

## Features

- **One-click replace** — upload a video (or pick one from your library) and it becomes your lock screen
- **Video library** — browse your video folders with hover-to-play previews
- **Slot board** — see what is inside each aerial slot and which one is live, with previews
- Apply any video to any slot, restore Apple originals from backup at any time
- Switch the displayed slot without opening System Settings

## Requirements

- **macOS 26 (Tahoe)** — earlier versions store aerials in a root-owned location (`com.apple.idleassetsd`) and are not supported
- **At least one aerial wallpaper downloaded** — System Settings → Wallpaper → pick any aerial. Each downloaded aerial becomes a replaceable slot.
- **ffmpeg** — `brew install ffmpeg`
- **Node.js 20+**

## Quick start

```bash
git clone <repo-url> && cd aerial-manager
npm install
cp .env.example .env.local   # set LIBRARY_DIRS to your video folders
npm run dev                  # → http://localhost:3210
```

Click **Replace Lock Screen**, pick a video, lock your screen (Ctrl+Cmd+Q). Done.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `LIBRARY_DIRS` | `~/Movies` | Comma-separated folders shown in the library. Uploads go to the first one. |
| `BACKUP_DIR` | `~/.aerial-manager/backups` | Where Apple originals are backed up before the first overwrite. |
| `FFMPEG_PATH` | auto-detect | Explicit ffmpeg binary path. |

## How it works

1. Your video is remuxed (`ffmpeg -c copy`) into a `.mov` container — fast, no quality loss.
2. The target slot's `<UUID>.mov` is replaced in place; the Apple original is backed up first.
3. `WallpaperAgent` is restarted so the change takes effect immediately.
4. "Set as Lock Screen" rewrites the selected `assetID` inside `~/Library/Application Support/com.apple.wallpaper/Store/Index.plist`.

The app maintains a `data/slots.json` mapping of which of your videos is inside which slot.

## Caveats

- Thumbnails in System Settings still show Apple's original previews; the played video is yours.
- macOS updates or wallpaper re-downloads may overwrite replaced slots — just re-apply.
- H.264 sources are recommended (browser previews and broad compatibility). HEVC works on the lock screen but may not preview in non-Safari browsers.
- Everything happens in user-space (`~/Library`); no sudo, no SIP changes.

Use at your own risk — this modifies files inside `~/Library/Application Support/com.apple.wallpaper`. Originals are always backed up to `BACKUP_DIR` before the first overwrite.

## Development

```bash
npm run dev    # dev server on :3210
npm test       # vitest unit tests
npm run lint   # eslint
npm run build  # production build
```

## License

[MIT](LICENSE)
