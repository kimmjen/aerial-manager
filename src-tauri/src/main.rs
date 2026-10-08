mod codec;
mod config;
mod jobs;
mod library;
mod mapping;
mod paths;
mod settings;
mod slots;
mod status;
mod transcode;
mod wallpaper;
mod watcher;

use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use jobs::Jobs;
use library::{ImportResult, LibraryVideo, MetaCache};
use settings::{AppConfig, Paths};
use slots::{ReapplyResult, SlotInfo};

/// Swapped wholesale when settings are saved; commands work on a snapshot.
type PathsState = RwLock<Paths>;

fn current(paths: &PathsState) -> Paths {
    paths.read().unwrap().clone()
}

/// Fixed for the app's lifetime; needed to resolve and save settings.
struct AppDirs {
    home: PathBuf,
    app_data: PathBuf,
}

/// Previews may read only the library folders and the aerial slots.
fn allow_previews(app: &AppHandle, paths: &Paths) -> Result<(), String> {
    let scope = app.asset_protocol_scope();
    for dir in paths.library_dirs.values() {
        scope.allow_directory(dir, false).map_err(|e| e.to_string())?;
    }
    scope.allow_directory(&paths.aerials_dir, false).map_err(|e| e.to_string())
}

/// File, ffmpeg and plist work blocks; keep it off the async runtime.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

/// Absolute folders the UI needs to build asset:// preview URLs.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Locations {
    library_dirs: std::collections::BTreeMap<String, String>,
    aerials_dir: PathBuf,
}

#[tauri::command]
fn get_locations(paths: State<'_, PathsState>) -> Locations {
    let p = current(&paths);
    Locations { library_dirs: p.library_dirs, aerials_dir: p.aerials_dir }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    /// What config.json holds (empty before the first save).
    config: AppConfig,
    /// False on first run, so the UI can open the settings screen.
    configured: bool,
    /// Effective values, including defaults.
    library_dirs: Vec<String>,
    backup_dir: PathBuf,
    restart_on_lock: bool,
    /// The old launchd wake helper is still installed (would double-restart).
    legacy_helper_installed: bool,
}

#[tauri::command]
fn get_settings(paths: State<'_, PathsState>, dirs: State<'_, AppDirs>) -> SettingsView {
    let p = current(&paths);
    let saved = settings::read_config(&dirs.app_data);
    SettingsView {
        configured: saved.is_some(),
        config: saved.unwrap_or_default(),
        library_dirs: p.library_dirs.into_values().collect(),
        backup_dir: p.backup_dir,
        restart_on_lock: p.restart_on_lock,
        legacy_helper_installed: settings::legacy_helper_plist(&dirs.home).exists(),
    }
}

#[tauri::command]
fn remove_legacy_helper(dirs: State<'_, AppDirs>) -> Result<(), String> {
    settings::remove_legacy_helper(&dirs.home)
}

#[tauri::command]
fn save_settings(app: AppHandle, paths: State<'_, PathsState>, dirs: State<'_, AppDirs>, config: AppConfig) -> Result<(), String> {
    let next = settings::save_config(&dirs.home, &dirs.app_data, &current(&paths), &config)?;
    allow_previews(&app, &next)?;
    *paths.write().unwrap() = next;
    Ok(())
}

#[tauri::command]
async fn import_legacy_slots(paths: State<'_, PathsState>, file: PathBuf) -> Result<usize, String> {
    let p = current(&paths);
    blocking(move || slots::import_legacy_slots(&p, &file)).await?
}

#[tauri::command]
async fn get_slots(paths: State<'_, PathsState>) -> Result<Vec<SlotInfo>, String> {
    let p = current(&paths);
    blocking(move || slots::get_slots(&p)).await
}

#[tauri::command]
async fn apply_to_slot(paths: State<'_, PathsState>, uuid: String, dir: String, name: String) -> Result<(), String> {
    let p = current(&paths);
    blocking(move || slots::apply_to_slot(&p, &uuid, &dir, &name)).await?
}

