"use client";

import type { SlotInfo } from "@/lib/slots";
import HoverVideo from "./HoverVideo";
import { formatSize } from "./format";

interface Props {
  slot: SlotInfo | null;
  busy: boolean;
  onAction: (run: () => Promise<Response>) => void;
}

/** Large preview of the slot currently shown on the lock screen. */
export default function LiveHero({ slot, busy, onAction }: Props) {
  if (!slot) {
    return (
      <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-500">
        No aerial slots found. Download an aerial wallpaper in System Settings → Wallpaper first.
      </section>
    );
  }

  function restore() {
    if (!slot || !confirm("Restore this slot to the original Apple aerial?")) return;
    onAction(() =>
      fetch("/api/slots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: slot.uuid }),
      }),
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-col gap-5 sm:flex-row">
        <HoverVideo
          key={`${slot.size}-${slot.source?.appliedAt ?? "original"}`}
          src={`/api/slots/stream?uuid=${slot.uuid}&v=${slot.size}`}
          className="aspect-video w-full rounded-md bg-black object-cover sm:max-w-lg"
        />
        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Live on lock screen</span>
          </span>
          <p className="truncate text-lg font-medium text-zinc-100" title={slot.source?.name}>
            {slot.source ? slot.source.name : "Original Apple aerial"}
          </p>
          <p className="font-mono text-xs text-zinc-500">
            slot {slot.uuid.slice(0, 8)} · {formatSize(slot.size)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={restore}
              disabled={busy || !slot.hasBackup || !slot.source}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-red-900 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Restore Original
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
