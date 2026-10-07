use std::collections::BTreeMap;
use std::path::Path;

/// Key library dirs by basename, deduping collisions (`videos`, `videos-2`, …).
/// Falls back to `fallback` when no dirs are configured.
pub fn parse_library_dirs(dirs: &[String], fallback: &str) -> BTreeMap<String, String> {
    let mut list: Vec<&str> = dirs.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if list.is_empty() {
        list.push(fallback);
    }
    let mut out = BTreeMap::new();
    for dir in list {
        let base = Path::new(dir)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| !n.is_empty())
            .unwrap_or("library");
        let mut key = base.to_string();
        let mut n = 2;
        while out.contains_key(&key) {
            key = format!("{base}-{n}");
            n += 1;
        }
        out.insert(key, dir.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dirs(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn falls_back_when_empty() {
        assert_eq!(parse_library_dirs(&[], "/Users/x/Movies"), map(&[("Movies", "/Users/x/Movies")]));
        assert_eq!(parse_library_dirs(&dirs(&[""]), "/Users/x/Movies"), map(&[("Movies", "/Users/x/Movies")]));
    }

    #[test]
    fn keys_by_basename() {
        assert_eq!(
            parse_library_dirs(&dirs(&["/a/clips", " /b/shorts"]), "/fallback"),
            map(&[("clips", "/a/clips"), ("shorts", "/b/shorts")])
        );
    }

    #[test]
    fn dedupes_colliding_basenames() {
        assert_eq!(
            parse_library_dirs(&dirs(&["/a/videos", "/b/videos"]), "/fallback"),
            map(&[("videos", "/a/videos"), ("videos-2", "/b/videos")])
        );
    }
}
