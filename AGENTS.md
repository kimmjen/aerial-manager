# Aerial Manager

macOS menu-bar app (Tauri 2): Rust backend in `src-tauri/src`, Vite + React frontend in `src/`. There is no web server; the UI calls Tauri commands through `src/api.ts`.

- `npm run dev` runs the app; `npm run lint` is eslint + tsc; `(cd src-tauri && cargo test)` runs the unit tests.
- Lock-screen slots must stay HEVC (`hvc1`); ffmpeg arguments live in `src-tauri/src/transcode.rs`.
- The bundled ffmpeg is LGPL: don't add filters or encoders that need `--enable-gpl` (e.g. `boxblur`, x264/x265).
- Releases: bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then push a `v*` tag (see `.github/workflows/release.yml`).
