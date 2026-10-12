// Client for the Tauri commands in src-tauri/src/main.rs.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import type { LibraryVideo, ReapplyResult, SlotInfo } from "./types";

// Absolute folders for preview URLs; loaded with the first slots/library fetch.
let locations: { libraryDirs: Record<string, string>; aerialsDir: string } | null = null;

async function withLocations<T>(cmd: string): Promise<T> {
  locations ??= await invoke("get_locations");
  return invoke<T>(cmd);
}

/** Desktop settings as returned by get_settings. */
export interface AppConfig {
  libraryDirs: string[];
  backupDir?: string | null;
  ffmpegPath?: string | null;
  restartOnLock?: boolean | null;
}
export interface SettingsView {
  config: AppConfig;
  configured: boolean;
  libraryDirs: string[];
  backupDir: string;
  restartOnLock: boolean;
  legacyHelperInstalled: boolean;
}

/** Viewer-locale order (the server-side sort is only a fallback). */
const byName = new Intl.Collator(undefined, { sensitivity: "base" });

export const api = {
  slots: () => withLocations<SlotInfo[]>("get_slots"),

  library: async () => {
    const list = await withLocations<LibraryVideo[]>("list_library");
    return list.sort((a, b) => byName.compare(a.name, b.name));
  },

  apply: (uuid: string, dir: string, name: string) => invoke<void>("apply_to_slot", { uuid, dir, name }),

  reapplyAll: () => invoke<ReapplyResult[]>("reapply_all"),

  restore: (uuid: string) => invoke<void>("restore_slot", { uuid }),

  select: (uuid: string) => invoke<void>("set_selected_slot", { uuid }),

  rename: (dir: string, name: string, newName: string) => invoke<void>("rename_library_file", { dir, name, newName }),

  remove: (dir: string, name: string) => invoke<void>("delete_library_file", { dir, name }),

  /** Copy files into the first library folder; `allowExisting` reuses a same-named file. */
  importPaths: (files: string[], allowExisting: boolean) =>
    invoke<{ dir: string; saved: string[] }>("import_files", { files, allowExisting }),

  /** Native file picker for videos; null when cancelled. */
  pickVideoPaths: async (multiple: boolean): Promise<string[] | null> => {
    const picked = await open({ multiple, filters: [{ name: "Videos", extensions: ["mp4", "mov", "m4v"] }] });
    if (picked === null) return null;
    return Array.isArray(picked) ? picked : [picked];
  },

  settings: () => invoke<SettingsView>("get_settings"),

  saveSettings: async (config: AppConfig) => {
    await invoke("save_settings", { config });
    locations = null; // folders may have changed
  },

  /** Login item (launches hidden in the menu bar). */
  launchAtLogin: () => isEnabled(),
  setLaunchAtLogin: (on: boolean) => (on ? enable() : disable()),

  removeLegacyHelper: () => invoke<void>("remove_legacy_helper"),

  /** Merge the web app's data/slots.json; returns how many slot records were added. */
  importLegacySlots: (file: string) => invoke<number>("import_legacy_slots", { file }),

  pickFolder: async (): Promise<string | null> => {
    const picked = await open({ directory: true });
    return typeof picked === "string" ? picked : null;
  },

  pickSlotsJson: async (): Promise<string | null> => {
    const picked = await open({ filters: [{ name: "slots.json", extensions: ["json"] }] });
    return typeof picked === "string" ? picked : null;
  },

  /** The window swallows file drops, so drag state and dropped paths come from Tauri. */
  onFileDrop: (onHover: (over: boolean) => void, onDrop: (paths: string[]) => void) =>
    getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "drop") {
        onHover(false);
        onDrop(payload.paths);
      } else {
        onHover(payload.type !== "leave");
      }
    }),

  libraryVideoUrl: (dir: string, name: string, version?: number) => {
    const v = version ? `v=${Math.round(version)}` : "";
    if (!locations) return "";
    return `${convertFileSrc(`${locations.libraryDirs[dir]}/${name}`)}?${v}`;
  },

  slotVideoUrl: (uuid: string, size: number | null) => {
    if (!locations) return "";
    return `${convertFileSrc(`${locations.aerialsDir}/${uuid}.mov`)}?v=${size}`;
  },
};
