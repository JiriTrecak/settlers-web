//! Webview shell. No game logic — sim stays in the JS bundle.

// Build the desktop asset context in the binary: exporting its large byte arrays
// through library metadata can overflow Mach-O's archive offsets.
pub fn run_with_context(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(mobile)]
#[tauri::mobile_entry_point]
pub fn run() {
    run_with_context(tauri::generate_context!());
}
