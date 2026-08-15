/// The desktop shell.
///
/// Deliberately thin: all budget logic lives in the frontend, and the only
/// native capabilities granted are file dialogs and filesystem access, which
/// the storage adapter needs to read and write the user's budget file. No
/// custom commands, no network, no shell access.
///
/// Note `dragDropEnabled: false` on the window in `tauri.conf.json`. Tauri
/// installs a native OS drag-and-drop handler on the webview by default, and it
/// swallows HTML5 drag events before the page sees them — so reordering
/// investment accounts works in a browser but silently does nothing in the
/// packaged app. Tauri's own docs state disabling it is required for HTML5 drag
/// and drop on Windows. We accept no dropped files, so nothing is given up.
/// (The reason lives here because `tauri.conf.json` is strict JSON with
/// `deny_unknown_fields`: a "//" comment key fails the build.)
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running the Budget app");
}
