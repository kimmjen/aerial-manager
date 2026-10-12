#!/bin/sh
# Build a static, LGPL-only ffmpeg + ffprobe to bundle with the desktop app.
# H.264/HEVC encoding uses VideoToolbox; dav1d (BSD) is linked in for AV1 decoding.
# No GPL parts (x264/x265) and no Homebrew libraries (--disable-autodetect).
#
# Usage: sh scripts/build-ffmpeg.sh <arm64|x86_64|universal> <out-dir>
# Needs: Xcode command line tools, curl, meson, ninja, pkg-config; nasm for x86_64 asm.
set -eu

FFMPEG_VERSION=9.0.2
FFMPEG_SHA256=8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e
DAV1D_VERSION=1.5.4
DAV1D_SHA256=686616b7c69eb88d44459391ab25cac13b6647a3b288835c5784e71c1514a5c5
MIN_MACOS=11.0

ARCH="$1"
OUT="$(mkdir -p "$2" && cd "$2" && pwd)"
ROOT="${FFMPEG_BUILD_DIR:-$PWD/.ffmpeg-build}"

if [ "$ARCH" = universal ]; then
  sh "$0" arm64 "$ROOT/out-arm64"
  sh "$0" x86_64 "$ROOT/out-x86_64"
  for bin in ffmpeg ffprobe; do
    lipo -create "$ROOT/out-arm64/$bin" "$ROOT/out-x86_64/$bin" -output "$OUT/$bin"
  done
  cp "$ROOT/out-arm64/"*.txt "$OUT/"
  exit 0
fi

WORK="$ROOT/$ARCH"
PREFIX="$WORK/prefix"
mkdir -p "$WORK"

fetch() { # url sha256 → extracted into $WORK
  file="$ROOT/$(basename "$1")"
  [ -f "$file" ] || curl -fsSL "$1" -o "$file"
  echo "$2  $file" | shasum -a 256 -c - >/dev/null || { echo "checksum mismatch: $file" >&2; exit 1; }
  tar xf "$file" -C "$WORK"
}

CROSS=""
if [ "$ARCH" != "$(uname -m)" ]; then
  CPU_FAMILY=$([ "$ARCH" = arm64 ] && echo aarch64 || echo x86_64)
  cat > "$WORK/cross.ini" <<EOF
[binaries]
c = ['clang', '-arch', '$ARCH']
ar = 'ar'
strip = 'strip'
[built-in options]
c_args = ['-mmacosx-version-min=$MIN_MACOS']
c_link_args = ['-mmacosx-version-min=$MIN_MACOS']
[host_machine]
system = 'darwin'
cpu_family = '$CPU_FAMILY'
cpu = '$ARCH'
endian = 'little'
EOF
  CROSS="--cross-file $WORK/cross.ini"
fi

# dav1d's x86 assembly needs nasm; without it the C fallback still works (slower)
DAV1D_ASM=true
[ "$ARCH" = x86_64 ] && ! command -v nasm >/dev/null && DAV1D_ASM=false && echo "nasm not found: building dav1d without x86 asm" >&2

fetch "https://downloads.videolan.org/pub/videolan/dav1d/$DAV1D_VERSION/dav1d-$DAV1D_VERSION.tar.xz" "$DAV1D_SHA256"
# shellcheck disable=SC2086
CFLAGS="-mmacosx-version-min=$MIN_MACOS" meson setup --reconfigure "$WORK/dav1d-build" "$WORK/dav1d-$DAV1D_VERSION" $CROSS \
  --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static \
  -Denable_tools=false -Denable_tests=false -Denable_asm=$DAV1D_ASM
ninja -C "$WORK/dav1d-build" install

fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" "$FFMPEG_SHA256"
cd "$WORK/ffmpeg-$FFMPEG_VERSION"
CROSS_FLAGS=""
[ -n "$CROSS" ] && CROSS_FLAGS="--enable-cross-compile --target-os=darwin"
# shellcheck disable=SC2086
PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
  --prefix="$PREFIX" --arch="$ARCH" $CROSS_FLAGS \
  --cc="clang -arch $ARCH" \
  --extra-cflags="-mmacosx-version-min=$MIN_MACOS" --extra-ldflags="-mmacosx-version-min=$MIN_MACOS" \
  --enable-static --disable-shared --pkg-config-flags=--static \
  --disable-autodetect --enable-videotoolbox --enable-zlib --enable-libdav1d \
  --disable-ffplay --disable-doc --disable-network --disable-debug
make -j"$(sysctl -n hw.ncpu)"

cp ffmpeg ffprobe "$OUT/"
strip "$OUT/ffmpeg" "$OUT/ffprobe"
{
  echo "FFmpeg $FFMPEG_VERSION (LGPL v2.1 or later), https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
  echo "dav1d $DAV1D_VERSION (BSD 2-clause), https://downloads.videolan.org/pub/videolan/dav1d/$DAV1D_VERSION/"
  echo "Built by scripts/build-ffmpeg.sh with:"
  "$OUT/ffprobe" -hide_banner -buildconf 2>&1 | grep -- '--' || true
} > "$OUT/ffmpeg-build-info.txt"
cp COPYING.LGPLv2.1 "$OUT/ffmpeg-LICENSE.txt"
cp "$WORK/dav1d-$DAV1D_VERSION/COPYING" "$OUT/dav1d-LICENSE.txt"
echo "built $ARCH → $OUT"
