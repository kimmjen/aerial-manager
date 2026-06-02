import { describe, expect, it } from "vitest";
import { isSafeVideoName } from "../paths";

describe("isSafeVideoName", () => {
  it("accepts a plain video filename", () => {
    expect(isSafeVideoName("난 꼭 해내리라..MP4")).toBe(true);
    expect(isSafeVideoName("clip.mov")).toBe(true);
    expect(isSafeVideoName("a.m4v")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isSafeVideoName("../etc/passwd.mp4")).toBe(false);
    expect(isSafeVideoName("..")).toBe(false);
    expect(isSafeVideoName("foo/bar.mp4")).toBe(false);
  });

  it("rejects non-video extensions", () => {
    expect(isSafeVideoName("script.sh")).toBe(false);
    expect(isSafeVideoName("noext")).toBe(false);
  });

  it("rejects hidden files and empty names", () => {
    expect(isSafeVideoName(".hidden.mp4")).toBe(false);
    expect(isSafeVideoName("")).toBe(false);
  });
});
