import fs from "fs";
import os from "os";
import path from "path";

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v"];

/** Parse a comma-separated list of absolute paths into unique basename-keyed entries. */
export function parseLibraryDirs(raw: string | undefined, fallback: string): Record<string, string> {
  const dirs = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (dirs.length === 0) dirs.push(fallback);
  const out: Record<string, string> = {};
  for (const dir of dirs) {
    const base = path.basename(dir) || "library";
    let key = base;
    let n = 2;
    while (key in out) key = `${base}-${n++}`;
    out[key] = dir;
  }
  return out;
}

/** Folders the library panel manages. Configure via LIBRARY_DIRS (comma-separated paths). */
export const LIBRARY_DIRS = parseLibraryDirs(
  process.env.LIBRARY_DIRS,
  path.join(os.homedir(), "Movies"),
);

export type LibraryDirKey = string;

/** Uploads land in the first configured library dir. */
export const DEFAULT_UPLOAD_KEY = Object.keys(LIBRARY_DIRS)[0];

/** macOS Tahoe aerial wallpaper video storage (user-level, no sudo). */
export const AERIALS_DIR = path.join(
  os.homedir(),
  "Library/Application Support/com.apple.wallpaper/aerials/videos",
);

/** Backups of the original Apple aerial videos. Configure via BACKUP_DIR. */
export const BACKUP_DIR =
  process.env.BACKUP_DIR ?? path.join(os.homedir(), ".aerial-manager", "backups");

/** Wallpaper selection store (holds the selected aerial assetID). */
export const INDEX_PLIST = path.join(
  os.homedir(),
  "Library/Application Support/com.apple.wallpaper/Store/Index.plist",
);

/** UUID -> source video mapping persisted by this app. */
export const SLOTS_FILE = path.join(process.cwd(), "data", "slots.json");

function detectFfmpeg(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  for (const candidate of ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "ffmpeg"; // rely on PATH
}

export const FFMPEG = detectFfmpeg();

/** ffprobe sits next to ffmpeg. */
export const FFPROBE = process.env.FFPROBE_PATH ?? FFMPEG.replace(/ffmpeg$/, "ffprobe");
