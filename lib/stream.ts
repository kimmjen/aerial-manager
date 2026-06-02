import fs from "fs";

export type Range = { start: number; end: number } | "unsatisfiable" | null;

export function parseRange(header: string | null, size: number): Range {
  const match = header?.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  const start = Number(match[1]);
  if (start >= size) return "unsatisfiable";
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return { start, end };
}

/** Range-aware video file response for in-browser preview. */
export function streamVideoFile(file: string, rangeHeader: string | null): Response {
  if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
  const size = fs.statSync(file).size;

  // Served as mp4 regardless of container: our videos are H.264, which browsers decode.
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") return new Response(null, { status: 416 });
  if (range) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    headers["Content-Length"] = String(range.end - range.start + 1);
    const stream = fs.createReadStream(file, { start: range.start, end: range.end });
    return new Response(stream as unknown as ReadableStream, { status: 206, headers });
  }

  headers["Content-Length"] = String(size);
  return new Response(fs.createReadStream(file) as unknown as ReadableStream, { status: 200, headers });
}
