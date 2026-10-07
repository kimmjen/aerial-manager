use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotSource {
    pub dir: String,
    pub name: String,
    pub applied_at: String,
}

/// UUID -> applied source video. Absent key means the slot holds the original aerial.
pub type SlotMapping = BTreeMap<String, SlotSource>;

/// Missing or corrupt file reads as an empty mapping (same as the Next app).
pub fn read_mapping(file: &Path) -> SlotMapping {
    fs::read_to_string(file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn write_mapping(mapping: &SlotMapping, file: &Path) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(file, serde_json::to_string_pretty(mapping)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_file(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aerial-mapping-{test}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("slots.json")
    }

    #[test]
    fn missing_file_is_empty() {
        assert!(read_mapping(&tmp_file("missing")).is_empty());
    }

    #[test]
    fn round_trips() {
        let file = tmp_file("roundtrip");
        let mut m = SlotMapping::new();
        m.insert(
            "00BA71CD-2C54-415A-A68A-8358E677D750".into(),
            SlotSource { dir: "new".into(), name: "난 꼭 해내리라..MP4".into(), applied_at: "2026-06-02T00:00:00.000Z".into() },
        );
        write_mapping(&m, &file).unwrap();
        assert_eq!(read_mapping(&file), m);
    }

    #[test]
    fn corrupt_file_is_empty() {
        let file = tmp_file("corrupt");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "not json").unwrap();
        assert!(read_mapping(&file).is_empty());
    }

    #[test]
    fn reads_the_next_apps_format() {
        // data/slots.json written by lib/mapping.ts must import unchanged (plan step 3)
        let file = tmp_file("next");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, r#"{"4C108785-A7BA-422E-9C79-B0129F1D5550":{"dir":"file","name":"a.MP4","appliedAt":"2026-06-27T14:06:31.699Z"}}"#).unwrap();
        let m = read_mapping(&file);
        assert_eq!(m["4C108785-A7BA-422E-9C79-B0129F1D5550"].applied_at, "2026-06-27T14:06:31.699Z");
    }
}
