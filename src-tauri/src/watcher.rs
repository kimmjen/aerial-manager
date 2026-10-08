//! Restart WallpaperAgent on wake (and, if enabled, on lock) so the lock-screen
//! aerial resumes — macOS Tahoe sometimes leaves it black/frozen after sleep.
//! Replaces scripts/wake-watcher.swift + its launchd agent.
use block2::RcBlock;
use objc2_app_kit::{NSWorkspace, NSWorkspaceDidWakeNotification, NSWorkspaceScreensDidWakeNotification};
use objc2_foundation::{NSDistributedNotificationCenter, NSNotification, NSOperationQueue, NSString};
use std::io::Write;
use std::path::PathBuf;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::wallpaper::restart_wallpaper_agent;

/// Lock and wake often arrive together; only the last event within the delay restarts.
#[derive(Clone, Default)]
pub struct Debounce(Arc<AtomicU64>);

impl Debounce {
    pub fn trigger(&self, delay: Duration, action: impl FnOnce() + Send + 'static) {
        let generation = self.0.fetch_add(1, Ordering::SeqCst) + 1;
        let latest = self.0.clone();
        std::thread::spawn(move || {
            std::thread::sleep(delay);
            if latest.load(Ordering::SeqCst) == generation {
                action();
            }
        });
    }
}

fn log(file: &PathBuf, msg: &str) {
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(f, "{ts} {msg}");
    }
}

/// Register observers for the app's lifetime. Must run on the main thread.
/// `restart_on_lock` is read at event time so the settings toggle applies immediately.
pub fn start(log_file: PathBuf, restart_on_lock: impl Fn() -> bool + 'static) {
    let debounce = Debounce::default();
    let restart = {
        let log_file = log_file.clone();
        move |event: &str| {
            log(&log_file, &format!("{event} -> restart WallpaperAgent"));
            debounce.trigger(Duration::from_secs(1), restart_wallpaper_agent);
        }
    };
    let restart = std::rc::Rc::new(restart);
    let main_queue = NSOperationQueue::mainQueue();

    unsafe {
        let center = NSWorkspace::sharedWorkspace().notificationCenter();
        for (name, label) in [(NSWorkspaceDidWakeNotification, "didWake"), (NSWorkspaceScreensDidWakeNotification, "screensDidWake")] {
            let restart = restart.clone();
            let block = RcBlock::new(move |_: NonNull<NSNotification>| restart(label));
            let token = center.addObserverForName_object_queue_usingBlock(Some(name), None, Some(&main_queue), &block);
            std::mem::forget(token); // observe for the app's lifetime
        }

        let dc = NSDistributedNotificationCenter::defaultCenter();
        let locked = {
            let restart = restart.clone();
            let log_file = log_file.clone();
            RcBlock::new(move |_: NonNull<NSNotification>| {
                if restart_on_lock() {
                    restart("screenIsLocked");
                } else {
                    log(&log_file, "screenIsLocked");
                }
            })
        };
        let unlocked = RcBlock::new(move |_: NonNull<NSNotification>| log(&log_file, "screenIsUnlocked"));
        for (name, block) in [("com.apple.screenIsLocked", &locked), ("com.apple.screenIsUnlocked", &unlocked)] {
            let name = NSString::from_str(name);
            let token = dc.addObserverForName_object_queue_usingBlock(Some(&name), None, Some(&main_queue), block);
            std::mem::forget(token);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn debounce_runs_only_the_last_trigger() {
        let d = Debounce::default();
        let hits = Arc::new(AtomicUsize::new(0));
        for _ in 0..3 {
            let hits = hits.clone();
            d.trigger(Duration::from_millis(100), move || {
                hits.fetch_add(1, Ordering::SeqCst);
            });
        }
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }
}
