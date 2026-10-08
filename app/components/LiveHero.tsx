"use client";

import type { SlotInfo } from "@/lib/slots";
import { api } from "../api";
import HoverVideo from "./HoverVideo";
import { formatSize } from "./format";

interface Props {
  slot: SlotInfo | null;
  busy: boolean;
  onAction: (run: () => Promise<unknown>) => void;
}

/** Large featured preview of the slot currently shown on the lock screen. */
export default function LiveHero({ slot, busy, onAction }: Props) {
  if (!slot) {
    return (
      <section className="glass rounded-[28px] p-8 text-sm text-[var(--text-dim)]">
        No aerial slots found. Download an aerial wallpaper in{" "}
        <span className="text-[var(--text)]">System Settings → Wallpaper</span> first.
      </section>
    );
  }

  function restore() {
    if (!slot || !confirm("Restore this slot to the original Apple aerial?")) return;
    onAction(() => api.restore(slot.uuid));
  }

  return (
    <section className="glass-raised relative overflow-hidden rounded-[28px] p-2.5">
      {/* accent glow bleeding from behind the preview */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
      />
      <div className="relative grid gap-5 md:grid-cols-[1.45fr_1fr]">
        <HoverVideo
          key={`${slot.size}-${slot.source?.appliedAt ?? "original"}`}
          src={api.slotVideoUrl(slot.uuid, slot.size)}
          className="aspect-video w-full rounded-[20px] bg-black object-cover"
        />
        <div className="flex min-w-0 flex-col justify-center gap-3 px-3 pb-4 md:py-5 md:pr-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass)] px-2.5 py-1">
            <span className="live-dot" />
            <span className="text-xs font-medium text-[var(--live)]">Live on lock screen</span>
          </span>
          <h2
            className="truncate text-2xl font-semibold tracking-tight text-[var(--text)]"
            title={slot.source?.name}
          >
            {slot.source ? slot.source.name : "Original Apple aerial"}
          </h2>
          <p className="font-mono text-xs text-[var(--text-faint)]">
            slot {slot.uuid.slice(0, 8)} · {formatSize(slot.size)}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={restore}
              disabled={busy || !slot.hasBackup || !slot.source}
              className="btn btn-glass btn-danger px-4 py-2 text-xs"
            >
              Restore original
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
