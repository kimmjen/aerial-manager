import type { VideoMeta } from "./codec";

// Codecs that can live in a .mov container. Used for library status/reformat.
const MOV_COMPATIBLE = new Set(["h264", "hevc"]);

// macOS Tahoe aerials are HEVC. The lock-screen renderer only plays HEVC reliably —
// H.264 in a slot shows a black/frozen screen — so slots are always written as HEVC.
const MAX_FPS = 30;
const MAX_PIXELS = 1920 * 1080;

// Below this width:height ratio a source pillarboxes badly on a landscape lock
// screen (a sea of black around a thin strip). We blur-pad those to 16:9 instead.
const FILL_ASPECT_MAX = 1.6;

// Fit oversized frames within 1080p, preserve aspect, never upscale; keep even
// dimensions. Single quotes protect the commas inside min() from the parser.
const DOWNSCALE_VF =
  "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";

// Blur-pad to 1920x1080: a blurred, zoomed-to-cover background with the full
// (letterbox-contained) source composited on top — fills black bars, keeps all content.
const FILL_FC =
  "[0:v]split=2[bg][fg];" +
  "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=20:2[bgb];" +
  "[fg]scale=1920:1080:force_original_aspect_ratio=decrease[fgs];" +
  "[bgb][fgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]";

export function isMovCompatible(codec: string | null): boolean {
  return codec !== null && MOV_COMPATIBLE.has(codec.toLowerCase());
}

/** True when the source is tall/square enough to need blur-padding to 16:9. */
function needsFill(meta: VideoMeta): boolean {
  if (meta.width == null || meta.height == null) return false;
  return meta.width / meta.height < FILL_ASPECT_MAX;
}

function isOversized(meta: VideoMeta | undefined): boolean {
  return meta?.width != null && meta?.height != null && meta.width * meta.height > MAX_PIXELS;
}

/**
 * True when the source can be stream-copied straight into a lock-screen .mov:
 * it must already be HEVC (the renderer needs it) and a landscape-ish aspect
 * (otherwise we blur-pad it). Unknown dimensions don't block the fast path.
 */
export function isLockScreenReady(meta: VideoMeta): boolean {
  if (meta.codec?.toLowerCase() !== "hevc") return false;
  if (needsFill(meta)) return false;
  return true;
}

/** Scale/pad filter args for a normalized re-encode (empty when no change needed). */
function videoFilterArgs(meta?: VideoMeta): string[] {
  if (meta && needsFill(meta)) return ["-filter_complex", FILL_FC, "-map", "[v]"];
  if (isOversized(meta)) return ["-vf", DOWNSCALE_VF];
  return [];
}

function fpsCapArgs(meta?: VideoMeta): string[] {
  return meta?.fps != null && meta.fps > MAX_FPS ? ["-r", String(MAX_FPS)] : [];
}

/**
 * Re-encode `src` to H.264 via VideoToolbox. Used for the in-place library
 * reformat (browser-previewable). With `meta`, oversized frames are scaled to
 * fit 1080p, tall/square sources are blur-padded, and high frame rates capped.
 */
export function reencodeArgs(src: string, out: string, meta?: VideoMeta): string[] {
  return [
    "-y", "-loglevel", "error", "-i", src, "-an",
    ...videoFilterArgs(meta),
    "-c:v", "h264_videotoolbox", "-b:v", "20M", "-tag:v", "avc1",
    ...fpsCapArgs(meta),
    "-movflags", "+faststart", out,
  ];
}

/** Re-encode `src` to HEVC (hvc1) for a lock-screen slot, with the same normalization. */
function hevcSlotArgs(src: string, out: string, meta?: VideoMeta): string[] {
  return [
    "-y", "-loglevel", "error", "-i", src, "-an",
    ...videoFilterArgs(meta),
    "-c:v", "hevc_videotoolbox", "-b:v", "12M", "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
    ...fpsCapArgs(meta),
    "-movflags", "+faststart", out,
  ];
}

/**
 * ffmpeg args to produce a lock-screen-ready .mov at `out` from `src`.
 * HEVC landscape sources are stream-copied (fast, lossless); everything else is
 * re-encoded to HEVC (the format the lock-screen renderer plays) and normalized.
 */
export function ffmpegArgs(meta: VideoMeta, src: string, out: string): string[] {
  if (isLockScreenReady(meta)) {
    return ["-y", "-loglevel", "error", "-i", src, "-c", "copy", "-movflags", "+faststart", out];
  }
  return hevcSlotArgs(src, out, meta);
}
