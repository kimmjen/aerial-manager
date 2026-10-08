//! Background re-encode of library files whose codec can't live in a .mov (e.g. AV1).
//! Ported from lib/jobs.ts; in-memory, lives as long as the app.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::status::JobState;
use crate::transcode::reencode_args;

#[derive(Default, Clone)]
pub struct Jobs(Arc<Mutex<HashMap<PathBuf, JobState>>>);

impl Jobs {
    pub fn get(&self, path: &Path) -> Option<JobState> {
        self.0.lock().unwrap().get(path).copied()
    }

    /// Re-encode `path` to H.264 in place on a background thread; status via `get`.
    pub fn convert_in_background(&self, ffmpeg: String, path: PathBuf) {
        {
            let mut jobs = self.0.lock().unwrap();
            if jobs.get(&path) == Some(&JobState::Converting) {
                return;
            }
            jobs.insert(path.clone(), JobState::Converting);
        }
        let jobs = self.clone();
        std::thread::spawn(move || {
            // hidden temp name so the half-written file never shows up in the library
            let tmp = path.with_file_name(format!(".{}.converting.mp4", path.file_name().unwrap().to_string_lossy()));
            let ok = Command::new(&ffmpeg)
                .args(reencode_args(&path.to_string_lossy(), &tmp.to_string_lossy(), None))
                .output()
                .is_ok_and(|o| o.status.success())
                && std::fs::rename(&tmp, &path).is_ok();
            let _ = std::fs::remove_file(&tmp);
            let mut map = jobs.0.lock().unwrap();
            if ok {
                map.remove(&path);
            } else {
                map.insert(path, JobState::Error);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn failed_conversion_reports_error_and_cleans_up() {
        let dir = std::env::temp_dir().join(format!("aerial-jobs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("clip.mp4");
        std::fs::write(&file, b"not a video").unwrap();

        let jobs = Jobs::default();
        jobs.convert_in_background("/nonexistent/ffmpeg".into(), file.clone());
        let start = Instant::now();
        while jobs.get(&file) == Some(JobState::Converting) && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(jobs.get(&file), Some(JobState::Error));
        assert_eq!(std::fs::read(&file).unwrap(), b"not a video", "source untouched on failure");
        assert!(!dir.join(".clip.mp4.converting.mp4").exists());
    }
}
