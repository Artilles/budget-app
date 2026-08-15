/// The desktop shell.
///
/// Deliberately thin: all budget logic lives in the frontend, and the only
/// native capabilities granted are file dialogs and filesystem access, which
/// the storage adapter needs to read and write the user's budget file. No
/// custom commands, no network, no shell access.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running the Budget app");
}
