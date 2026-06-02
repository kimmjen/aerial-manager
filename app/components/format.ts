export function formatSize(bytes: number | null): string {
  if (bytes === null) return "-";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function streamUrl(dir: string, name: string): string {
  return `/api/library/stream?dir=${dir}&name=${encodeURIComponent(name)}`;
}
