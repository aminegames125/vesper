use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use vesper_recorder::{Options, Output};

/// Stop flags of the recordings that are running, keyed by recording id.
type Running = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

#[derive(Clone, Serialize)]
struct Finished {
    id: String,
    ok: bool,
    bytes: u64,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
struct Progress {
    id: String,
    bytes: u64,
    elapsed: u64,
}

/// Keeps letters, digits, spaces and dashes so a programme title is safe as a file name.
fn safe_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "recording".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

/// Videos/Vesper on desktop; the app's own data folder on phones and TVs, which have no Videos folder.
fn recordings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .video_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("Vesper");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Records `seconds` of `url` on this device, without ffmpeg. Works on desktop, phones and TVs.
#[tauri::command]
fn start_recording(
    app: AppHandle,
    running: State<'_, Running>,
    id: String,
    url: String,
    title: String,
    seconds: u64,
) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = recordings_dir(&app)?.join(format!("{} {}.ts", safe_name(&title), stamp));

    let stop = Arc::new(AtomicBool::new(false));
    running
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), stop.clone());

    let registry = running.inner().clone();
    let options = Options::new(url, seconds, Output::File(path.clone()));
    thread::spawn(move || {
        let progress_app = app.clone();
        let progress_id = id.clone();
        let outcome = vesper_recorder::record(&options, &stop, move |p| {
            let _ = progress_app.emit(
                "recording-progress",
                Progress {
                    id: progress_id.clone(),
                    bytes: p.bytes,
                    elapsed: p.seconds,
                },
            );
        });
        if let Ok(mut map) = registry.lock() {
            map.remove(&id);
        }
        let event = match outcome {
            Ok(summary) => Finished {
                id,
                ok: summary.bytes > 0,
                bytes: summary.bytes,
                error: summary.warning,
            },
            Err(error) => Finished {
                id,
                ok: false,
                bytes: 0,
                error: Some(error.to_string()),
            },
        };
        let _ = app.emit("recording-finished", event);
    });

    Ok(path.to_string_lossy().into_owned())
}

/// Asks a running recording to wrap up; it keeps what it has captured.
#[tauri::command]
fn stop_recording(running: State<'_, Running>, id: String) -> Result<(), String> {
    if let Some(flag) = running.lock().map_err(|e| e.to_string())?.get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
fn reveal_recording(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer")
        .arg(format!("/select,{}", path))
        .spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").args(["-R", &path]).spawn();
    #[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
    let result = Command::new("xdg-open")
        .arg(
            PathBuf::from(&path)
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_default(),
        )
        .spawn();
    #[cfg(target_os = "android")]
    let result: std::io::Result<std::process::Child> = {
        let _ = &path;
        Err(std::io::Error::other(
            "Files are in the app's Vesper folder.",
        ))
    };
    result.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_recordings_folder(app: AppHandle) -> Result<(), String> {
    let dir = recordings_dir(&app)?;
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
    let result = Command::new("xdg-open").arg(&dir).spawn();
    #[cfg(target_os = "android")]
    let result: std::io::Result<std::process::Child> = {
        let _ = &dir;
        Err(std::io::Error::other(
            "Recordings are stored in the app's Vesper folder.",
        ))
    };
    result.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_recording_file(path: String) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---- bundled cloud server (desktop only) -----------------------------------------------------

#[cfg(desktop)]
mod local_server {
    use super::*;
    use std::process::Child;

    #[derive(Default)]
    pub struct LocalServer(pub Mutex<Option<Child>>);

    #[derive(Serialize)]
    pub struct ServerStatus {
        pub running: bool,
        pub available: bool,
    }

    fn binary() -> Option<PathBuf> {
        let name = if cfg!(windows) {
            "vesper-server.exe"
        } else {
            "vesper-server"
        };
        let path = std::env::current_exe().ok()?.parent()?.join(name);
        path.is_file().then_some(path)
    }

    fn reap(slot: &mut Option<Child>) -> bool {
        match slot {
            Some(child) => match child.try_wait() {
                Ok(None) => true,
                _ => {
                    *slot = None;
                    false
                }
            },
            None => false,
        }
    }

    #[tauri::command]
    pub fn server_status(server: State<'_, LocalServer>) -> Result<ServerStatus, String> {
        let mut slot = server.0.lock().map_err(|e| e.to_string())?;
        Ok(ServerStatus {
            running: reap(&mut slot),
            available: binary().is_some(),
        })
    }

    /// Starts the Vesper server that ships with the app, so other devices can connect to this PC.
    #[tauri::command]
    pub fn server_start(
        app: AppHandle,
        server: State<'_, LocalServer>,
        port: u16,
        mode: String,
    ) -> Result<(), String> {
        let mut slot = server.0.lock().map_err(|e| e.to_string())?;
        if reap(&mut slot) {
            return Ok(());
        }
        let exe = binary().ok_or("This build of Vesper does not include the server.")?;
        let data = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("server");
        fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        let mut command = Command::new(exe);
        command
            .args([
                "--mode",
                &mode,
                "--bind",
                &format!("0.0.0.0:{port}"),
                "--data-dir",
            ])
            .arg(&data);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        *slot = Some(command.spawn().map_err(|e| e.to_string())?);
        Ok(())
    }

    #[tauri::command]
    pub fn server_stop(server: State<'_, LocalServer>) -> Result<(), String> {
        let mut slot = server.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(Running::default());

    #[cfg(desktop)]
    let builder = builder
        .manage(local_server::LocalServer::default())
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            reveal_recording,
            open_recordings_folder,
            delete_recording_file,
            local_server::server_status,
            local_server::server_start,
            local_server::server_stop
        ]);
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        start_recording,
        stop_recording,
        reveal_recording,
        open_recordings_folder,
        delete_recording_file
    ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Vesper");
    app.run(|handle, event| {
        // Do not leave the bundled server running after the app closes.
        #[cfg(desktop)]
        if let tauri::RunEvent::Exit = event {
            if let Some(server) = handle.try_state::<local_server::LocalServer>() {
                if let Ok(mut slot) = server.0.lock() {
                    if let Some(mut child) = slot.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
        #[cfg(not(desktop))]
        let _ = (handle, event);
    });
}
