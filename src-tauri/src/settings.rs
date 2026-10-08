//! Where things live on disk. Replaces lib/config.ts (env vars → config.json).
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::config::parse_library_dirs;

/// `<app data>/config.json`. Every field is optional; the settings screen edits it.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub library_dirs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
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

/// The saved config, or None before the first save (first run).
pub fn read_config(app_data: &Path) -> Option<AppConfig> {
    let s = std::fs::read_to_string(app_data.join("config.json")).ok()?;
    serde_json::from_str(&s).ok()
}

/// Validate and persist `cfg`, returning the paths it resolves to.
/// Refuses to move the backup folder away from existing backups: restores would silently break.
pub fn save_config(home: &Path, app_data: &Path, current: &Paths, cfg: &AppConfig) -> Result<Paths, String> {
    for dir in &cfg.library_dirs {
        if !Path::new(dir).is_dir() {
            return Err(format!("not a folder: {dir}"));
        }
    }
    let next = Paths::from_config(home, app_data, cfg);
    if next.backup_dir != current.backup_dir && has_backups(&current.backup_dir) {
        return Err(format!(
            "Existing backups of the Apple originals are in {}. Move them to {} first, then change this setting.",
            current.backup_dir.display(),
            next.backup_dir.display()
        ));
    }
    std::fs::create_dir_all(app_data).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(app_data.join("config.json"), json).map_err(|e| e.to_string())?;
    Ok(next)
}

fn has_backups(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .any(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("mov")))
}

impl Paths {
    pub fn load(home: &Path, app_data: &Path) -> Paths {
        Paths::from_config(home, app_data, &read_config(app_data).unwrap_or_default())
    }

    pub fn from_config(home: &Path, app_data: &Path, cfg: &AppConfig) -> Paths {
        let wallpaper = home.join("Library/Application Support/com.apple.wallpaper");
        let ffmpeg = detect_ffmpeg(cfg.ffmpeg_path.as_deref());
        Paths {
            library_dirs: parse_library_dirs(&cfg.library_dirs, &home.join("Movies").to_string_lossy()),
            aerials_dir: wallpaper.join("aerials/videos"),
            index_plist: wallpaper.join("Store/Index.plist"),
            backup_dir: cfg.backup_dir.as_ref().map(PathBuf::from).unwrap_or_else(|| home.join(".aerial-manager/backups")),
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
    fn saves_config_and_guards_backups() {
        let root = std::env::temp_dir().join(format!("aerial-save-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let (home, app_data, lib) = (root.join("home"), root.join("appdata"), root.join("clips"));
        std::fs::create_dir_all(&lib).unwrap();
        let current = Paths::load(&home, &app_data);
        assert_eq!(read_config(&app_data), None, "first run has no config");

        let bad = AppConfig { library_dirs: vec![root.join("missing").to_string_lossy().into()], ..Default::default() };
        assert!(save_config(&home, &app_data, &current, &bad).is_err());

        let cfg = AppConfig { library_dirs: vec![lib.to_string_lossy().into()], ..Default::default() };
        let next = save_config(&home, &app_data, &current, &cfg).unwrap();
        assert_eq!(next.library_dirs["clips"], lib.to_string_lossy());
        assert_eq!(read_config(&app_data), Some(cfg.clone()));

        // backups exist in the current folder → moving the setting away is refused
        std::fs::create_dir_all(&next.backup_dir).unwrap();
        std::fs::write(next.backup_dir.join("00BA71CD-2C54-415A-A68A-8358E677D750.mov"), b"").unwrap();
        let moved = AppConfig { backup_dir: Some(root.join("elsewhere").to_string_lossy().into()), ..cfg.clone() };
        let err = save_config(&home, &app_data, &next, &moved).unwrap_err();
        assert!(err.contains("Move them"), "{err}");
        assert_eq!(read_config(&app_data), Some(cfg), "refused save leaves config untouched");
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
