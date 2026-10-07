// ponytail: core modules land before the commands that use them (migration step 3)
#![allow(dead_code)]

mod codec;
mod config;
mod mapping;
mod paths;
mod status;
mod transcode;

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
