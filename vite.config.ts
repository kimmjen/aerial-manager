import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Frontend for the Tauri app. Port is fixed because tauri.conf.json points at it.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname) } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
