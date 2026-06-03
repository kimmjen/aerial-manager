import { describe, expect, it } from "vitest";
import { deriveLibraryStatus } from "../status";

describe("deriveLibraryStatus", () => {
  it("reports a running job as converting", () => {
    expect(deriveLibraryStatus("av1", { status: "converting" })).toBe("converting");
    // a job in flight wins even over a compatible codec
    expect(deriveLibraryStatus("h264", { status: "converting" })).toBe("converting");
  });

  it("reports a failed job as error", () => {
    expect(deriveLibraryStatus("av1", { status: "error" })).toBe("error");
  });

  it("reports compatible codecs as ready", () => {
    expect(deriveLibraryStatus("h264", undefined)).toBe("ready");
    expect(deriveLibraryStatus("hevc", undefined)).toBe("ready");
  });

  it("reports incompatible codecs with no job as incompatible", () => {
    expect(deriveLibraryStatus("av1", undefined)).toBe("incompatible");
    expect(deriveLibraryStatus(null, undefined)).toBe("incompatible");
  });
});
