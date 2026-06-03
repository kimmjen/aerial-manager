"use client";

import { useRef, useState } from "react";
import type { SlotInfo } from "@/lib/slots";
import HoverVideo from "./HoverVideo";
import { formatSize } from "./format";

interface Props {
  slots: SlotInfo[];
  busy: boolean;
  onAction: (run: () => Promise<Response>) => void;
  onReplaceSlot: (uuid: string, file: File) => void;
}

export default function SlotBoard({ slots, busy, onAction, onReplaceSlot }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  function pickFileFor(uuid: string) {
    setPickingFor(uuid);
    fileInput.current?.click();
  }

  function restore(uuid: string) {
    if (!confirm("Restore this slot to the original Apple aerial?")) return;
    onAction(() =>
      fetch("/api/slots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid }),
      }),
    );
  }

  function select(uuid: string) {
    onAction(() =>
      fetch("/api/slots/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid }),
      }),
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-zinc-400">Other Slots</h2>
      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && pickingFor) onReplaceSlot(pickingFor, f);
          e.target.value = "";
          setPickingFor(null);
        }}
      />
      <ul className="flex flex-col gap-3">
        {slots.map((s) => (
          <li
            key={s.uuid}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 transition-colors hover:border-zinc-700"
          >
            <div className="mb-1 flex items-center gap-2">
              <code className="font-mono text-xs text-zinc-500">{s.uuid.slice(0, 8)}</code>
              <span className="ml-auto text-xs text-zinc-500">{formatSize(s.size)}</span>
            </div>
            <p className="mb-2 truncate text-sm" title={s.source?.name}>
              {s.source ? s.source.name : <span className="text-zinc-500">Original Apple aerial</span>}
            </p>
            <HoverVideo
              // size + appliedAt as cache buster so the preview reloads after apply/restore
              key={`${s.size}-${s.source?.appliedAt ?? "original"}`}
              src={`/api/slots/stream?uuid=${s.uuid}&v=${s.size}`}
              className="mb-2 aspect-video w-full rounded-md bg-black object-cover"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => pickFileFor(s.uuid)}
                disabled={busy}
                title="Pick a video file and put it in this slot"
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Replace…
              </button>
              <button
                onClick={() => restore(s.uuid)}
                disabled={busy || !s.hasBackup || !s.source}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-red-900 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Restore
              </button>
              <button
                onClick={() => select(s.uuid)}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Set as Lock Screen
              </button>
            </div>
          </li>
        ))}
      </ul>
      {slots.length === 0 && <p className="text-sm text-zinc-500">No other slots.</p>}
    </section>
  );
}
