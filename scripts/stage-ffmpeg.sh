#!/bin/sh
# Put ffmpeg/ffprobe from scripts/build-ffmpeg.sh where tauri.release.conf.json
# expects them (sidecars are named <bin>-<target triple>), with their licenses.
# Usage: sh scripts/stage-ffmpeg.sh <build-ffmpeg out dir> <target triple>
#   e.g. sh scripts/stage-ffmpeg.sh .ffmpeg-out universal-apple-darwin
#   then: npm run tauri build -- --target <triple> --config src-tauri/tauri.release.conf.json
set -eu
SRC="$1"; TRIPLE="$2"
DEST="$(dirname "$0")/../src-tauri/binaries"
mkdir -p "$DEST"
for bin in ffmpeg ffprobe; do
  cp "$SRC/$bin" "$DEST/$bin-$TRIPLE"
done
cp "$SRC/ffmpeg-LICENSE.txt" "$SRC/dav1d-LICENSE.txt" "$SRC/ffmpeg-build-info.txt" "$DEST/"
echo "staged ffmpeg for $TRIPLE in $DEST"
