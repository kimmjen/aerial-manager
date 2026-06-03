import { describe, expect, it } from "vitest";
import { ffmpegArgs, isMovCompatible } from "../transcode";

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

describe("ffmpegArgs", () => {
  it("stream-copies a compatible codec", () => {
    const args = ffmpegArgs("h264", "in.mp4", "out.mov");
    expect(args).toContain("copy");
    expect(args).not.toContain("h264_videotoolbox");
    expect(args.at(-1)).toBe("out.mov");
  });

  it("re-encodes an incompatible codec to H.264", () => {
    const args = ffmpegArgs("av1", "in.mp4", "out.mov");
    expect(args).toContain("h264_videotoolbox");
    expect(args).toContain("-an");
    expect(args).not.toContain("copy");
    expect(args.at(-1)).toBe("out.mov");
  });
});
