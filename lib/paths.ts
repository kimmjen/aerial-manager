import path from "path";
import { LIBRARY_DIRS, LibraryDirKey, VIDEO_EXTENSIONS } from "./config";

/** A filename is safe when it is a bare video filename (no traversal, no hidden files). */
export function isSafeVideoName(name: string): boolean {
  if (!name || name.startsWith(".")) return false;
  if (name !== path.basename(name)) return false;
  return VIDEO_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

export function isLibraryDirKey(key: string): key is LibraryDirKey {
  return key in LIBRARY_DIRS;
}

/** Resolve a (dir, name) pair to an absolute path, throwing on unsafe input. */
export function resolveLibraryFile(dir: LibraryDirKey, name: string): string {
  if (!isLibraryDirKey(dir)) throw new Error(`unknown library dir: ${dir}`);
  if (!isSafeVideoName(name)) throw new Error(`unsafe filename: ${name}`);
  return path.join(LIBRARY_DIRS[dir], name);
}
