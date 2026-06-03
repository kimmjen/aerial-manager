import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { FFMPEG } from "./config";
import { reencodeArgs } from "./transcode";
import type { JobState } from "./status";

const run = promisify(execFile);

// Conversion jobs keyed by absolute file path. In-memory: lives as long as the
// dev/server process. Fine for a single-user local tool.
const jobs = new Map<string, JobState>();

export function getJob(absPath: string): JobState | undefined {
  return jobs.get(absPath);
}

/**
 * Re-encode an incompatible video to H.264 in place (same path), in the background.
 * Fire-and-forget: callers do not await. Status is exposed via getJob().
 */
export function convertInBackground(absPath: string): void {
  if (jobs.get(absPath)?.status === "converting") return;
  jobs.set(absPath, { status: "converting" });

  const tmp = absPath + ".converting.mp4";
  (async () => {
    try {
      await run(FFMPEG, reencodeArgs(absPath, tmp));
      fs.renameSync(tmp, absPath); // replace original; mtime change invalidates codec cache
      jobs.delete(absPath);
    } catch {
      fs.rmSync(tmp, { force: true });
      jobs.set(absPath, { status: "error" });
    }
  })();
}
