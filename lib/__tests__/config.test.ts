import { describe, expect, it } from "vitest";
import { parseLibraryDirs } from "../config";
import { isSlotUuid } from "../slots";

describe("parseLibraryDirs", () => {
  it("falls back when env is empty", () => {
    expect(parseLibraryDirs(undefined, "/Users/x/Movies")).toEqual({ Movies: "/Users/x/Movies" });
    expect(parseLibraryDirs("", "/Users/x/Movies")).toEqual({ Movies: "/Users/x/Movies" });
  });

  it("parses a comma-separated list keyed by basename", () => {
    expect(parseLibraryDirs("/a/clips, /b/shorts", "/fallback")).toEqual({
      clips: "/a/clips",
      shorts: "/b/shorts",
    });
  });

  it("dedupes colliding basenames", () => {
    expect(parseLibraryDirs("/a/videos,/b/videos", "/fallback")).toEqual({
      videos: "/a/videos",
      "videos-2": "/b/videos",
    });
  });
});

describe("isSlotUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isSlotUuid("00BA71CD-2C54-415A-A68A-8358E677D750")).toBe(true);
    expect(isSlotUuid("fe876489-cbd5-479b-a8f0-1b67f0741cea")).toBe(true);
  });

  it("rejects traversal and junk", () => {
    expect(isSlotUuid("../../etc/passwd")).toBe(false);
    expect(isSlotUuid("00BA71CD-2C54-415A-A68A-8358E677D750.mov")).toBe(false);
    expect(isSlotUuid("")).toBe(false);
  });
});
