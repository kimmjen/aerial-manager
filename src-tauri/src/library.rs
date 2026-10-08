//! Library folder listing, rename and delete, ported from lib/library.ts.
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use crate::codec::{probe_meta, VideoMeta};
use crate::jobs::Jobs;
use crate::paths::is_safe_video_name;
use crate::settings::Paths;
use crate::slots::resolve_library_file;
use crate::status::{derive_library_status, LibraryStatus};
use crate::transcode::is_mov_compatible;

#[derive(Debug, Serialize)]
pub struct LibraryVideo {
    pub dir: String,
    pub name: String,
    pub size: u64,
    /// Milliseconds since the epoch, like Node's `mtimeMs`.
    pub mtime: f64,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub status: LibraryStatus,
}

/// Probing reads the file header; cache by path + mtime so repeated listings are cheap.
#[derive(Default)]
pub struct MetaCache(Mutex<HashMap<(PathBuf, u128), VideoMeta>>);

impl MetaCache {
    fn get(&self, ffprobe: &str, path: &Path, mtime_ns: u128) -> VideoMeta {
        let key = (path.to_path_buf(), mtime_ns);
        if let Some(hit) = self.0.lock().unwrap().get(&key) {
            return hit.clone();
        }
        let meta = probe_meta(ffprobe, path);
        self.0.lock().unwrap().insert(key, meta.clone());
        meta
    }
}

pub fn list_library(p: &Paths, cache: &MetaCache, jobs: &Jobs) -> Vec<LibraryVideo> {
    let mut out = Vec::new();
    for (dir, base) in &p.library_dirs {
        let Ok(entries) = fs::read_dir(base) else { continue };
        for entry in entries.flatten() {
            let Ok(name) = entry.file_name().into_string() else { continue };
            if !is_safe_video_name(&name) {
                continue;
            }
            let Ok(md) = entry.metadata() else { continue };
            if !md.is_file() {
                continue;
            }
            let mtime_ns = md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos());
            let meta = cache.get(&p.ffprobe, &entry.path(), mtime_ns);
            out.push(LibraryVideo {
                dir: dir.clone(),
                name,
                size: md.len(),
                mtime: mtime_ns as f64 / 1e6,
                status: derive_library_status(meta.codec.as_deref(), jobs.get(&entry.path())),
                codec: meta.codec,
                width: meta.width,
                height: meta.height,
                fps: meta.fps,
            });
        }
    }
    // Case-insensitive codepoint order; the UI re-sorts with the viewer's locale (Intl.Collator).
    out.sort_by_cached_key(|v| v.name.to_lowercase());
    out
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub dir: String,
    pub saved: Vec<String>,
}

/// Copy files into the first library folder (replaces the web upload). With
/// `allow_existing`, a same-named file already there is reused instead of failing.
/// Incompatible codecs are queued for background conversion.
pub fn import_files(p: &Paths, jobs: &Jobs, files: &[PathBuf], allow_existing: bool) -> Result<ImportResult, String> {
    let (dir, base) = p.library_dirs.iter().next().ok_or("no library folder configured")?;
    fs::create_dir_all(base).map_err(|e| e.to_string())?;
    let mut saved = Vec::new();
    for src in files {
        let name = src.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        if !is_safe_video_name(&name) {
            return Err(format!("unsupported file: {name}"));
        }
        let dest = Path::new(base).join(&name);
        if dest.exists() {
            if !allow_existing {
                return Err(format!("already exists: {name}"));
            }
        } else {
            fs::copy(src, &dest).map_err(|e| format!("copy failed for {name}: {e}"))?;
            if !is_mov_compatible(probe_meta(&p.ffprobe, &dest).codec.as_deref()) {
                jobs.convert_in_background(p.ffmpeg.clone(), dest);
            }
        }
        saved.push(name);
    }
    Ok(ImportResult { dir: dir.clone(), saved })
}

pub fn rename_library_file(p: &Paths, dir: &str, name: &str, new_name: &str) -> Result<(), String> {
    let from = resolve_library_file(p, dir, name)?;
    let to = resolve_library_file(p, dir, new_name)?;
    if to.exists() {
        return Err(format!("already exists: {new_name}"));
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

pub fn delete_library_file(p: &Paths, dir: &str, name: &str) -> Result<(), String> {
    fs::remove_file(resolve_library_file(p, dir, name)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_renames_and_deletes() {
        let home = std::env::temp_dir().join(format!("aerial-lib-{}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        let movies = home.join("Movies");
        fs::create_dir_all(&movies).unwrap();
        fs::write(movies.join("b.mp4"), b"x").unwrap();
        fs::write(movies.join("a.mov"), b"xy").unwrap();
        fs::write(movies.join(".hidden.mp4"), b"").unwrap();
        fs::write(movies.join("notes.txt"), b"").unwrap();
        let mut p = Paths::load(&home, Path::new("/nonexistent"));
        p.ffprobe = "/nonexistent/ffprobe".into(); // probing fails → unknown meta

        let cache = MetaCache::default();
        let jobs = Jobs::default();
        let names: Vec<_> = list_library(&p, &cache, &jobs).into_iter().map(|v| (v.name, v.size)).collect();
        assert_eq!(names, vec![("a.mov".to_string(), 2), ("b.mp4".to_string(), 1)]);

        rename_library_file(&p, "Movies", "a.mov", "c.mov").unwrap();
        assert!(rename_library_file(&p, "Movies", "b.mp4", "c.mov").is_err(), "refuses to overwrite");
        delete_library_file(&p, "Movies", "b.mp4").unwrap();
        let names: Vec<_> = list_library(&p, &cache, &jobs).into_iter().map(|v| v.name).collect();
        assert_eq!(names, vec!["c.mov"]);
        assert_eq!(list_library(&p, &cache, &jobs)[0].status, LibraryStatus::Incompatible);

        // import: copies into the first library dir, refuses or reuses duplicates
        let outside = home.join("in.mp4");
        fs::write(&outside, b"z").unwrap();
        let r = import_files(&p, &jobs, std::slice::from_ref(&outside), false).unwrap();
        assert_eq!((r.dir.as_str(), r.saved.clone()), ("Movies", vec!["in.mp4".to_string()]));
        assert!(movies.join("in.mp4").exists());
        assert!(import_files(&p, &jobs, std::slice::from_ref(&outside), false).is_err());
        assert_eq!(import_files(&p, &jobs, &[outside], true).unwrap().saved, vec!["in.mp4"]);
        assert!(import_files(&p, &jobs, &[home.join("notes.txt")], true).is_err());
    }
}
