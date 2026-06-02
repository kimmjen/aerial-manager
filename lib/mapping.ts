import fs from "fs";
import path from "path";
import { LibraryDirKey, SLOTS_FILE } from "./config";

export interface SlotSource {
  dir: LibraryDirKey;
  name: string;
  appliedAt: string;
}

/** UUID -> applied source video. Absent key means the slot holds the original aerial. */
export type SlotMapping = Record<string, SlotSource>;

export function readMapping(file: string = SLOTS_FILE): SlotMapping {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function writeMapping(mapping: SlotMapping, file: string = SLOTS_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(mapping, null, 2));
}
