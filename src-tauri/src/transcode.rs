//! ffmpeg argument builders, ported 1:1 from lib/transcode.ts.
use crate::codec::VideoMeta;

// macOS Tahoe aerials are HEVC; the lock-screen renderer only plays HEVC reliably,
// so slots are always written as HEVC.
const MAX_FPS: f64 = 30.0;
const MAX_PIXELS: u64 = 1920 * 1080;

// Below this width:height ratio a source pillarboxes badly on a landscape lock
// screen, so it is blur-padded to 16:9 instead.
const FILL_ASPECT_MAX: f64 = 1.6;

// Fit within 1080p, keep aspect, never upscale, keep even dimensions.
const DOWNSCALE_VF: &str =
    "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";

// Blurred zoomed-to-cover background with the full source composited on top.
const FILL_FC: &str = concat!(
    "[0:v]split=2[bg][fg];",
    "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=20:2[bgb];",
    "[fg]scale=1920:1080:force_original_aspect_ratio=decrease[fgs];",
    "[bgb][fgs]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]",
);

/// Codecs that can live in a .mov container (library status / reformat).
pub fn is_mov_compatible(codec: Option<&str>) -> bool {
    codec.is_some_and(|c| matches!(c.to_lowercase().as_str(), "h264" | "hevc"))
}

fn needs_fill(meta: &VideoMeta) -> bool {
    match (meta.width, meta.height) {
        (Some(w), Some(h)) if h > 0 => (w as f64) / (h as f64) < FILL_ASPECT_MAX,
        _ => false,
    }
}

fn is_oversized(meta: &VideoMeta) -> bool {
    matches!((meta.width, meta.height), (Some(w), Some(h)) if (w as u64) * (h as u64) > MAX_PIXELS)
}

/// Landscape HEVC can be stream-copied; unknown dimensions don't block the fast path.
pub fn is_lock_screen_ready(meta: &VideoMeta) -> bool {
    meta.codec.as_deref().is_some_and(|c| c.eq_ignore_ascii_case("hevc")) && !needs_fill(meta)
}

fn video_filter_args(meta: Option<&VideoMeta>) -> Vec<String> {
    match meta {
        Some(m) if needs_fill(m) => vec!["-filter_complex".into(), FILL_FC.into(), "-map".into(), "[v]".into()],
        Some(m) if is_oversized(m) => vec!["-vf".into(), DOWNSCALE_VF.into()],
        _ => vec![],
    }
}

fn fps_cap_args(meta: Option<&VideoMeta>) -> Vec<String> {
    match meta.and_then(|m| m.fps) {
        Some(fps) if fps > MAX_FPS => vec!["-r".into(), "30".into()],
        _ => vec![],
    }
}

fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(|s| s.to_string()).collect()
}

/// H.264 re-encode for the in-place library reformat (browser-previewable).
#[allow(dead_code)] // used by background conversion jobs (migration step 4)
pub fn reencode_args(src: &str, out: &str, meta: Option<&VideoMeta>) -> Vec<String> {
    let mut a = strings(&["-y", "-loglevel", "error", "-i", src, "-an"]);
    a.extend(video_filter_args(meta));
    a.extend(strings(&["-c:v", "h264_videotoolbox", "-b:v", "20M", "-tag:v", "avc1"]));
    a.extend(fps_cap_args(meta));
    a.extend(strings(&["-movflags", "+faststart", out]));
    a
}

fn hevc_slot_args(src: &str, out: &str, meta: &VideoMeta) -> Vec<String> {
    let mut a = strings(&["-y", "-loglevel", "error", "-i", src, "-an"]);
    a.extend(video_filter_args(Some(meta)));
    a.extend(strings(&["-c:v", "hevc_videotoolbox", "-b:v", "12M", "-tag:v", "hvc1", "-pix_fmt", "yuv420p"]));
    a.extend(fps_cap_args(Some(meta)));
    a.extend(strings(&["-movflags", "+faststart", out]));
    a
}

