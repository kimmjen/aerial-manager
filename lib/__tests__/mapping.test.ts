import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMapping, writeMapping, type SlotMapping } from "../mapping";

let tmpFile: string;

beforeEach(() => {
  tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "slots-")), "slots.json");
});

afterEach(() => {
  fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
});

describe("slot mapping store", () => {
  it("returns empty mapping when file is missing", () => {
    expect(readMapping(tmpFile)).toEqual({});
  });

  it("round-trips a mapping", () => {
    const m: SlotMapping = {
      "00BA71CD-2C54-415A-A68A-8358E677D750": {
        dir: "new",
        name: "난 꼭 해내리라..MP4",
        appliedAt: "2026-06-02T00:00:00.000Z",
      },
    };
    writeMapping(m, tmpFile);
    expect(readMapping(tmpFile)).toEqual(m);
  });

  it("returns empty mapping on corrupt file", () => {
    fs.writeFileSync(tmpFile, "not json");
    expect(readMapping(tmpFile)).toEqual({});
  });
});
