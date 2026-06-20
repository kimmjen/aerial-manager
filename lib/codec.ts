import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { FFPROBE } from "./config";

const run = promisify(execFile);

/** Video stream properties relevant to lock-screen compatibility. */
export interface VideoMeta {
  codec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
}

const UNKNOWN_META: VideoMeta = { codec: null, width: null, height: null, fps: null };

/** Parse ffprobe's `num/den` frame-rate string to a number, or null. */
function parseFps(rate: unknown): number | null {
  if (typeof rate !== "string") return null;
  const [n, d] = rate.split("/").map(Number);
  if (!n || !d) return null;
  return n / d;
}

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

/** Codec + dimensions + framerate of the first video stream. */
export async function probeMeta(file: string): Promise<VideoMeta> {
  try {
    const { stdout } = await run(FFPROBE, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height,avg_frame_rate",
      "-of", "json",
      file,
    ]);
    const s = (JSON.parse(stdout)?.streams?.[0] ?? {}) as Record<string, unknown>;
    return {
      codec: typeof s.codec_name === "string" ? s.codec_name : null,
      width: typeof s.width === "number" ? s.width : null,
      height: typeof s.height === "number" ? s.height : null,
      fps: parseFps(s.avg_frame_rate),
    };
  } catch {
    return { ...UNKNOWN_META };
  }
}

// Probing reads the file header; cache by path+mtime so repeated listings are cheap.
const metaCache = new Map<string, VideoMeta>();

export async function getMetaCached(file: string): Promise<VideoMeta> {
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return { ...UNKNOWN_META };
  }
  const key = `${file}:${mtime}`;
  const hit = metaCache.get(key);
  if (hit !== undefined) return hit;
  const meta = await probeMeta(file);
  metaCache.set(key, meta);
  return meta;
}
