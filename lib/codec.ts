import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { FFPROBE } from "./config";

const run = promisify(execFile);

/** Video codec of the first video stream, or null if it can't be determined. */
export async function probeCodec(file: string): Promise<string | null> {
  try {
    const { stdout } = await run(FFPROBE, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name",
      "-of", "default=nw=1:nk=1",
      file,
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// Probing reads the file header; cache by path+mtime so repeated listings are cheap.
const cache = new Map<string, string | null>();

export async function getCodecCached(file: string): Promise<string | null> {
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const key = `${file}:${mtime}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const codec = await probeCodec(file);
  cache.set(key, codec);
  return codec;
}
