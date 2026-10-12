// Shapes returned by the Tauri commands (src-tauri/src/library.rs, slots.rs).

/** Key of a library folder (its position in the configured list). */
export type LibraryDirKey = string;

export type LibraryStatus = "ready" | "incompatible" | "converting" | "error";

export interface LibraryVideo {
  dir: LibraryDirKey;
  name: string;
  size: number;
  mtime: number;
  codec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  status: LibraryStatus;
}

export interface SlotSource {
  dir: LibraryDirKey;
  name: string;
  appliedAt: string;
}

export interface SlotInfo {
  uuid: string;
  size: number | null;
  source: SlotSource | null;
  hasBackup: boolean;
  isSelected: boolean;
}

export interface ReapplyResult {
  uuid: string;
  name: string;
  ok: boolean;
  error?: string;
}
