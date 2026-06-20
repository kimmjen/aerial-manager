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
  it("accepts H.264/HEVC within aerial limits (stream-copyable)", () => {
    expect(isLockScreenReady(meta("h264", 1920, 1080, 30))).toBe(true);
    expect(isLockScreenReady(meta("h264", 1280, 720, 24))).toBe(true);
    // HEVC at 4K decodes fine on the lock screen (Apple aerials are exactly this)
    expect(isLockScreenReady(meta("hevc", 3840, 2160, 30))).toBe(true);
    // unknown dimensions: don't block the fast path
    expect(isLockScreenReady(meta("h264", null, null, null))).toBe(true);
  });

  it("rejects portrait/near-square sources (blur-pad to 16:9 instead)", () => {
    expect(isLockScreenReady(meta("h264", 720, 1280, 30))).toBe(false); // vertical
    expect(isLockScreenReady(meta("h264", 720, 720, 30))).toBe(false); // square
    expect(isLockScreenReady(meta("h264", 1048, 718, 30))).toBe(false); // ~1.46
  });

  it("rejects 4K H.264 (decode overload → freeze/stutter)", () => {
    expect(isLockScreenReady(meta("h264", 3840, 2160, 60))).toBe(false);
    expect(isLockScreenReady(meta("h264", 3840, 2160, 30))).toBe(false);
  });

  it("rejects anything above 30fps", () => {
    expect(isLockScreenReady(meta("h264", 1920, 1080, 60))).toBe(false);
    expect(isLockScreenReady(meta("hevc", 1920, 1080, 50))).toBe(false);
  });

  it("rejects incompatible codecs", () => {
    expect(isLockScreenReady(meta("av1", 1920, 1080, 30))).toBe(false);
    expect(isLockScreenReady(meta(null, 1920, 1080, 30))).toBe(false);
  });
});

describe("ffmpegArgs", () => {
  it("stream-copies a lock-screen-ready source", () => {
    const args = ffmpegArgs(meta("h264", 1920, 1080, 30), "in.mp4", "out.mov");
    expect(args).toContain("copy");
    expect(args).not.toContain("h264_videotoolbox");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("re-encodes, downscales, and caps fps for 4K60 H.264", () => {
    const args = ffmpegArgs(meta("h264", 3840, 2160, 60), "in.mp4", "out.mov");
    expect(args).toContain("h264_videotoolbox");
    expect(args).toContain("-an");
    expect(args).not.toContain("copy");
    expect(argAfter(args, "-r")).toBe("30");
    expect(argAfter(args, "-vf")).toContain("scale");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("blur-pads a vertical source to 16:9", () => {
    const args = ffmpegArgs(meta("h264", 720, 1280, 30), "in.mp4", "out.mov");
    expect(args).toContain("h264_videotoolbox");
    expect(args).not.toContain("copy");
    const fc = argAfter(args, "-filter_complex");
    expect(fc).toContain("overlay");
    expect(fc).toContain("boxblur");
    expect(argAfter(args, "-map")).toBe("[v]");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("re-encodes an incompatible codec without downscaling when already small", () => {
    const m = meta("av1", 1920, 1080, 30);
    const args = ffmpegArgs(m, "in.mp4", "out.mov");
    expect(args).toContain("h264_videotoolbox");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-r");
    expect(args).toEqual(reencodeArgs("in.mp4", "out.mov", m));
  });
});

describe("reencodeArgs", () => {
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
