//! Server plugins: small programs in any language that live in `<data dir>/plugins/<id>/`.
//!
//! A plugin is a folder with a `plugin.json` manifest and whatever it needs to run. The server
//! starts the plugin's `command` when something it asked for (a *hook*) happens, writes one JSON
//! object to its standard input and reads JSON from its standard output:
//!
//! ```text
//! in:  { "hook": "resolve", "data": { ... }, "config": { ... } }
//! out: whatever that hook documents (see docs/EXTENDING.md)
//! ```
//!
//! Hooks:
//! - `download.created` and `item.finished`: events. The output is ignored.
//! - `resolve`: turns an address into one the server can download (supports a new site).
//! - `http`: serves `/api/v1/x/<plugin id>/...`, so a plugin can add its own API endpoints.
//!
//! Plugins are code the admin put on the server and switched on, so they run with the server's own
//! permissions. They start off, and each one is run with a time limit and a capped output.

use std::{
    path::{Component, Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{io::AsyncWriteExt, process::Command, sync::Semaphore};

use crate::state::AppState;

pub const HOOKS: &[&str] = &["download.created", "item.finished", "resolve", "http"];
const MAX_OUTPUT: usize = 1024 * 1024;
const DEFAULT_TIMEOUT: u64 = 15;
const MAX_TIMEOUT: u64 = 120;

/// At most this many plugin processes run at once, so a burst of events cannot flood the machine.
static SLOTS: Semaphore = Semaphore::const_new(4);

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    /// The hooks this plugin wants, from `HOOKS`.
    #[serde(default)]
    pub hooks: Vec<String>,
    /// The program and its arguments, run from the plugin's folder. `./run.py` means a file in it.
    pub command: Vec<String>,
    /// Seconds a single run may take (default 15, at most 120).
    #[serde(default)]
    pub timeout: Option<u64>,
}

#[derive(Clone, Debug)]
pub struct Plugin {
    pub manifest: Manifest,
    pub dir: PathBuf,
}

pub fn dir(state: &AppState) -> PathBuf {
    state.config.data_dir.join("plugins")
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

/// Why a manifest cannot be used, if it cannot.
pub fn check(manifest: &Manifest) -> Result<(), String> {
    if !valid_id(&manifest.id) {
        return Err("id may only use a-z, 0-9, dot, dash and underscore".into());
    }
    if manifest.name.trim().is_empty() {
        return Err("name is empty".into());
    }
    let Some(program) = manifest.command.first().filter(|c| !c.is_empty()) else {
        return Err("command is empty".into());
    };
    if Path::new(program)
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("command may not leave the plugin folder".into());
    }
    if let Some(bad) = manifest.hooks.iter().find(|h| !HOOKS.contains(&h.as_str())) {
        return Err(format!("unknown hook \"{bad}\""));
    }
    Ok(())
}

/// Every plugin folder, and the folders that could not be read (with the reason).
pub fn discover(state: &AppState) -> (Vec<Plugin>, Vec<(String, String)>) {
    let (mut found, mut broken) = (Vec::new(), Vec::new());
    let Ok(entries) = std::fs::read_dir(dir(state)) else {
        return (found, broken);
    };
    let mut folders: Vec<_> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    folders.sort();
    for folder in folders {
        let name = folder
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let parsed = std::fs::read_to_string(folder.join("plugin.json"))
            .map_err(|_| "no plugin.json".to_string())
            .and_then(|t| {
                serde_json::from_str::<Manifest>(&t).map_err(|e| format!("plugin.json: {e}"))
            })
            .and_then(|m| check(&m).map(|_| m));
        match parsed {
            Ok(manifest) if manifest.id == name => found.push(Plugin {
                manifest,
                dir: folder,
            }),
            Ok(manifest) => broken.push((
                name,
                format!("folder name must match the id \"{}\"", manifest.id),
            )),
            Err(why) => broken.push((name, why)),
        }
    }
    (found, broken)
}

pub fn enabled(state: &AppState, id: &str) -> bool {
    state.db.setting(&format!("plugin.{id}.enabled"), "false") == "true"
}

pub fn config(state: &AppState, id: &str) -> Value {
    serde_json::from_str(&state.db.setting(&format!("plugin.{id}.config"), "{}"))
        .unwrap_or_else(|_| json!({}))
}

pub fn find(state: &AppState, id: &str) -> Option<Plugin> {
    discover(state).0.into_iter().find(|p| p.manifest.id == id)
}

/// Plugins that are switched on and asked for `hook`.
pub fn listening(state: &AppState, hook: &str) -> Vec<Plugin> {
    discover(state)
        .0
        .into_iter()
        .filter(|p| p.manifest.hooks.iter().any(|h| h == hook) && enabled(state, &p.manifest.id))
        .collect()
}

fn program(plugin: &Plugin) -> PathBuf {
    let first = &plugin.manifest.command[0];
    let local = plugin.dir.join(first);
    // A file inside the plugin's folder wins over something of the same name on the PATH.
    if local.is_file() {
        local
    } else {
        PathBuf::from(first)
    }
}

/// Runs the plugin once for `hook` and returns what it printed.
pub async fn run(
    state: &AppState,
    plugin: &Plugin,
    hook: &str,
    data: Value,
) -> Result<String, String> {
    let Ok(_slot) = SLOTS.acquire().await else {
        return Err("the plugin runner is shutting down".into());
    };
    let limit = plugin
        .manifest
        .timeout
        .unwrap_or(DEFAULT_TIMEOUT)
        .clamp(1, MAX_TIMEOUT);
    let input = json!({ "hook": hook, "data": data, "config": config(state, &plugin.manifest.id) });
    let mut command = Command::new(program(plugin));
    command
        .args(&plugin.manifest.command[1..])
        .current_dir(&plugin.dir)
        .env("VESPER_PLUGIN_ID", &plugin.manifest.id)
        .env("VESPER_DATA_DIR", &state.config.data_dir)
        .env(
            "VESPER_API",
            format!(
                "http://{}",
                state.config.listen_addr().replace("0.0.0.0", "127.0.0.1")
            ),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|e| format!("could not start {}: {e}", plugin.manifest.command[0]))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.to_string().as_bytes()).await;
    }
    let output = tokio::time::timeout(Duration::from_secs(limit), child.wait_with_output())
        .await
        .map_err(|_| format!("took longer than {limit} seconds"))?
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "exited with {}: {}",
            output.status,
            err.trim().chars().take(300).collect::<String>()
        ));
    }
    let mut text = output.stdout;
    text.truncate(MAX_OUTPUT);
    Ok(String::from_utf8_lossy(&text).into_owned())
}

