"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryDirKey } from "@/lib/config";
import type { LibraryVideo } from "@/lib/library";
import type { SlotInfo } from "@/lib/slots";
import { api } from "./api";
import LibraryPanel from "./components/LibraryPanel";
import LiveHero from "./components/LiveHero";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaceState, setReplaceState] = useState<ReplaceState>("idle");
  const replaceInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [lib, sl] = await Promise.all([api.library(), api.slots()]);
      setVideos(lib);
      setSlots(sl);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    // initial fetch-on-mount; setState only fires after the awaited fetches resolve
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // while any upload is being reformatted, poll until conversions finish
  const anyConverting = videos.some((v) => v.status === "converting");
  useEffect(() => {
    if (!anyConverting) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [anyConverting, refresh]);

  async function runAction(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Upload a file into the default library dir — 409 (already exists) is non-fatal. */
  async function uploadVideo(file: File): Promise<{ dir: LibraryDirKey; name: string }> {
    const form = new FormData();
    form.append("files", file);
    const res = await api.upload(form);
    const body = await res.json();
    if (!res.ok && res.status !== 409) throw new Error(body.error);
    return {
      dir: body.dir,
      name: Array.isArray(body.saved) && body.saved[0] ? body.saved[0] : file.name,
    };
  }

  const applySlot = api.apply;

  /** Apply a library video to a chosen slot. */
  async function applyVideoToSlot(v: LibraryVideo, uuid: string) {
    setBusy(true);
    setError(null);
    try {
      await applySlot(uuid, v.dir, v.name);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Upload a file and apply it to a specific slot. */
  async function replaceSlotWithFile(uuid: string, file: File) {
    setBusy(true);
    setError(null);
    try {
      const { dir, name } = await uploadVideo(file);
      await applySlot(uuid, dir, name);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Header one-click: upload a new file and apply it to the live slot. */
  async function replace(file: File) {
    setBusy(true);
    setError(null);
    try {
      setReplaceState("uploading");
      const { dir, name } = await uploadVideo(file);

      setReplaceState("applying");
      const live = slots.find((s) => s.isSelected) ?? slots[0];
      if (!live) throw new Error("No aerial slot found. Download an aerial wallpaper in System Settings first.");
      await applySlot(live.uuid, dir, name);

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

  /** Re-apply every custom slot through the current normalization (fixes stale/incompatible slots). */
  async function reapplyAllSlots() {
    if (
      !confirm(
        "Re-apply all custom slots with the latest compatibility fixes? Large videos are re-encoded, so this can take a few minutes.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const results = await api.reapplyAll();
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      setNotice(`Re-applied ${ok} slot${ok === 1 ? "" : "s"}${failed.length ? ` · ${failed.length} failed` : ""}.`);
      if (failed.length) setError(failed.map((f) => `${f.name}: ${f.error}`).join("; "));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const replaceBusy = busy || replaceState !== "idle";
  const liveSlot = slots.find((s) => s.isSelected) ?? null;
  const otherSlots = slots.filter((s) => !s.isSelected);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-5 sm:px-8">
      <header className="reveal glass-raised sticky top-4 z-40 mb-8 flex items-center gap-3 rounded-full px-3.5 py-2.5 sm:px-5">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-[10px] shadow-md"
          style={{ background: "linear-gradient(140deg, var(--accent-hi), #14b8c6)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19l5.5-8 4 5 3-4 5.5 7z" />
            <circle cx="7.5" cy="6.5" r="2" />
          </svg>
        </span>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text)]">Aerial Manager</h1>
          <p className="hidden text-[11px] text-[var(--text-faint)] sm:block">macOS lock screen videos</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={reapplyAllSlots}
            disabled={busy || !slots.some((s) => s.source)}
            title="Re-encode and re-apply every custom slot with the latest compatibility fixes"
            className="btn btn-ghost px-3.5 py-2 text-xs"
          >
            Re-apply all
          </button>
          <button onClick={refresh} disabled={busy} className="btn btn-ghost px-3.5 py-2 text-xs">
            Refresh
          </button>
          <button
            onClick={() => replaceInput.current?.click()}
            disabled={replaceBusy || slots.length === 0}
            className="btn btn-primary px-4 py-2 text-sm"
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
        <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--danger)" }} />
          <span className="min-w-0 text-[var(--text)]">{error}</span>
          <button onClick={() => setError(null)} className="btn btn-ghost ml-auto shrink-0 px-3 py-1 text-xs">
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--live)" }} />
          <span className="min-w-0 text-[var(--text)]">{notice}</span>
          <button onClick={() => setNotice(null)} className="btn btn-ghost ml-auto shrink-0 px-3 py-1 text-xs">
            Dismiss
          </button>
        </div>
      )}
      {busy && (
        <div className="glass mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm text-[var(--text-dim)]">
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
          Applying… (remuxing video + restarting WallpaperAgent)
        </div>
      )}

      <div className="reveal" style={{ animationDelay: "0.06s" }}>
        <LiveHero slot={liveSlot} busy={busy} onAction={runAction} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="reveal order-2 lg:order-1" style={{ animationDelay: "0.14s" }}>
          <SlotBoard slots={otherSlots} busy={busy} onAction={runAction} onReplaceSlot={replaceSlotWithFile} />
        </div>
        <div className="reveal order-1 lg:order-2" style={{ animationDelay: "0.1s" }}>
          <LibraryPanel
            videos={videos}
            slots={slots}
            busy={busy}
            onChanged={refresh}
            onError={setError}
            onApplyToSlot={applyVideoToSlot}
          />
        </div>
      </div>
    </main>
  );
}
