import fs from "fs";
import { LIBRARY_DIRS, LibraryDirKey } from "./config";
import { isSafeVideoName, resolveLibraryFile } from "./paths";

export interface LibraryVideo {
  dir: LibraryDirKey;
  name: string;
  size: number;
  mtime: number;
}

export function listLibrary(): LibraryVideo[] {
  const out: LibraryVideo[] = [];
  for (const dir of Object.keys(LIBRARY_DIRS) as LibraryDirKey[]) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(LIBRARY_DIRS[dir]);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isSafeVideoName(name)) continue;
      const st = fs.statSync(resolveLibraryFile(dir, name));
      if (!st.isFile()) continue;
      out.push({ dir, name, size: st.size, mtime: st.mtimeMs });
    }
  }
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
