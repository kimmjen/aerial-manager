import fs from "fs";
import { LIBRARY_DIRS, LibraryDirKey } from "./config";
import { getCodecCached } from "./codec";
import { getJob } from "./jobs";
import { isSafeVideoName, resolveLibraryFile } from "./paths";
import { deriveLibraryStatus, LibraryStatus } from "./status";

export interface LibraryVideo {
  dir: LibraryDirKey;
  name: string;
  size: number;
  mtime: number;
  codec: string | null;
  status: LibraryStatus;
}

export async function listLibrary(): Promise<LibraryVideo[]> {
  const found: { dir: LibraryDirKey; name: string; size: number; mtime: number; path: string }[] = [];
  for (const dir of Object.keys(LIBRARY_DIRS) as LibraryDirKey[]) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(LIBRARY_DIRS[dir]);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isSafeVideoName(name)) continue;
      const path = resolveLibraryFile(dir, name);
      const st = fs.statSync(path);
      if (!st.isFile()) continue;
      found.push({ dir, name, size: st.size, mtime: st.mtimeMs, path });
    }
  }

  const out = await Promise.all(
    found.map(async (f) => {
      const codec = await getCodecCached(f.path);
      return {
        dir: f.dir,
        name: f.name,
        size: f.size,
        mtime: f.mtime,
        codec,
        status: deriveLibraryStatus(codec, getJob(f.path)),
      };
    }),
  );
  return out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function renameLibraryFile(dir: LibraryDirKey, name: string, newName: string): void {
  const from = resolveLibraryFile(dir, name);
  const to = resolveLibraryFile(dir, newName);
  if (fs.existsSync(to)) throw new Error(`already exists: ${newName}`);
  fs.renameSync(from, to);
}

export function deleteLibraryFile(dir: LibraryDirKey, name: string): void {
  fs.unlinkSync(resolveLibraryFile(dir, name));
}
