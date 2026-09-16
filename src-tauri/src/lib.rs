// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::env;
use std::fs;
use std::path::PathBuf;
#[cfg(debug_assertions)]
use std::sync::mpsc::channel;
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(debug_assertions)]
use notify::{recommended_watcher, RecursiveMode, Watcher};
use tauri::path::BaseDirectory;
use tauri::window::Color;
use tauri::Manager;
use tauri::{Url, WebviewWindowBuilder};

pub mod agent;
pub mod commands;
pub mod config;
pub mod diff;
pub mod handlers;
pub mod network;
pub mod proxy;

pub use config::{Config, ConfigState};

const APP_NAME: &str = env!("CARGO_PKG_NAME");

pub static WORKSPACE_PATH: OnceLock<PathBuf> = OnceLock::new();

#[derive(Default)]
pub struct AppState {
    proxy_port: Option<u16>,
    config_state: std::sync::Arc<config::ConfigState>,
}

impl AppState {
    /// Initialize AppState with config loaded from workspace path
    pub fn new(workspace_path: PathBuf, template_path: PathBuf) -> Result<Self, String> {
        // Ensure config.yml exists by copying from template.config.yml if needed
        let _ = config::ensure_config_exists(workspace_path.clone(), template_path.clone());

        let config_state = std::sync::Arc::new(config::ConfigState::load(workspace_path)?);
        Ok(AppState {
            proxy_port: None,
            config_state,
        })
    }
}

/// Gets the workspace path (`~/.productName`) and creates the directory
/// if it does not exist. Accepts any type that implements `tauri::Manager`,
/// such as `&tauri::App` or `&tauri::AppHandle`.
pub fn get_or_create_workspace<R: tauri::Runtime, M: tauri::Manager<R>>(
    manager: &M,
) -> Result<PathBuf, String> {
    // 1. Retrieve the productName from tauri.conf.json
    let product_name = manager
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| env!("CARGO_PKG_NAME").to_string());

    // 2. Replace spaces with hyphens to make it safe for directory names
    let safe_name = product_name.replace(' ', "-");

    // 3. Resolve the HOME directory
    if let Ok(mut path) = manager.path().home_dir() {
        // 4. Append the dot-prefixed workspace folder (e.g., ~/.my-app-name)
        path.push(format!(".{}", safe_name));

        // 5. Create the directory if it doesn't exist
        if !path.exists() {
            fs::create_dir_all(&path)
                .map_err(|e| format!("Failed to create workspace directory: {}", e))?;
        }

        Ok(path)
    } else {
        Err("Could not resolve the home directory.".to_string())
    }
}

#[cfg(debug_assertions)]
fn wait_for_write_complete(path: &PathBuf, timeout_ms: u64) -> Result<(), String> {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);
    let mut last_mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map_err(|e| e.to_string())?;

    loop {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let current_mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .map_err(|e| e.to_string())?;

        if current_mtime == last_mtime {
            return Ok(()); // Write complete
        }
        last_mtime = current_mtime;

        if start.elapsed() > timeout {
            return Err("Write timeout".to_string());
        }
    }
}

#[cfg(debug_assertions)]
fn injected_js_source_path() -> PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    std::path::PathBuf::from(manifest_dir)
        .parent()
        .unwrap()
        .join("src/assets/injected.js")
}

#[cfg(debug_assertions)]
fn read_injected_script(port: u16) -> Result<String, String> {
    let path = injected_js_source_path();
    eprintln!("[tauri] Attempting to read injected.js from: {:?}", path);

    match wait_for_write_complete(&path, 5000) {
        Ok(_) => {
            let script_content = std::fs::read_to_string(&path)
                .map_err(|e| format!("failed to read {:?}: {}", path, e))?;

            // Inject proxy_port constant at the replace of the script
            let script = script_content.replacen(
                "const PROXY_PORT = 8080",
                &format!("const PROXY_PORT = {}", port),
                1,
            );

            Ok(script)
        }
        Err(err) => Err(err),
    }
}

#[cfg(debug_assertions)]
fn inject_updated_script(
    app_handle: &tauri::AppHandle,
    script: String,
    last_reload_time: Arc<Mutex<u64>>,
) {
    // Update the timestamp of successful injection
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    *last_reload_time.lock().unwrap() = now;

    let eval_script = format!(
        "(function() {{ if (window.microZoukeiInjectedState?.cleanup) {{ window.microZoukeiInjectedState.cleanup(); }} const script = {}; eval(script); }})();",
        serde_json::to_string(&script).unwrap_or_else(|_| "''".to_string())
    );

    let app_handle_cloned = app_handle.clone();
    let _ = app_handle_cloned.clone().run_on_main_thread(move || {
        if let Some(window) = app_handle_cloned.get_webview_window("main") {
            if let Err(err) = window.eval(&eval_script) {
                eprintln!("[tauri] injected script reload failed: {:?}", err);
            } else {
                println!("[tauri] reloaded injected.js from source");
            }
        } else {
            eprintln!("[tauri] main window not found for injected script reload");
        }
    });
}

