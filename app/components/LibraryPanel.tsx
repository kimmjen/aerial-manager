"use client";

import { useRef, useState } from "react";
import type { LibraryVideo } from "@/lib/library";
import type { LibraryDirKey } from "@/lib/config";
import type { SlotInfo } from "@/lib/slots";
import HoverVideo from "./HoverVideo";
import { formatSize, formatVideoSpec, streamUrl } from "./format";

interface Props {
  videos: LibraryVideo[];
  slots: SlotInfo[];
  busy: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  onApplyToSlot: (v: LibraryVideo, uuid: string) => void;
}

/** Color + label for a non-ready library item. */
function statusBadge(v: LibraryVideo) {
  if (v.status === "converting") return { label: "converting…", color: "var(--accent)", pulse: true };
  if (v.status === "error") return { label: "convert failed", color: "var(--danger)", pulse: false };
  return { label: v.codec ?? "unknown", color: "var(--warn)", pulse: false };
}

export default function LibraryPanel({ videos, slots, busy, onChanged, onError, onApplyToSlot }: Props) {
  const [dirFilter, setDirFilter] = useState<LibraryDirKey | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
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
    <section
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        upload(e.dataTransfer.files);
      }}
      className="glass relative overflow-hidden rounded-[24px] p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="section-title">Library</h2>
        <span className="text-xs text-[var(--text-faint)]">{shown.length}</span>
        <div className="ml-auto flex items-center gap-2">
          {dirs.length > 0 && (
            <div className="segmented">
              {(["all", ...dirs] as const).map((d) => (
                <button key={d} data-active={dirFilter === d} onClick={() => setDirFilter(d)}>
                  {d === "all" ? "All" : d}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="btn btn-glass px-4 py-2 text-xs"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shown.map((v) => {
          const id = `${v.dir}/${v.name}`;
          const menuOpen = menuFor === id;
          return (
            <li key={id} className="glass lift group rounded-[18px] p-2.5">
              <div className="relative mb-2.5">
                <HoverVideo
                  key={v.mtime}
                  src={streamUrl(v.dir, v.name, v.mtime)}
                  className="aspect-video w-full rounded-[12px] bg-black object-cover"
                />
                {v.status !== "ready" &&
                  (() => {
                    const b = statusBadge(v);
                    return (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-black/55 px-2 py-0.5 text-[10px] font-medium text-[var(--text)] backdrop-blur-md">
                        <span
                          className={b.pulse ? "live-dot" : "inline-block h-1.5 w-1.5 rounded-full"}
                          style={{ background: b.color }}
                        />
                        {b.label}
                      </span>
                    );
                  })()}
              </div>
              <p className="truncate px-0.5 text-sm text-[var(--text)]" title={v.name}>
                {v.name}
              </p>
              <p className="mb-2.5 px-0.5 font-mono text-[11px] text-[var(--text-faint)]">
                {[`${v.dir}/`, formatVideoSpec(v.width, v.height, v.fps), formatSize(v.size)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <button
                    onClick={() => setMenuFor(menuOpen ? null : id)}
                    disabled={busy || slots.length === 0}
                    className="btn btn-primary px-3 py-1.5 text-xs"
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
                      <div className="glass-raised absolute z-20 mt-1.5 max-h-56 w-64 overflow-auto rounded-[14px] p-1.5">
                        {orderedSlots.map((s) => (
                          <button
                            key={s.uuid}
                            onClick={() => {
                              setMenuFor(null);
                              onApplyToSlot(v, s.uuid);
                            }}
                            className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--glass-hover)] hover:text-[var(--text)]"
                          >
                            {s.isSelected ? (
                              <>
                                <span className="live-dot" />
                                <span className="text-[var(--live)]">Lock screen</span>
                              </>
                            ) : (
                              <span className="font-mono text-[var(--text-faint)]">{s.uuid.slice(0, 8)}</span>
                            )}
                            <span className="ml-auto truncate pl-2 text-[var(--text-faint)]">
                              {s.source ? s.source.name : "original"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => rename(v)} className="btn btn-ghost px-3 py-1.5 text-xs">
                  Rename
                </button>
                <button
                  onClick={() => remove(v)}
                  className="btn btn-ghost btn-danger ml-auto px-3 py-1.5 text-xs"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="px-1 py-8 text-center text-sm text-[var(--text-dim)]">No videos.</p>}

      {/* drag-and-drop overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[24px] border-2 border-dashed border-[var(--accent-hi)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] backdrop-blur-md">
          <span className="rounded-full bg-black/50 px-5 py-2.5 text-sm font-medium text-[var(--text)]">
            Drop video files to upload
          </span>
        </div>
      )}
    </section>
  );
}
