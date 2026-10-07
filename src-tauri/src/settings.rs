//! Where things live on disk. Replaces lib/config.ts (env vars → config.json).
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::config::parse_library_dirs;

/// `<app data>/config.json`. Every field is optional; the settings screen (step 4) edits it.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub library_dirs: Vec<String>,
    pub backup_dir: Option<String>,
    pub ffmpeg_path: Option<String>,
}

/// Resolved locations used by every command.
#[derive(Debug, Clone)]
pub struct Paths {
    pub library_dirs: BTreeMap<String, String>,
    pub aerials_dir: PathBuf,
    pub index_plist: PathBuf,
    pub backup_dir: PathBuf,
    pub slots_file: PathBuf,
    pub ffmpeg: String,
    pub ffprobe: String,
}

impl Paths {
    pub fn load(home: &Path, app_data: &Path) -> Paths {
        let cfg: AppConfig = std::fs::read_to_string(app_data.join("config.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let wallpaper = home.join("Library/Application Support/com.apple.wallpaper");
        let ffmpeg = detect_ffmpeg(cfg.ffmpeg_path.as_deref());
        Paths {
            library_dirs: parse_library_dirs(&cfg.library_dirs, &home.join("Movies").to_string_lossy()),
            aerials_dir: wallpaper.join("aerials/videos"),
            index_plist: wallpaper.join("Store/Index.plist"),
            backup_dir: cfg.backup_dir.map(PathBuf::from).unwrap_or_else(|| home.join(".aerial-manager/backups")),
            slots_file: app_data.join("slots.json"),
            ffprobe: ffmpeg.strip_suffix("ffmpeg").map(|p| format!("{p}ffprobe")).unwrap_or_else(|| "ffprobe".into()),
            ffmpeg,
        }
    }
}

/// GUI apps don't inherit the shell PATH, so check the Homebrew locations explicitly.
fn detect_ffmpeg(configured: Option<&str>) -> String {
    if let Some(p) = configured {
        return p.to_string();
    }
    ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]
        .into_iter()
        .find(|p| Path::new(p).exists())
        .unwrap_or("ffmpeg")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_without_config() {
        let p = Paths::load(Path::new("/Users/x"), Path::new("/nonexistent"));
        assert_eq!(p.library_dirs["Movies"], "/Users/x/Movies");
        assert_eq!(p.backup_dir, PathBuf::from("/Users/x/.aerial-manager/backups"));
        assert_eq!(p.aerials_dir, PathBuf::from("/Users/x/Library/Application Support/com.apple.wallpaper/aerials/videos"));
        assert_eq!(p.slots_file, PathBuf::from("/nonexistent/slots.json"));
        assert!(p.ffprobe.ends_with("ffprobe"));
    }

    #[test]
    fn reads_config_json() {
        let dir = std::env::temp_dir().join(format!("aerial-settings-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("config.json"),
            r#"{"libraryDirs":["/v/clips"],"backupDir":"/b","ffmpegPath":"/opt/x/bin/ffmpeg"}"#,
        )
        .unwrap();
        let p = Paths::load(Path::new("/Users/x"), &dir);
        assert_eq!(p.library_dirs["clips"], "/v/clips");
        assert_eq!(p.backup_dir, PathBuf::from("/b"));
        assert_eq!(p.ffmpeg, "/opt/x/bin/ffmpeg");
        assert_eq!(p.ffprobe, "/opt/x/bin/ffprobe");
    }
}