#[cfg(debug_assertions)]
fn spawn_injected_js_watcher(app_handle: tauri::AppHandle, port: u16) {
    // Clone port for use in the loop (it doesn't implement Copy)
    let port_clone = port;
    let last_reload_time = Arc::new(Mutex::new(0u64));

    std::thread::spawn(move || {
        let source_path = injected_js_source_path();
        let (tx, rx) = channel();

        let mut watcher = match recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(watcher) => watcher,
            Err(err) => {
                eprintln!("[tauri] failed to start injected.js watcher: {:?}", err);
                return;
            }
        };

        if let Err(err) = watcher.configure(notify::Config::default()) {
            eprintln!("[tauri] failed to configure injected.js watcher: {:?}", err);
        }

        if let Err(err) = watcher.watch(&source_path, RecursiveMode::NonRecursive) {
            eprintln!(
                "[tauri] injected.js watcher failed to watch path: {:?}",
                err
            );
            return;
        }

        for event in rx {
            match event {
                Ok(event) => {
                    if event.paths.iter().any(|path| path == &source_path) {
                        // Debounce: check if enough time has passed since last reload
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;

                        let last_time = *last_reload_time.lock().unwrap();
                        if now - last_time < 300 {
                            eprintln!(
                                "[tauri] debouncing injected.js reload ({}ms since last reload)",
                                now - last_time
                            );
                            continue;
                        }

                        match read_injected_script(port_clone) {
                            Ok(script) => {
                                inject_updated_script(&app_handle, script, last_reload_time.clone())
                            }
                            Err(err) => {
                                eprintln!("[tauri] failed to reload injected.js: {:?}", err)
                            }
                        };
                    }
                }
                Err(err) => eprintln!("[tauri] injected.js watcher error: {:?}", err),
            }
        }
    });
}

fn webview_cache_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_cache_dir()
        .expect("[tauri] Failed to resolve cache directory, using default.")
        .join(format!("{}/webview_cache", APP_NAME))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .setup(move |app| {
            // create workspace folder
            match get_or_create_workspace(app) {
                Ok(workspace_path) => {
                    println!("Workspace path: {:?}", workspace_path);
                    // You can perform further operations using the path here
                    let _ = WORKSPACE_PATH.set(workspace_path.clone());

                    let template_yaml_path = app
                        .path()
                        .resolve("template.config.yml", BaseDirectory::Resource)?;

                    // Initialize config state
                    let mut state = app_state.lock().unwrap();
                    *state = AppState::new(workspace_path.clone(), template_yaml_path)?;
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                }
            }

            // Start proxy and block until its port is ready
            let cache_dir = webview_cache_dir(app.handle());
            let proxy_cache_dir = cache_dir.clone();
            let port: u16;
            match proxy::start_proxy(proxy_cache_dir) {
                Ok(p) => {
                    port = p;
                    println!("[tauri] Proxy started on port: {}", p);
                    let mut state = app_state.lock().unwrap();
                    state.proxy_port = Some(p);
                    // Clone port for use in read_injected_script (it doesn't implement Copy)
                    let port_clone = p;
                    let init_script = read_injected_script(port_clone).unwrap_or_else(|_| {
                        eprintln!("[tauri] Failed to read injected.js, using empty script.");
                        String::new()
                    });

                    // Navigation URL is now determined by the proxy port from the start, bypassing frontend readiness checks
                    let final_url = format!("http://127.0.0.1:{}/", port);
                    println!(
                        "[tauri] Initial navigation targeting local proxy: {}",
                        final_url
                    );

                    WebviewWindowBuilder::new(
                        app,
                        "main",
                        tauri::WebviewUrl::External(Url::parse(&final_url).unwrap()),
                    )
                    .title("microZoukei")
                    .inner_size(1280.0, 800.0)
                    .data_directory(cache_dir.clone())
                    .resizable(true)
                    .decorations(true)
                    .background_color(Color(15, 23, 42, 255))
                    .initialization_script(init_script)
                    .build()?;
                }
                Err(e) => {
                    eprintln!("[tauri] Failed to start proxy: {}", e);
                    return Err(std::io::Error::other(e.to_string()).into());
                }
            }

            #[cfg(debug_assertions)]
            spawn_injected_js_watcher(app.handle().clone(), port);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