#[tauri::command]
async fn reapply_all(paths: State<'_, PathsState>) -> Result<Vec<ReapplyResult>, String> {
    let p = current(&paths);
    blocking(move || slots::reapply_all(&p)).await
}

#[tauri::command]
async fn restore_slot(paths: State<'_, PathsState>, uuid: String) -> Result<(), String> {
    let p = current(&paths);
    blocking(move || slots::restore_slot(&p, &uuid)).await?
}

#[tauri::command]
async fn set_selected_slot(paths: State<'_, PathsState>, uuid: String) -> Result<(), String> {
    let p = current(&paths);
    blocking(move || {
        wallpaper::write_selected_slot(&p.index_plist, slots::assert_slot_uuid(&uuid)?)?;
        wallpaper::restart_wallpaper_agent();
        Ok(())
    })
    .await?
}

#[tauri::command]
async fn list_library(
    paths: State<'_, PathsState>,
    cache: State<'_, Arc<MetaCache>>,
    jobs: State<'_, Jobs>,
) -> Result<Vec<LibraryVideo>, String> {
    let (p, cache, jobs) = (current(&paths), cache.inner().clone(), jobs.inner().clone());
    blocking(move || library::list_library(&p, &cache, &jobs)).await
}

#[tauri::command]
async fn import_files(
    paths: State<'_, PathsState>,
    jobs: State<'_, Jobs>,
    files: Vec<PathBuf>,
    allow_existing: bool,
) -> Result<ImportResult, String> {
    let (p, jobs) = (current(&paths), jobs.inner().clone());
    blocking(move || library::import_files(&p, &jobs, &files, allow_existing)).await?
}

#[tauri::command]
async fn rename_library_file(paths: State<'_, PathsState>, dir: String, name: String, new_name: String) -> Result<(), String> {
    let p = current(&paths);
    blocking(move || library::rename_library_file(&p, &dir, &name, &new_name)).await?
}

#[tauri::command]
async fn delete_library_file(paths: State<'_, PathsState>, dir: String, name: String) -> Result<(), String> {
    let p = current(&paths);
    blocking(move || library::delete_library_file(&p, &dir, &name)).await?
}

/// Launched by the login item: stay in the menu bar without opening the window.
const HIDDEN_ARG: &str = "--hidden";

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Menu-bar icon: the app keeps watching lock/wake while the window is closed.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Aerial Manager", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::new()
        // ponytail: reuses the color app icon; a monochrome template icon would match the menu bar
        .icon(app.default_window_icon().cloned().expect("bundle icon"))
        .tooltip("Aerial Manager")
        .menu(&menu)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN_ARG])))
        .setup(|app| {
            let home = PathBuf::from(std::env::var("HOME")?);
            let app_data = app.path().app_data_dir()?;
            let paths = Paths::load(&home, &app_data);
            allow_previews(app.handle(), &paths)?;
            app.manage(RwLock::new(paths));
            let handle = app.handle().clone();
            watcher::start(app_data.join("wake.log"), move || {
                handle.state::<PathsState>().read().unwrap().restart_on_lock
            });
            app.manage(AppDirs { home, app_data });
            app.manage(Arc::new(MetaCache::default()));
            app.manage(Jobs::default());
            build_tray(app)?;
            if !std::env::args().any(|a| a == HIDDEN_ARG) {
                show_main_window(app.handle());
            }
            Ok(())
        })
        // closing the window hides it; Quit is in the menu-bar menu
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_locations,
            get_settings,
            save_settings,
            import_legacy_slots,
            remove_legacy_helper,
            get_slots,
            apply_to_slot,
            reapply_all,
            restore_slot,
            set_selected_slot,
            list_library,
            import_files,
            rename_library_file,
            delete_library_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // clicking the Dock icon brings the hidden window back
            if let RunEvent::Reopen { .. } = event {
                show_main_window(app);
            }
        });
}
