import { describe, expect, it } from "vitest";
import { parseRange } from "../stream";

describe("parseRange", () => {
  it("returns null without a range header", () => {
    expect(parseRange(null, 1000)).toBeNull();
  });

  it("parses an open-ended range", () => {
    expect(parseRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("parses a bounded range and clamps the end", () => {
    expect(parseRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange("bytes=100-99999", 1000)).toEqual({ start: 100, end: 999 });
  });

  it("returns unsatisfiable for start beyond file size", () => {
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
  });

  it("returns null for malformed headers", () => {
    expect(parseRange("bytes=abc", 1000)).toBeNull();
  });
});
