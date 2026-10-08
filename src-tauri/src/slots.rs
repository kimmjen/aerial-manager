//! Aerial slot operations, ported from lib/slots.ts.
use serde::Serialize;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::codec::probe_meta;
use crate::mapping::{read_mapping, write_mapping, SlotMapping, SlotSource};
use crate::paths::{is_safe_video_name, is_slot_uuid};
use crate::settings::Paths;
use crate::transcode::ffmpeg_args;
use crate::wallpaper::{get_selected_slot, restart_wallpaper_agent};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotInfo {
    pub uuid: String,
    pub size: Option<u64>,
    pub source: Option<SlotSource>,
    pub has_backup: bool,
    pub is_selected: bool,
}

#[derive(Debug, Serialize)]
pub struct ReapplyResult {
    pub uuid: String,
    pub name: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn slot_path(p: &Paths, uuid: &str) -> PathBuf {
    p.aerials_dir.join(format!("{uuid}.mov"))
}

fn backup_path(p: &Paths, uuid: &str) -> PathBuf {
    p.backup_dir.join(format!("{uuid}.mov"))
}

pub fn assert_slot_uuid(uuid: &str) -> Result<&str, String> {
    if is_slot_uuid(uuid) { Ok(uuid) } else { Err(format!("unknown slot: {uuid}")) }
}

/// Resolve a (dir key, name) pair to a library file, rejecting unsafe input.
pub fn resolve_library_file(p: &Paths, dir: &str, name: &str) -> Result<PathBuf, String> {
    let base = p.library_dirs.get(dir).ok_or_else(|| format!("unknown library dir: {dir}"))?;
    if !is_safe_video_name(name) {
        return Err(format!("unsafe filename: {name}"));
    }
    Ok(Path::new(base).join(name))
}

/// Slots are the `<UUID>.mov` files in the aerials folder (empty if none downloaded).
pub fn list_slot_uuids(aerials_dir: &Path) -> Vec<String> {
    let mut out: Vec<String> = fs::read_dir(aerials_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter_map(|n| {
            let stem = n.strip_suffix(".mov").or_else(|| n.strip_suffix(".MOV"))?;
            is_slot_uuid(stem).then(|| stem.to_uppercase())
        })
        .collect();
    out.sort();
    out
}

pub fn get_slots(p: &Paths) -> Vec<SlotInfo> {
    let mut mapping = read_mapping(&p.slots_file);
    let selected = get_selected_slot(&p.index_plist).map(|s| s.to_uppercase());
    list_slot_uuids(&p.aerials_dir)
        .into_iter()
        .map(|uuid| SlotInfo {
            size: fs::metadata(slot_path(p, &uuid)).ok().map(|m| m.len()),
            source: mapping.remove(&uuid),
            has_backup: backup_path(p, &uuid).exists(),
            is_selected: selected.as_deref() == Some(uuid.as_str()),
            uuid,
        })
        .collect()
}

fn now_iso() -> String {
    // Same shape as JS toISOString(); `date` avoids pulling in a time crate.
    Command::new("/bin/date")
        .args(["-u", "+%Y-%m-%dT%H:%M:%S.000Z"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Write a library video into a slot, normalized for the lock screen. Does not restart the agent.
fn write_slot_from_source(p: &Paths, uuid: &str, dir: &str, name: &str) -> Result<(), String> {
    let src = resolve_library_file(p, dir, name)?;
    let slot = slot_path(p, uuid);
    if !src.exists() {
        return Err(format!("source not found: {name}"));
    }
    if !slot.exists() {
        return Err(format!("slot not found: {uuid}"));
    }

    // Never lose an original: back it up before the first overwrite.
    let mut mapping = read_mapping(&p.slots_file);
    let backup = backup_path(p, uuid);
    if !mapping.contains_key(uuid) && !backup.exists() {
        fs::create_dir_all(&p.backup_dir).map_err(|e| e.to_string())?;
        fs::copy(&slot, &backup).map_err(|e| format!("backup failed: {e}"))?;
    }

    let meta = probe_meta(&p.ffprobe, &src);
    let tmp = slot.with_extension("tmp.mov");
    let result = Command::new(&p.ffmpeg)
        .args(ffmpeg_args(&meta, &src.to_string_lossy(), &tmp.to_string_lossy()))
        .output()
        .map_err(|e| format!("ffmpeg failed to start ({}): {e}", p.ffmpeg))
        .and_then(|o| {
            if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).trim().to_string()) }
        })
        .and_then(|_| fs::rename(&tmp, &slot).map_err(|e| e.to_string()));
    let _ = fs::remove_file(&tmp);
    result?;
    fs::set_permissions(&slot, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;

    mapping.insert(uuid.to_string(), SlotSource { dir: dir.into(), name: name.into(), applied_at: now_iso() });
    write_mapping(&mapping, &p.slots_file).map_err(|e| e.to_string())
}

pub fn apply_to_slot(p: &Paths, uuid: &str, dir: &str, name: &str) -> Result<(), String> {
    write_slot_from_source(p, assert_slot_uuid(uuid)?, dir, name)?;
    restart_wallpaper_agent();
    Ok(())
}

/// Re-run every custom slot through the current normalization; restart once at the end.
pub fn reapply_all(p: &Paths) -> Vec<ReapplyResult> {
    let results = read_mapping(&p.slots_file)
        .into_iter()
        .map(|(uuid, src)| {
            let r = write_slot_from_source(p, &uuid, &src.dir, &src.name);
            ReapplyResult { uuid, name: src.name, ok: r.is_ok(), error: r.err() }
        })
        .collect();
    restart_wallpaper_agent();
    results
}

pub fn restore_slot(p: &Paths, uuid: &str) -> Result<(), String> {
    let uuid = assert_slot_uuid(uuid)?;
    let backup = backup_path(p, uuid);
    if !backup.exists() {
        return Err(format!("no backup for slot: {uuid}"));
    }
    let slot = slot_path(p, uuid);
    fs::copy(&backup, &slot).map_err(|e| e.to_string())?;
    fs::set_permissions(&slot, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    let mut mapping = read_mapping(&p.slots_file);
    mapping.remove(uuid);
    write_mapping(&mapping, &p.slots_file).map_err(|e| e.to_string())?;
    restart_wallpaper_agent();
    Ok(())
}

/// Merge a slots.json from the web app (`data/slots.json`) into this app's mapping.
/// Existing entries win; only valid slot ids are taken. Returns how many were added.
pub fn import_legacy_slots(p: &Paths, file: &Path) -> Result<usize, String> {
    let text = fs::read_to_string(file).map_err(|e| e.to_string())?;
    let legacy: SlotMapping = serde_json::from_str(&text).map_err(|_| "not a slots.json from Aerial Manager".to_string())?;
    let mut mapping = read_mapping(&p.slots_file);
    let mut added = 0;
    for (uuid, src) in legacy {
        if is_slot_uuid(&uuid) && !mapping.contains_key(&uuid) {
            mapping.insert(uuid, src);
            added += 1;
        }
    }
    write_mapping(&mapping, &p.slots_file).map_err(|e| e.to_string())?;
    Ok(added)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_legacy_mapping_without_overwriting() {
        let root = std::env::temp_dir().join(format!("aerial-legacy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let mut p = Paths::load(&root, &root);
        p.slots_file = root.join("slots.json");
        fs::write(&p.slots_file, r#"{"00BA71CD-2C54-415A-A68A-8358E677D750":{"dir":"a","name":"mine.mp4","appliedAt":"x"}}"#).unwrap();
        let legacy = root.join("legacy.json");
        fs::write(&legacy, r#"{
            "00BA71CD-2C54-415A-A68A-8358E677D750":{"dir":"b","name":"old.mp4","appliedAt":"y"},
            "FE876489-CBD5-479B-A8F0-1B67F0741CEA":{"dir":"b","name":"new.mp4","appliedAt":"z"},
            "../evil":{"dir":"b","name":"x.mp4","appliedAt":"z"}
        }"#).unwrap();
        assert_eq!(import_legacy_slots(&p, &legacy).unwrap(), 1);
        let m = read_mapping(&p.slots_file);
        assert_eq!(m["00BA71CD-2C54-415A-A68A-8358E677D750"].name, "mine.mp4");
        assert_eq!(m["FE876489-CBD5-479B-A8F0-1B67F0741CEA"].name, "new.mp4");
        assert_eq!(m.len(), 2);

        fs::write(&legacy, "not json").unwrap();
        assert!(import_legacy_slots(&p, &legacy).is_err());
    }

    #[test]
    fn lists_only_uuid_movs_uppercased_and_sorted() {
        let dir = std::env::temp_dir().join(format!("aerial-slots-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for n in [
            "fe876489-cbd5-479b-a8f0-1b67f0741cea.mov",
            "00BA71CD-2C54-415A-A68A-8358E677D750.mov",
            "00BA71CD-2C54-415A-A68A-8358E677D750.mov.tmp.mov",
            "notes.txt",
            "evil.mov",
        ] {
            fs::write(dir.join(n), b"").unwrap();
        }
        assert_eq!(
            list_slot_uuids(&dir),
            vec!["00BA71CD-2C54-415A-A68A-8358E677D750", "FE876489-CBD5-479B-A8F0-1B67F0741CEA"]
        );
    }

    #[test]
    fn missing_aerials_dir_has_no_slots() {
        assert!(list_slot_uuids(Path::new("/nonexistent")).is_empty());
    }

    #[test]
    fn rejects_unsafe_library_paths() {
        let p = Paths::load(Path::new("/Users/x"), Path::new("/nonexistent"));
        assert!(resolve_library_file(&p, "Movies", "../secret.mp4").is_err());
        assert!(resolve_library_file(&p, "nope", "a.mp4").is_err());
        assert_eq!(resolve_library_file(&p, "Movies", "a.mp4").unwrap(), PathBuf::from("/Users/x/Movies/a.mp4"));
        assert!(assert_slot_uuid("../../etc").is_err());
    }
}
