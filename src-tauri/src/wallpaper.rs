//! Lock-screen aerial selection (Index.plist `assetID`) and agent restarts.
//! Replaces the python3 plistlib snippets in lib/wallpaper.ts.
use plist::Value;
use std::io::Cursor;
use std::path::Path;
use std::process::Command;

const STORE_KEYS: [&str; 2] = ["AllSpacesAndDisplays", "SystemDefault"];

fn first_choice<'a>(root: &'a mut Value, key: &str) -> Option<&'a mut plist::Dictionary> {
    root.as_dictionary_mut()?
        .get_mut(key)?
        .as_dictionary_mut()?
        .get_mut("Linked")?
        .as_dictionary_mut()?
        .get_mut("Content")?
        .as_dictionary_mut()?
        .get_mut("Choices")?
        .as_array_mut()?
        .first_mut()?
        .as_dictionary_mut()
}

/// UUID of the aerial currently shown on the lock screen, or None.
pub fn get_selected_slot(index_plist: &Path) -> Option<String> {
    let mut root = Value::from_file(index_plist).ok()?;
    let cfg = first_choice(&mut root, STORE_KEYS[0])?.get("Configuration")?.as_data()?;
    let cfg = Value::from_reader(Cursor::new(cfg)).ok()?;
    let id = cfg.as_dictionary()?.get("assetID")?.as_string()?;
    (!id.is_empty()).then(|| id.to_string())
}

/// Point every store entry at `uuid`, keeping the binary plist format.
pub fn write_selected_slot(index_plist: &Path, uuid: &str) -> Result<(), String> {
    let mut root = Value::from_file(index_plist).map_err(|e| e.to_string())?;
    for key in STORE_KEYS {
        let Some(choice) = first_choice(&mut root, key) else { continue };
        let data = choice.get("Configuration").and_then(Value::as_data).ok_or("missing Configuration")?;
        let mut cfg = Value::from_reader(Cursor::new(data)).map_err(|e| e.to_string())?;
        cfg.as_dictionary_mut()
            .ok_or("Configuration is not a dictionary")?
            .insert("assetID".into(), Value::String(uuid.into()));
        let mut buf = Vec::new();
        cfg.to_writer_binary(&mut buf).map_err(|e| e.to_string())?;
        choice.insert("Configuration".into(), Value::Data(buf));
    }
    root.to_file_binary(index_plist).map_err(|e| e.to_string())
}

/// Restart so file/selection changes take effect. The agent relaunches on demand.
pub fn restart_wallpaper_agent() {
    for name in ["WallpaperAgent", "WallpaperAerialsExtension"] {
        let _ = Command::new("/usr/bin/killall").arg(name).output();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use plist::Dictionary;

    /// Minimal Index.plist with the same nesting as the real one.
    fn fixture(asset: &str) -> Value {
        let mut cfg = Dictionary::new();
        cfg.insert("assetID".into(), Value::String(asset.into()));
        let mut buf = Vec::new();
        Value::Dictionary(cfg).to_writer_binary(&mut buf).unwrap();
        let entry = || {
            let mut choice = Dictionary::new();
            choice.insert("Configuration".into(), Value::Data(buf.clone()));
            choice.insert("Provider".into(), Value::String("com.apple.wallpaper.choice.aerials".into()));
            let mut content = Dictionary::new();
            content.insert("Choices".into(), Value::Array(vec![Value::Dictionary(choice)]));
            let mut linked = Dictionary::new();
            linked.insert("Content".into(), Value::Dictionary(content));
            let mut e = Dictionary::new();
            e.insert("Linked".into(), Value::Dictionary(linked));
            Value::Dictionary(e)
        };
        let mut root = Dictionary::new();
        root.insert("AllSpacesAndDisplays".into(), entry());
        root.insert("SystemDefault".into(), entry());
        Value::Dictionary(root)
    }

    fn asset_of(root: &mut Value, key: &str) -> String {
        let data = first_choice(root, key).unwrap().get("Configuration").unwrap().as_data().unwrap().to_vec();
        Value::from_reader(Cursor::new(data)).unwrap().as_dictionary().unwrap()["assetID"].as_string().unwrap().into()
    }

    #[test]
    fn reads_and_writes_asset_id_in_both_entries() {
        let file = std::env::temp_dir().join(format!("aerial-index-{}.plist", std::process::id()));
        fixture("OLD").to_file_binary(&file).unwrap();
        assert_eq!(get_selected_slot(&file).as_deref(), Some("OLD"));

        write_selected_slot(&file, "4C108785-A7BA-422E-9C79-B0129F1D5550").unwrap();
        assert_eq!(get_selected_slot(&file).as_deref(), Some("4C108785-A7BA-422E-9C79-B0129F1D5550"));
        let mut root = Value::from_file(&file).unwrap();
        assert_eq!(asset_of(&mut root, "SystemDefault"), "4C108785-A7BA-422E-9C79-B0129F1D5550");
        // still a binary plist
        assert!(std::fs::read(&file).unwrap().starts_with(b"bplist00"));
    }

    #[test]
    fn missing_file_reads_as_none() {
        assert_eq!(get_selected_slot(Path::new("/nonexistent/Index.plist")), None);
    }
}
