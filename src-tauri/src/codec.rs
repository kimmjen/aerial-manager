use serde::Serialize;

/// Video stream properties relevant to lock-screen compatibility.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct VideoMeta {
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
}

/// ffprobe `num/den` frame rate → fps; None for missing or zero parts.
pub fn parse_fps(rate: &str) -> Option<f64> {
    let (n, d) = rate.split_once('/')?;
    let (n, d): (f64, f64) = (n.parse().ok()?, d.parse().ok()?);
    (n != 0.0 && d != 0.0).then(|| n / d)
}

/// Parse `ffprobe -show_entries stream=codec_name,width,height,avg_frame_rate -of json`.
/// Anything unreadable becomes unknown rather than an error (same as the Next app).
pub fn parse_ffprobe_json(json: &str) -> VideoMeta {
    let v: serde_json::Value = serde_json::from_str(json).unwrap_or_default();
    let s = &v["streams"][0];
    VideoMeta {
        codec: s["codec_name"].as_str().map(String::from),
        width: s["width"].as_u64().map(|w| w as u32),
        height: s["height"].as_u64().map(|h| h as u32),
        fps: s["avg_frame_rate"].as_str().and_then(parse_fps),
    }
}

/// Codec + dimensions + framerate of the first video stream (unknown on any failure).
pub fn probe_meta(ffprobe: &str, file: &std::path::Path) -> VideoMeta {
    std::process::Command::new(ffprobe)
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,avg_frame_rate", "-of", "json"])
        .arg(file)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| parse_ffprobe_json(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frame_rates() {
        assert_eq!(parse_fps("30/1"), Some(30.0));
        assert_eq!(parse_fps("30000/1001"), Some(30000.0 / 1001.0));
        assert_eq!(parse_fps("0/0"), None);
        assert_eq!(parse_fps("junk"), None);
    }

    #[test]
    fn parses_ffprobe_output() {
        let json = r#"{"streams":[{"codec_name":"h264","width":720,"height":1280,"avg_frame_rate":"30/1"}]}"#;
        assert_eq!(
            parse_ffprobe_json(json),
            VideoMeta { codec: Some("h264".into()), width: Some(720), height: Some(1280), fps: Some(30.0) }
        );
    }

    #[test]
    fn unreadable_output_is_unknown() {
        assert_eq!(parse_ffprobe_json(""), VideoMeta::default());
        assert_eq!(parse_ffprobe_json(r#"{"streams":[]}"#), VideoMeta::default());
    }
}
