use crate::transcode::is_mov_compatible;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LibraryStatus {
    Ready,
    Incompatible,
    Converting,
    Error,
}

#[allow(dead_code)] // constructed by background conversion jobs (migration step 4)
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum JobState {
    Converting,
    Error,
}

/// A running or failed conversion job wins over the codec check.
pub fn derive_library_status(codec: Option<&str>, job: Option<JobState>) -> LibraryStatus {
    match job {
        Some(JobState::Converting) => LibraryStatus::Converting,
        Some(JobState::Error) => LibraryStatus::Error,
        None if is_mov_compatible(codec) => LibraryStatus::Ready,
        None => LibraryStatus::Incompatible,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use LibraryStatus::*;

    #[test]
    fn running_job_is_converting() {
        assert_eq!(derive_library_status(Some("av1"), Some(JobState::Converting)), Converting);
        assert_eq!(derive_library_status(Some("h264"), Some(JobState::Converting)), Converting);
    }

    #[test]
    fn failed_job_is_error() {
        assert_eq!(derive_library_status(Some("av1"), Some(JobState::Error)), Error);
    }

    #[test]
    fn compatible_codecs_are_ready() {
        assert_eq!(derive_library_status(Some("h264"), None), Ready);
        assert_eq!(derive_library_status(Some("hevc"), None), Ready);
    }

    #[test]
    fn incompatible_without_job() {
        assert_eq!(derive_library_status(Some("av1"), None), Incompatible);
        assert_eq!(derive_library_status(None, None), Incompatible);
    }
}
