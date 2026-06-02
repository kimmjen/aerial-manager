"use client";

import { useRef, useState } from "react";
import type { LibraryVideo } from "@/lib/library";
import type { LibraryDirKey } from "@/lib/config";
import HoverVideo from "./HoverVideo";
import { formatSize, streamUrl } from "./format";

interface Props {
  videos: LibraryVideo[];
  selected: LibraryVideo | null;
  busy: boolean;
  onSelect: (v: LibraryVideo | null) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
  onReplaceLockScreen: (v: LibraryVideo) => void;
}

export default function LibraryPanel({
  videos,
  selected,
  busy,
  onSelect,
  onChanged,
  onError,
  onReplaceLockScreen,
}: Props) {
  const [dirFilter, setDirFilter] = useState<LibraryDirKey | "all">("all");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirs = Array.from(new Set(videos.map((v) => v.dir)));
  const shown = videos.filter((v) => dirFilter === "all" || v.dir === dirFilter);

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
    if (selected?.name === v.name) onSelect(null);
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
    if (selected?.name === v.name) onSelect(null);
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
          const isSel = selected?.dir === v.dir && selected?.name === v.name;
          return (
            <li
              key={`${v.dir}/${v.name}`}
              className={`group rounded-lg border bg-zinc-900 p-3 transition-colors ${
                isSel ? "border-zinc-600" : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <HoverVideo
                src={streamUrl(v.dir, v.name)}
                className="mb-2 aspect-video w-full rounded-md bg-black object-cover"
              />
              <p className="truncate text-sm text-zinc-100" title={v.name}>
                {v.name}
              </p>
              <p className="mb-2 text-xs text-zinc-500">
                {v.dir}/ · {formatSize(v.size)}
              </p>
              <button
                onClick={() => onReplaceLockScreen(v)}
                disabled={busy}
                title="Replace the current lock screen video with this one"
                className="mb-2 w-full rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Replace Lock Screen
              </button>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => onSelect(isSel ? null : v)}
                  className={
                    isSel
                      ? "rounded-md border border-zinc-400 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      : "rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  }
                >
                  {isSel ? "Selected" : "Select"}
                </button>
                <button
                  onClick={() => rename(v)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  Rename
                </button>
                <button
                  onClick={() => remove(v)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-red-900 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
