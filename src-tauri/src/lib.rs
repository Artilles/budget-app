use std::{fs, io::Write, path::PathBuf};
use tauri_plugin_fs::FsExt;

/// The desktop shell.
///
/// Deliberately thin: all budget logic lives in the frontend, and the only
/// native capabilities granted are file dialogs and access to files the user
/// has picked in one. No network, no shell access.
///
/// Picking a file adds it to the fs plugin's runtime scope, and the
/// persisted-scope plugin remembers those grants across restarts, so the app
/// never needs blanket access to a folder.
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
        // Must follow the fs plugin, whose scope it saves and restores.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![write_budget_file])
        .run(tauri::generate_context!())
        .expect("error while running the Budget app");
}

/// Replace a picked file's contents atomically: write a sibling temp file, then
/// rename it over the target, so a crash mid-save leaves the old file intact.
///
/// Native because the temp file is never picked, so the fs plugin's scope would
/// refuse it. The target itself must still be a file the user picked.
#[tauri::command]
fn write_budget_file(app: tauri::AppHandle, path: PathBuf, contents: String) -> Result<(), String> {
    if !app.fs_scope().is_allowed(&path) {
        return Err(format!("forbidden path: {}", path.display()));
    }

    let mut temp = path.clone().into_os_string();
    temp.push(".tmp");
    let temp = PathBuf::from(temp);

    let written = fs::File::create(&temp).and_then(|mut file| {
        file.write_all(contents.as_bytes())?;
        // Flushed to disk before the swap, or a power cut could leave the
        // renamed file empty.
        file.sync_all()
    });
    if let Err(err) = written.and_then(|_| fs::rename(&temp, &path)) {
        let _ = fs::remove_file(&temp);
        return Err(err.to_string());
    }
    Ok(())
}
