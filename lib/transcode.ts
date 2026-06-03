// Codecs that AVFoundation plays on the lock screen AND that can live in a .mov container.
// Anything else (av1, vp9, …) must be re-encoded.
const MOV_COMPATIBLE = new Set(["h264", "hevc"]);

export function isMovCompatible(codec: string | null): boolean {
  return codec !== null && MOV_COMPATIBLE.has(codec.toLowerCase());
}

/**
 * ffmpeg args to produce a lock-screen-ready .mov at `out` from `src`.
 * Compatible sources are stream-copied (fast, lossless); others are re-encoded
 * to H.264 via VideoToolbox (hardware-accelerated on macOS).
 */
export function ffmpegArgs(codec: string | null, src: string, out: string): string[] {
  const base = ["-y", "-loglevel", "error", "-i", src];
  if (isMovCompatible(codec)) {
    return [...base, "-c", "copy", "-movflags", "+faststart", out];
  }
  return [
    ...base,
    "-an", // aerials are silent; also avoids incompatible audio codecs
    "-c:v",
    "h264_videotoolbox",
    "-b:v",
    "20M",
    "-tag:v",
    "avc1",
    "-movflags",
    "+faststart",
    out,
  ];
}
