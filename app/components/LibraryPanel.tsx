"use client";

import { useRef, useState } from "react";
import type { LibraryVideo } from "@/lib/library";
import type { LibraryDirKey } from "@/lib/config";
import type { SlotInfo } from "@/lib/slots";
import HoverVideo from "./HoverVideo";
import { formatSize, streamUrl } from "./format";

interface Props {
  videos: LibraryVideo[];
  slots: SlotInfo[];
  busy: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  onApplyToSlot: (v: LibraryVideo, uuid: string) => void;
}

export default function LibraryPanel({ videos, slots, busy, onChanged, onError, onApplyToSlot }: Props) {
  const [dirFilter, setDirFilter] = useState<LibraryDirKey | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirs = Array.from(new Set(videos.map((v) => v.dir)));
  const shown = videos.filter((v) => dirFilter === "all" || v.dir === dirFilter);
  // live slot first so it's the top choice in every menu
  const orderedSlots = [...slots].sort((a, b) => Number(b.isSelected) - Number(a.isSelected));

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/library/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onChanged();
    } catch (e) {
      onError(String(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function rename(v: LibraryVideo) {
    const newName = prompt("New name (with extension)", v.name);
    if (!newName || newName === v.name) return;
    const res = await fetch("/api/library/file", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: v.dir, name: v.name, newName }),
    });
    const body = await res.json();
    if (!res.ok) return onError(body.error);
    onChanged();
  }

  async function remove(v: LibraryVideo) {
    if (!confirm(`Delete "${v.name}"?`)) return;
    const res = await fetch("/api/library/file", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: v.dir, name: v.name }),
    });
    const body = await res.json();
    if (!res.ok) return onError(body.error);
    onChanged();
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium text-zinc-400">Video Library</h2>
        <div className="ml-auto flex gap-1">
          {["all", ...dirs].map((d) => (
            <button
              key={d}
              onClick={() => setDirFilter(d)}
              className={
                dirFilter === d
                  ? "rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  : "rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              }
            >
              {d === "all" ? "All" : d + "/"}
            </button>
          ))}
        </div>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input ref={fileInput} type="file" accept="video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((v) => {
          const id = `${v.dir}/${v.name}`;
          const menuOpen = menuFor === id;
          return (
            <li
              key={id}
              className="group rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700"
            >
              <div className="relative mb-2">
                <HoverVideo
                  key={v.mtime}
                  src={streamUrl(v.dir, v.name, v.mtime)}
                  className="aspect-video w-full rounded-md bg-black object-cover"
                />
                {/* minimal status badge — restyle freely; data is v.status / v.codec */}
                {v.status !== "ready" && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {v.status === "converting"
                      ? "converting…"
                      : v.status === "error"
                        ? "convert failed"
                        : (v.codec ?? "unknown")}
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-zinc-100" title={v.name}>
                {v.name}
              </p>
              <p className="mb-2 text-xs text-zinc-500">
                {v.dir}/ · {formatSize(v.size)}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <div className="relative">
                  <button
                    onClick={() => setMenuFor(menuOpen ? null : id)}
                    disabled={busy || slots.length === 0}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  >
                    Apply to ▾
                  </button>
                  {menuOpen && (
                    <>
                      <button
                        aria-label="Close menu"
                        onClick={() => setMenuFor(null)}
                        className="fixed inset-0 z-10 cursor-default"
                      />
                      <div className="absolute z-20 mt-1 max-h-56 w-64 overflow-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                        {orderedSlots.map((s) => (
                          <button
                            key={s.uuid}
                            onClick={() => {
                              setMenuFor(null);
                              onApplyToSlot(v, s.uuid);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
                          >
                            {s.isSelected ? (
                              <>
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                <span className="text-emerald-400">Lock screen</span>
                              </>
                            ) : (
                              <span className="font-mono text-zinc-500">{s.uuid.slice(0, 8)}</span>
                            )}
                            <span className="ml-auto truncate pl-2 text-zinc-500">
                              {s.source ? s.source.name : "original"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => rename(v)}
                  className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  Rename
                </button>
                <button
                  onClick={() => remove(v)}
                  className="ml-auto rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:border-red-900 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="text-sm text-zinc-500">No videos.</p>}
    </section>
  );
}
