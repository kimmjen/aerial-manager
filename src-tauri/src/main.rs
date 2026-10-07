mod codec;
mod config;
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

use library::{LibraryVideo, MetaCache};
use settings::Paths;
use slots::{ReapplyResult, SlotInfo};

/// File, ffmpeg and plist work blocks; keep it off the async runtime.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
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
async fn list_library(paths: State<'_, Paths>, cache: State<'_, Arc<MetaCache>>) -> Result<Vec<LibraryVideo>, String> {
    let (p, cache) = (paths.inner().clone(), cache.inner().clone());
    blocking(move || library::list_library(&p, &cache)).await
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
        .setup(|app| {
            let home = PathBuf::from(std::env::var("HOME")?);
            let app_data = app.path().app_data_dir()?;
            app.manage(Paths::load(&home, &app_data));
            app.manage(Arc::new(MetaCache::default()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_slots,
            apply_to_slot,
            reapply_all,
            restore_slot,
            set_selected_slot,
            list_library,
            rename_library_file,
            delete_library_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
