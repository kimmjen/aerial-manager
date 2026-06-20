import type { VideoMeta } from "./codec";

// Codecs that AVFoundation plays on the lock screen AND that can live in a .mov container.
// Anything else (av1, vp9, …) must be re-encoded.
const MOV_COMPATIBLE = new Set(["h264", "hevc"]);

// Apple aerials are HEVC, ≤30fps. The lock-screen decoder is tuned for that envelope:
// H.264 at 4K, or anything above 30fps, overloads it and stutters/freezes.
const MAX_FPS = 30;
const MAX_PIXELS = 1920 * 1080;

// Below this width:height ratio a source pillarboxes badly on a landscape lock
// screen (a sea of black around a thin strip). We blur-pad those to 16:9 instead.
const FILL_ASPECT_MAX = 1.6;

// Fit oversized frames within 1080p, preserve aspect, never upscale; keep even
// dimensions for H.264. Single quotes protect the commas inside min() from the parser.
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

function isHeavyH264(meta: VideoMeta): boolean {
  return (
    meta.codec?.toLowerCase() === "h264" &&
    meta.width != null &&
    meta.height != null &&
    meta.width * meta.height > MAX_PIXELS
  );
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
 * compatible codec, ≤30fps, not 4K-class H.264 (decoder chokes), and not so
 * tall/square that it would pillarbox into mostly black. Unknown dims/fps don't
 * block the fast path.
 */
export function isLockScreenReady(meta: VideoMeta): boolean {
  if (!isMovCompatible(meta.codec)) return false;
  if (meta.fps != null && meta.fps > MAX_FPS) return false;
  if (isHeavyH264(meta)) return false;
  if (needsFill(meta)) return false;
  return true;
}

/**
 * Re-encode `src` to H.264 via VideoToolbox (hardware-accelerated on macOS).
 * With `meta`: portrait/near-square sources are blur-padded to 16:9, oversized
 * frames are scaled to fit 1080p, and high frame rates are capped — keeping the
 * lock-screen decode load sane. Without `meta`, it is a plain re-encode.
 */
export function reencodeArgs(src: string, out: string, meta?: VideoMeta): string[] {
  const args = ["-y", "-loglevel", "error", "-i", src, "-an"];

  if (meta && needsFill(meta)) {
    args.push("-filter_complex", FILL_FC, "-map", "[v]");
  } else if (isOversized(meta)) {
    args.push("-vf", DOWNSCALE_VF);
  }

  args.push("-c:v", "h264_videotoolbox", "-b:v", "20M", "-tag:v", "avc1");

  if (meta?.fps != null && meta.fps > MAX_FPS) {
    args.push("-r", String(MAX_FPS));
  }

  args.push("-movflags", "+faststart", out);
  return args;
}

/**
 * ffmpeg args to produce a lock-screen-ready .mov at `out` from `src`.
 * Lock-screen-ready sources are stream-copied (fast, lossless); others are
 * re-encoded and normalized to the aerial decode envelope.
 */
export function ffmpegArgs(meta: VideoMeta, src: string, out: string): string[] {
  if (isLockScreenReady(meta)) {
    return ["-y", "-loglevel", "error", "-i", src, "-c", "copy", "-movflags", "+faststart", out];
  }
  return reencodeArgs(src, out, meta);
}
