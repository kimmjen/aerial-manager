"use client";

import { useRef } from "react";

/** Muted video that plays while hovered and resets on leave. */
export default function HoverVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      className={className}
      onLoadedMetadata={() => {
        const v = ref.current;
        // most sources fade in from black — show a brighter early frame instead of frame 0
        if (v && v.currentTime === 0 && v.duration > 0) v.currentTime = Math.min(1, v.duration * 0.1);
      }}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => ref.current?.pause()}
    />
  );
}
