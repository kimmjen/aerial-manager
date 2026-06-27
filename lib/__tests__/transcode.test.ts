import { describe, expect, it } from "vitest";
import { ffmpegArgs, isLockScreenReady, isMovCompatible, reencodeArgs } from "../transcode";
import type { VideoMeta } from "../codec";

const meta = (codec: string | null, width: number | null, height: number | null, fps: number | null): VideoMeta => ({
  codec,
  width,
  height,
  fps,
});

/** Value following `flag` in an ffmpeg arg list, or undefined. */
function argAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe("isMovCompatible", () => {
  it("accepts h264 and hevc (any case)", () => {
    expect(isMovCompatible("h264")).toBe(true);
    expect(isMovCompatible("hevc")).toBe(true);
    expect(isMovCompatible("HEVC")).toBe(true);
  });

  it("rejects av1, vp9, and unknown", () => {
    expect(isMovCompatible("av1")).toBe(false);
    expect(isMovCompatible("vp9")).toBe(false);
    expect(isMovCompatible(null)).toBe(false);
  });
});

describe("isLockScreenReady", () => {
  it("stream-copies only landscape HEVC (the lock screen renderer needs HEVC)", () => {
    expect(isLockScreenReady(meta("hevc", 1920, 1080, 30))).toBe(true);
    // HEVC at 4K / high fps decodes fine on the lock screen (Apple aerials are exactly this)
    expect(isLockScreenReady(meta("hevc", 3840, 2160, 60))).toBe(true);
    // unknown dimensions: don't block the fast path
    expect(isLockScreenReady(meta("hevc", null, null, null))).toBe(true);
  });

  it("rejects H.264 and other codecs — they must be re-encoded to HEVC", () => {
    expect(isLockScreenReady(meta("h264", 1920, 1080, 30))).toBe(false);
    expect(isLockScreenReady(meta("av1", 1920, 1080, 30))).toBe(false);
    expect(isLockScreenReady(meta(null, 1920, 1080, 30))).toBe(false);
  });

  it("rejects portrait/near-square HEVC (blur-pad to 16:9 instead)", () => {
    expect(isLockScreenReady(meta("hevc", 720, 1280, 30))).toBe(false);
    expect(isLockScreenReady(meta("hevc", 720, 720, 30))).toBe(false);
  });
});

describe("ffmpegArgs (slot output is HEVC)", () => {
  it("stream-copies a lock-screen-ready HEVC source", () => {
    const args = ffmpegArgs(meta("hevc", 1920, 1080, 30), "in.mov", "out.mov");
    expect(args).toContain("copy");
    expect(args).not.toContain("hevc_videotoolbox");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("re-encodes H.264 to HEVC (hvc1)", () => {
    const args = ffmpegArgs(meta("h264", 1920, 1080, 30), "in.mp4", "out.mov");
    expect(args).toContain("hevc_videotoolbox");
    expect(args).toContain("hvc1");
    expect(args).not.toContain("copy");
    expect(args).not.toContain("h264_videotoolbox");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("re-encodes, downscales, and caps fps for 4K60 (to HEVC)", () => {
    const args = ffmpegArgs(meta("h264", 3840, 2160, 60), "in.mp4", "out.mov");
    expect(args).toContain("hevc_videotoolbox");
    expect(argAfter(args, "-r")).toBe("30");
    expect(argAfter(args, "-vf")).toContain("scale");
  });

  it("blur-pads a vertical source to 16:9 (HEVC)", () => {
    const args = ffmpegArgs(meta("h264", 720, 1280, 30), "in.mp4", "out.mov");
    expect(args).toContain("hevc_videotoolbox");
    const fc = argAfter(args, "-filter_complex");
    expect(fc).toContain("overlay");
    expect(fc).toContain("boxblur");
    expect(argAfter(args, "-map")).toBe("[v]");
  });
});

describe("reencodeArgs (H.264, used for the in-place library reformat)", () => {
  it("produces a plain H.264 re-encode when given no metadata (back-compat)", () => {
    const args = reencodeArgs("in.mp4", "out.mov");
    expect(args).toContain("h264_videotoolbox");
    expect(args).toContain("-an");
    expect(args).toContain("avc1");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-r");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("downscales and caps fps when metadata exceeds the limits", () => {
    const args = reencodeArgs("in.mp4", "out.mov", meta("hevc", 3840, 2160, 60));
    expect(argAfter(args, "-vf")).toContain("scale");
    expect(argAfter(args, "-r")).toBe("30");
  });
});
