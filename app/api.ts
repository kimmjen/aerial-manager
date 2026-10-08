// One client for both runtimes: Tauri commands inside the desktop app, the Next API
// routes in the browser. The Next half goes away with the web app (migration step 6).
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import type { LibraryVideo } from "@/lib/library";
import type { ReapplyResult, SlotInfo } from "@/lib/slots";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function http<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

// Absolute folders for preview URLs in Tauri; loaded with the first slots/library fetch.
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
  slots: () => (isTauri ? withLocations<SlotInfo[]>("get_slots") : http<SlotInfo[]>("/api/slots")),

  library: async () => {
    const list = isTauri ? await withLocations<LibraryVideo[]>("list_library") : await http<LibraryVideo[]>("/api/library");
    return list.sort((a, b) => byName.compare(a.name, b.name));
  },

  apply: (uuid: string, dir: string, name: string) =>
    isTauri ? invoke<void>("apply_to_slot", { uuid, dir, name }) : http<void>("/api/slots/apply", "POST", { uuid, dir, name }),

  reapplyAll: () =>
    isTauri
      ? invoke<ReapplyResult[]>("reapply_all")
      : http<{ results: ReapplyResult[] }>("/api/slots/reapply", "POST").then((b) => b.results),

  restore: (uuid: string) =>
    isTauri ? invoke<void>("restore_slot", { uuid }) : http<void>("/api/slots/restore", "POST", { uuid }),

  select: (uuid: string) =>
    isTauri ? invoke<void>("set_selected_slot", { uuid }) : http<void>("/api/slots/select", "POST", { uuid }),

  rename: (dir: string, name: string, newName: string) =>
    isTauri
      ? invoke<void>("rename_library_file", { dir, name, newName })
      : http<void>("/api/library/file", "PATCH", { dir, name, newName }),

  remove: (dir: string, name: string) =>
    isTauri ? invoke<void>("delete_library_file", { dir, name }) : http<void>("/api/library/file", "DELETE", { dir, name }),

  /** Web: raw upload response (callers decide whether 409 "already exists" is fatal). */
  upload: (form: FormData): Promise<Response> => fetch("/api/library/upload", { method: "POST", body: form }),

  /** Desktop: copy files into the first library folder; `allowExisting` reuses a same-named file. */
  importPaths: (files: string[], allowExisting: boolean) =>
    invoke<{ dir: string; saved: string[] }>("import_files", { files, allowExisting }),

  /** Desktop: native file picker for videos; null when cancelled. */
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

  /** Desktop: login item (launches hidden in the menu bar). */
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

  /** Desktop: the window swallows file drops, so drag state and dropped paths come from Tauri. */
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
    if (isTauri && locations) return `${convertFileSrc(`${locations.libraryDirs[dir]}/${name}`)}?${v}`;
    return `/api/library/stream?dir=${dir}&name=${encodeURIComponent(name)}&${v}`;
  },

  slotVideoUrl: (uuid: string, size: number | null) => {
    if (isTauri && locations) return `${convertFileSrc(`${locations.aerialsDir}/${uuid}.mov`)}?v=${size}`;
    return `/api/slots/stream?uuid=${uuid}&v=${size}`;
  },
};
