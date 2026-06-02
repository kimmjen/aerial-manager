"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryDirKey } from "@/lib/config";
import type { LibraryVideo } from "@/lib/library";
import type { SlotInfo } from "@/lib/slots";
import LibraryPanel from "./components/LibraryPanel";
import SlotBoard from "./components/SlotBoard";

type ReplaceState = "idle" | "uploading" | "applying" | "done";

const REPLACE_LABELS: Record<ReplaceState, string> = {
  idle: "Replace Lock Screen",
  uploading: "Uploading…",
  applying: "Applying…",
  done: "Done",
};

export default function Home() {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [selected, setSelected] = useState<LibraryVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceState, setReplaceState] = useState<ReplaceState>("idle");
  const replaceInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [lib, sl] = await Promise.all([
      fetch("/api/library").then((r) => r.json()),
      fetch("/api/slots").then((r) => r.json()),
    ]);
    if (Array.isArray(lib)) setVideos(lib);
    if (Array.isArray(sl)) setSlots(sl);
  }, []);

  useEffect(() => {
    // initial fetch-on-mount; setState only fires after the awaited fetches resolve
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function runAction(run: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await run();
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Apply a library video to the slot currently shown on the lock screen (fallback: slots[0]). */
  async function applyToLiveSlot(dir: LibraryDirKey, name: string) {
    const target = slots.find((s) => s.isSelected) ?? slots[0];
    if (!target) throw new Error("No aerial slot found. Download an aerial wallpaper in System Settings first.");
    const applyRes = await fetch("/api/slots/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid: target.uuid, dir, name }),
    });
    const applyBody = await applyRes.json();
    if (!applyRes.ok) throw new Error(applyBody.error);

    // if we fell back to slots[0] and it was not the selected slot, make it the lock screen
    if (!target.isSelected) {
      const selRes = await fetch("/api/slots/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: target.uuid }),
      });
      const selBody = await selRes.json();
      if (!selRes.ok) throw new Error(selBody.error);
    }
  }

  /** One-click replace with an existing library video. */
  async function replaceWithLibrary(v: LibraryVideo) {
    setBusy(true);
    setError(null);
    try {
      await applyToLiveSlot(v.dir, v.name);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** One-click replace with a newly uploaded file. */
  async function replace(file: File) {
    setBusy(true);
    setError(null);
    try {
      // 1. upload into the default library dir — 409 (already exists) is non-fatal
      setReplaceState("uploading");
      const form = new FormData();
      form.append("files", file);
      const upRes = await fetch("/api/library/upload", { method: "POST", body: form });
      const upBody = await upRes.json();
      if (!upRes.ok && upRes.status !== 409) throw new Error(upBody.error);
      const dir: string = upBody.dir;
      const name =
        Array.isArray(upBody.saved) && upBody.saved[0] ? upBody.saved[0] : file.name;

      // 2. apply to the live slot
      setReplaceState("applying");
      await applyToLiveSlot(dir, name);

      // 3. done
      await refresh();
      setReplaceState("done");
      setTimeout(() => setReplaceState("idle"), 1500);
    } catch (e) {
      setError(String(e));
      setReplaceState("idle");
    } finally {
      setBusy(false);
      if (replaceInput.current) replaceInput.current.value = "";
    }
  }

  const replaceBusy = busy || replaceState !== "idle";

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold tracking-tight">Aerial Manager</h1>
        <p className="text-xs text-zinc-500">Manage your macOS lock screen videos</p>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={busy}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            Refresh
          </button>
          <button
            onClick={() => replaceInput.current?.click()}
            disabled={replaceBusy || slots.length === 0}
            className="rounded-md bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            {REPLACE_LABELS[replaceState]}
          </button>
          <input
            ref={replaceInput}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) replace(f);
            }}
          />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400/80 underline">
            Dismiss
          </button>
        </div>
      )}
      {busy && (
        <div className="mb-4 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
          Applying… (remuxing video + restarting WallpaperAgent)
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr]">
        <LibraryPanel
          videos={videos}
          selected={selected}
          busy={busy}
          onSelect={setSelected}
          onChanged={refresh}
          onError={setError}
          onReplaceLockScreen={replaceWithLibrary}
        />
        <SlotBoard slots={slots} selectedVideo={selected} busy={busy} onAction={runAction} />
      </div>
    </main>
  );
}
