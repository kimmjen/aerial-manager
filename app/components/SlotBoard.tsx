"use client";

import { useRef, useState } from "react";
import type { SlotInfo } from "@/lib/slots";
import { api, isTauri } from "../api";
import HoverVideo from "./HoverVideo";
import { formatSize } from "./format";

interface Props {
  slots: SlotInfo[];
  busy: boolean;
  onAction: (run: () => Promise<unknown>) => void;
  onReplaceSlot: (uuid: string, file: File | string) => void;
}

export default function SlotBoard({ slots, busy, onAction, onReplaceSlot }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  function pickFileFor(uuid: string) {
    if (isTauri) {
      api.pickVideoPaths(false).then((p) => p && onReplaceSlot(uuid, p[0]));
      return;
    }
    setPickingFor(uuid);
    fileInput.current?.click();
  }

  function restore(uuid: string) {
    if (!confirm("Restore this slot to the original Apple aerial?")) return;
    onAction(() => api.restore(uuid));
  }

  function select(uuid: string) {
    onAction(() => api.select(uuid));
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h2 className="section-title">Other slots</h2>
        <span className="text-xs text-[var(--text-faint)]">{slots.length}</span>
      </div>
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
          <li key={s.uuid} className="glass lift rounded-[20px] p-2.5">
            <HoverVideo
              // size + appliedAt as cache buster so the preview reloads after apply/restore
              key={`${s.size}-${s.source?.appliedAt ?? "original"}`}
              src={api.slotVideoUrl(s.uuid, s.size)}
              className="mb-2.5 aspect-video w-full rounded-[14px] bg-black object-cover"
            />
            <div className="mb-1 flex items-center gap-2 px-0.5">
              <code className="font-mono text-[11px] text-[var(--text-faint)]">{s.uuid.slice(0, 8)}</code>
              <span className="ml-auto font-mono text-[11px] text-[var(--text-faint)]">
                {formatSize(s.size)}
              </span>
            </div>
            <p className="mb-2.5 truncate px-0.5 text-sm text-[var(--text)]" title={s.source?.name}>
              {s.source ? s.source.name : <span className="text-[var(--text-dim)]">Original Apple aerial</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => select(s.uuid)}
                disabled={busy}
                title="Show this slot on the lock screen"
                className="btn btn-glass px-3 py-1.5 text-xs"
              >
                Set live
              </button>
              <button
                onClick={() => pickFileFor(s.uuid)}
                disabled={busy}
                title="Pick a video file and put it in this slot"
                className="btn btn-ghost px-3 py-1.5 text-xs"
              >
                Replace…
              </button>
              <button
                onClick={() => restore(s.uuid)}
                disabled={busy || !s.hasBackup || !s.source}
                title="Restore the original Apple aerial"
                className="btn btn-ghost btn-danger ml-auto px-3 py-1.5 text-xs"
              >
                Restore
              </button>
            </div>
          </li>
        ))}
      </ul>
      {slots.length === 0 && (
        <p className="glass rounded-[20px] p-5 text-sm text-[var(--text-dim)]">No other slots.</p>
      )}
    </section>
  );
}
