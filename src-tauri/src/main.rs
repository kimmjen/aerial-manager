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

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};

use jobs::Jobs;
use library::{ImportResult, LibraryVideo, MetaCache};
use settings::Paths;
use slots::{ReapplyResult, SlotInfo};

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
fn get_locations(paths: State<'_, Paths>) -> Locations {
    Locations { library_dirs: paths.library_dirs.clone(), aerials_dir: paths.aerials_dir.clone() }
}

#[tauri::command]
async fn get_slots(paths: State<'_, Paths>) -> Result<Vec<SlotInfo>, String> {
    let p = paths.inner().clone();
    blocking(move || slots::get_slots(&p)).await
}

#[tauri::command]
async fn apply_to_slot(paths: State<'_, Paths>, uuid: String, dir: String, name: String) -> Result<(), String> {
    let p = paths.inner().clone();
    blocking(move || slots::apply_to_slot(&p, &uuid, &dir, &name)).await?
}

#[tauri::command]
async fn reapply_all(paths: State<'_, Paths>) -> Result<Vec<ReapplyResult>, String> {
    let p = paths.inner().clone();
    blocking(move || slots::reapply_all(&p)).await
}

#[tauri::command]
async fn restore_slot(paths: State<'_, Paths>, uuid: String) -> Result<(), String> {
    let p = paths.inner().clone();
    blocking(move || slots::restore_slot(&p, &uuid)).await?
}

#[tauri::command]
async fn set_selected_slot(paths: State<'_, Paths>, uuid: String) -> Result<(), String> {
    let p = paths.inner().clone();
    blocking(move || {
        wallpaper::write_selected_slot(&p.index_plist, slots::assert_slot_uuid(&uuid)?)?;
        wallpaper::restart_wallpaper_agent();
        Ok(())
    })
    .await?
}

#[tauri::command]
async fn list_library(
    paths: State<'_, Paths>,
    cache: State<'_, Arc<MetaCache>>,
    jobs: State<'_, Jobs>,
) -> Result<Vec<LibraryVideo>, String> {
    let (p, cache, jobs) = (paths.inner().clone(), cache.inner().clone(), jobs.inner().clone());
    blocking(move || library::list_library(&p, &cache, &jobs)).await
}

#[tauri::command]
async fn import_files(
    paths: State<'_, Paths>,
    jobs: State<'_, Jobs>,
    files: Vec<PathBuf>,
    allow_existing: bool,
) -> Result<ImportResult, String> {
    let (p, jobs) = (paths.inner().clone(), jobs.inner().clone());
    blocking(move || library::import_files(&p, &jobs, &files, allow_existing)).await?
}

#[tauri::command]
async fn rename_library_file(paths: State<'_, Paths>, dir: String, name: String, new_name: String) -> Result<(), String> {
    let p = paths.inner().clone();
    blocking(move || library::rename_library_file(&p, &dir, &name, &new_name)).await?
}

#[tauri::command]
async fn delete_library_file(paths: State<'_, Paths>, dir: String, name: String) -> Result<(), String> {
    let p = paths.inner().clone();
    blocking(move || library::delete_library_file(&p, &dir, &name)).await?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let home = PathBuf::from(std::env::var("HOME")?);
            let app_data = app.path().app_data_dir()?;
            let paths = Paths::load(&home, &app_data);
            // previews may read only the library folders and the aerial slots
            let scope = app.asset_protocol_scope();
            for dir in paths.library_dirs.values() {
                scope.allow_directory(dir, false)?;
            }
            scope.allow_directory(&paths.aerials_dir, false)?;
            app.manage(paths);
            app.manage(Arc::new(MetaCache::default()));
            app.manage(Jobs::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_locations,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