/// Tells every plugin that listens for `event`. Fire and forget; failures go to the activity log.
pub fn emit(
    state: &AppState,
    runtime: Option<tokio::runtime::Handle>,
    event: &'static str,
    payload: Value,
) {
    let plugins = listening(state, event);
    if plugins.is_empty() {
        return;
    }
    let Some(handle) = runtime.or_else(|| tokio::runtime::Handle::try_current().ok()) else {
        return;
    };
    for plugin in plugins {
        let (state, payload) = (state.clone(), payload.clone());
        handle.spawn(async move {
            if let Err(why) = run(&state, &plugin, event, payload).await {
                state.db.audit(
                    "plugin",
                    "plugin.error",
                    &format!("{}: {event}: {why}", plugin.manifest.id),
                );
            }
        });
    }
}

/// What a `resolve` plugin answers: the address to download instead, and optionally how.
#[derive(Debug, Deserialize)]
pub struct Resolved {
    pub url: String,
    #[serde(default)]
    pub title: Option<String>,
    /// `direct` or `ytdlp`; leave out to let the server decide.
    #[serde(default)]
    pub engine: Option<String>,
}

/// Asks the plugins, in order, whether one of them knows how to download `url`.
pub async fn resolve(state: &AppState, url: &str) -> Option<(String, Resolved)> {
    for plugin in listening(state, "resolve") {
        match run(state, &plugin, "resolve", json!({ "url": url })).await {
            Ok(text) if text.trim().is_empty() || text.trim() == "null" => {}
            Ok(text) => match serde_json::from_str::<Resolved>(&text) {
                Ok(found) if found.url.starts_with("http") => {
                    return Some((plugin.manifest.id.clone(), found))
                }
                Ok(_) => state.db.audit(
                    "plugin",
                    "plugin.error",
                    &format!("{}: resolve gave a non-web address", plugin.manifest.id),
                ),
                Err(e) => state.db.audit(
                    "plugin",
                    "plugin.error",
                    &format!("{}: resolve output: {e}", plugin.manifest.id),
                ),
            },
            Err(why) => state.db.audit(
                "plugin",
                "plugin.error",
                &format!("{}: resolve: {why}", plugin.manifest.id),
            ),
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(json: &str) -> Manifest {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_good_manifest_passes() {
        let m = manifest(
            r#"{"id":"ntfy-notify","name":"ntfy","hooks":["item.finished"],"command":["./run.py"]}"#,
        );
        assert!(check(&m).is_ok());
    }

    #[test]
    fn bad_manifests_say_why() {
        let bad_id = manifest(r#"{"id":"Has Space","name":"x","command":["a"]}"#);
        assert!(check(&bad_id).unwrap_err().contains("id"));
        let escape = manifest(r#"{"id":"x","name":"x","command":["../evil"]}"#);
        assert!(check(&escape).unwrap_err().contains("plugin folder"));
        let hook = manifest(r#"{"id":"x","name":"x","hooks":["nope"],"command":["a"]}"#);
        assert!(check(&hook).unwrap_err().contains("unknown hook"));
        let none = manifest(r#"{"id":"x","name":"x","command":[]}"#);
        assert!(check(&none).is_err());
    }

    #[test]
    fn hooks_are_the_documented_ones() {
        assert_eq!(
            HOOKS,
            &["download.created", "item.finished", "resolve", "http"]
        );
    }
}
