use std::path::Path;

pub const VIDEO_EXTENSIONS: [&str; 3] = ["mp4", "mov", "m4v"];

/// A bare video filename: no traversal, no hidden files, known video extension.
pub fn is_safe_video_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with('.') || name.contains('/') {
        return false;
    }
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| VIDEO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
}

/// Canonical 8-4-4-4-12 hex UUID (aerial slot ids), any case.
pub fn is_slot_uuid(s: &str) -> bool {
    s.len() == 36
        && s.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_video_names() {
        assert!(is_safe_video_name("난 꼭 해내리라..MP4"));
        assert!(is_safe_video_name("clip.mov"));
        assert!(is_safe_video_name("a.m4v"));
    }

    #[test]
    fn rejects_traversal() {
        assert!(!is_safe_video_name("../etc/passwd.mp4"));
        assert!(!is_safe_video_name(".."));
        assert!(!is_safe_video_name("foo/bar.mp4"));
    }

    #[test]
    fn rejects_non_video_extensions() {
        assert!(!is_safe_video_name("script.sh"));
        assert!(!is_safe_video_name("noext"));
    }

    #[test]
    fn rejects_hidden_and_empty() {
        assert!(!is_safe_video_name(".hidden.mp4"));
        assert!(!is_safe_video_name(""));
    }

    #[test]
    fn accepts_canonical_uuids() {
        assert!(is_slot_uuid("00BA71CD-2C54-415A-A68A-8358E677D750"));
        assert!(is_slot_uuid("fe876489-cbd5-479b-a8f0-1b67f0741cea"));
    }

    #[test]
    fn rejects_traversal_and_junk_uuids() {
        assert!(!is_slot_uuid("../../etc/passwd"));
        assert!(!is_slot_uuid("00BA71CD-2C54-415A-A68A-8358E677D750.mov"));
        assert!(!is_slot_uuid(""));
    }
}
