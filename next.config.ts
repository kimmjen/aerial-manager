import type { NextConfig } from "next";

// Allow LAN hosts (e.g. a phone at 192.168.x.x) to load dev resources.
// Comma-separated in ALLOWED_DEV_ORIGINS; localhost always works without this.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