/// Lock-screen-ready .mov: stream-copy landscape HEVC, otherwise re-encode to normalized HEVC.
pub fn ffmpeg_args(meta: &VideoMeta, src: &str, out: &str) -> Vec<String> {
    if is_lock_screen_ready(meta) {
        return strings(&["-y", "-loglevel", "error", "-i", src, "-c", "copy", "-movflags", "+faststart", out]);
    }
    hevc_slot_args(src, out, meta)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(codec: Option<&str>, w: Option<u32>, h: Option<u32>, fps: Option<f64>) -> VideoMeta {
        VideoMeta { codec: codec.map(String::from), width: w, height: h, fps }
    }

    fn has(args: &[String], s: &str) -> bool {
        args.iter().any(|a| a == s)
    }

    fn arg_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        let i = args.iter().position(|a| a == flag)?;
        args.get(i + 1).map(String::as_str)
    }

    #[test]
    fn mov_compatible_codecs() {
        assert!(is_mov_compatible(Some("h264")));
        assert!(is_mov_compatible(Some("hevc")));
        assert!(is_mov_compatible(Some("HEVC")));
        assert!(!is_mov_compatible(Some("av1")));
        assert!(!is_mov_compatible(Some("vp9")));
        assert!(!is_mov_compatible(None));
    }

    #[test]
    fn lock_screen_ready_only_landscape_hevc() {
        assert!(is_lock_screen_ready(&meta(Some("hevc"), Some(1920), Some(1080), Some(30.0))));
        assert!(is_lock_screen_ready(&meta(Some("hevc"), Some(3840), Some(2160), Some(60.0))));
        assert!(is_lock_screen_ready(&meta(Some("hevc"), None, None, None)));
        assert!(!is_lock_screen_ready(&meta(Some("h264"), Some(1920), Some(1080), Some(30.0))));
        assert!(!is_lock_screen_ready(&meta(Some("av1"), Some(1920), Some(1080), Some(30.0))));
        assert!(!is_lock_screen_ready(&meta(None, Some(1920), Some(1080), Some(30.0))));
        assert!(!is_lock_screen_ready(&meta(Some("hevc"), Some(720), Some(1280), Some(30.0))));
        assert!(!is_lock_screen_ready(&meta(Some("hevc"), Some(720), Some(720), Some(30.0))));
    }

    #[test]
    fn stream_copies_ready_hevc() {
        let a = ffmpeg_args(&meta(Some("hevc"), Some(1920), Some(1080), Some(30.0)), "in.mov", "out.mov");
        assert!(has(&a, "copy"));
        assert!(!has(&a, "hevc_videotoolbox"));
        assert_eq!(a.last().unwrap(), "out.mov");
    }

    #[test]
    fn reencodes_h264_to_hevc() {
        let a = ffmpeg_args(&meta(Some("h264"), Some(1920), Some(1080), Some(30.0)), "in.mp4", "out.mov");
        assert!(has(&a, "hevc_videotoolbox"));
        assert!(has(&a, "hvc1"));
        assert!(!has(&a, "copy"));
        assert!(!has(&a, "h264_videotoolbox"));
        assert_eq!(a.last().unwrap(), "out.mov");
    }

    #[test]
    fn downscales_and_caps_4k60() {
        let a = ffmpeg_args(&meta(Some("h264"), Some(3840), Some(2160), Some(60.0)), "in.mp4", "out.mov");
        assert!(has(&a, "hevc_videotoolbox"));
        assert_eq!(arg_after(&a, "-r"), Some("30"));
        assert!(arg_after(&a, "-vf").unwrap().contains("scale"));
    }

    #[test]
    fn blur_pads_vertical() {
        let a = ffmpeg_args(&meta(Some("h264"), Some(720), Some(1280), Some(30.0)), "in.mp4", "out.mov");
        assert!(has(&a, "hevc_videotoolbox"));
        let fc = arg_after(&a, "-filter_complex").unwrap();
        assert!(fc.contains("overlay") && fc.contains("boxblur"));
        assert_eq!(arg_after(&a, "-map"), Some("[v]"));
    }

    #[test]
    fn plain_h264_reencode_without_meta() {
        let a = reencode_args("in.mp4", "out.mov", None);
        assert!(has(&a, "h264_videotoolbox") && has(&a, "-an") && has(&a, "avc1"));
        assert!(!has(&a, "-vf") && !has(&a, "-r"));
        assert_eq!(a.last().unwrap(), "out.mov");
    }

    #[test]
    fn reencode_downscales_and_caps() {
        let a = reencode_args("in.mp4", "out.mov", Some(&meta(Some("hevc"), Some(3840), Some(2160), Some(60.0))));
        assert!(arg_after(&a, "-vf").unwrap().contains("scale"));
        assert_eq!(arg_after(&a, "-r"), Some("30"));
    }

    #[test]
    fn args_match_the_next_app_exactly() {
        // byte-for-byte parity with lib/transcode.ts for a vertical H.264 source
        let a = ffmpeg_args(&meta(Some("h264"), Some(720), Some(1280), Some(30.0)), "in.mp4", "out.mov");
        let expected = include_str!("../tests/fixtures/ffmpeg-args-vertical.json");
        let expected: Vec<String> = serde_json::from_str(expected).unwrap();
        assert_eq!(a, expected);
    }
}
