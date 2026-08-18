// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::env;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
#[cfg(debug_assertions)]
use std::sync::mpsc::channel;

use tauri::{Url, WebviewWindowBuilder};
use tauri::window::Color;
use tauri::Manager;
#[cfg(debug_assertions)]
use notify::{recommended_watcher, Config, RecursiveMode, Watcher};

pub mod network;
pub mod proxy;
pub mod commands;
pub mod handlers;

const APP_NAME: &str = env!("CARGO_PKG_NAME");

#[derive(Default)]
pub struct AppState {
    proxy_port: Option<u16>,
}

#[tauri::command]
async fn send_chat_prompt(
    window: tauri::WebviewWindow,
    message: String,
    app_state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    println!("[CHAT RECEIVED] {}", message);

    let client = network::NetworkClient::new();
    let port = app_state.lock().map_err(|e| e.to_string())?
        .proxy_port
        .map(|p| p.to_string())
        .unwrap_or_else(|| "8080".to_string());

    let url = format!("http://127.0.0.1:{}/v1/chat", port);
    let body = serde_json::json!({ "message": message });

    match client.send_request(reqwest::Method::POST, &url, Some(body)).await {
        Ok(response) => {
            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            let reply: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;

            let script = format!(
                "if (window.microZoukeiReceiveResponse) {{ window.microZoukeiReceiveResponse({}); }}",
                serde_json::to_string(&reply).map_err(|e| e.to_string())?
            );
            window.eval(&script).map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            eprintln!("[tauri] network error: {:?}", e);
            Err(format!("Network error: {}", e))
        }
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
    std::path::PathBuf::from(manifest_dir).parent().unwrap().join("src/assets/injected.js")
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
fn inject_updated_script(app_handle: &tauri::AppHandle, script: String) {
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

        if let Err(err) = watcher.configure(Config::default()) {
            eprintln!("[tauri] failed to configure injected.js watcher: {:?}", err);
        }

        if let Err(err) = watcher.watch(&source_path, RecursiveMode::NonRecursive) {
            eprintln!("[tauri] injected.js watcher failed to watch path: {:?}", err);
            return;
        }

        for event in rx {
            match event {
                Ok(event) => {
                    if event.paths.iter().any(|path| path == &source_path) {
                        match read_injected_script(port_clone) {
                            Ok(script) => inject_updated_script(&app_handle, script),
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
    app_handle.path().app_cache_dir()
        .expect("[tauri] Failed to resolve cache directory, using default.")
        .join(format!("{}/webview_cache", APP_NAME))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![send_chat_prompt])
        .setup(move |app| {
            let cache_dir = webview_cache_dir(app.handle());
            // Start proxy and block until its port is ready
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
                    println!("[tauri] Initial navigation targeting local proxy: {}", final_url);

                    WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(Url::parse(&final_url).unwrap()))
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
