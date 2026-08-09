// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
#[cfg(debug_assertions)]
use std::sync::mpsc::channel;
use tauri::{Emitter, Url, WebviewWindowBuilder};
use tauri::window::Color;
use tauri::Manager;
#[cfg(debug_assertions)]
use notify::{recommended_watcher, Config, RecursiveMode, Watcher};

pub mod network;
pub mod proxy;
pub mod commands;

#[derive(Default)]
pub struct NavigationState {
    frontend_ready: bool,
    pending_url: Option<String>,
}

#[derive(Default)]
pub struct AppState {
    proxy_port: Option<u16>,
}

#[tauri::command]
fn mz_frontend_ready(
    app_handle: tauri::AppHandle,
    navigation_state: tauri::State<'_, Arc<Mutex<NavigationState>>>,
) -> Result<(), String> {
    let pending_url = {
        let mut state = navigation_state
            .lock()
            .map_err(|e| e.to_string())?;
        state.frontend_ready = true;
        state.pending_url.take()
    };

    if let Some(url_string) = pending_url {
        let url = Url::parse(&url_string).map_err(|e| e.to_string())?;
        let app_handle_clone = app_handle.clone();
        let url_string_clone = url_string.clone();
        app_handle.run_on_main_thread(move || {
            if let Some(window) = app_handle_clone.get_webview_window("main") {
                if let Err(e) = window.navigate(url) {
                    eprintln!("[tauri] navigate failed: {:?}", e);
                } else {
                    let _ = app_handle_clone.emit("proxy-ready", url_string_clone.clone());
                }
            } else {
                eprintln!("[tauri] main window not found for navigation");
            }
        }).map_err(|e| e.to_string())?;
    }

    Ok(())
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
fn injected_js_source_path() -> PathBuf {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    std::path::PathBuf::from(manifest_dir).parent().unwrap().join("src/assets/injected.js")
}

#[cfg(debug_assertions)]
fn read_injected_script() -> Result<String, String> {
    let path = injected_js_source_path();
    eprintln!("[tauri] Attempting to read injected.js from: {:?}", path);
    std::fs::read_to_string(&path).map_err(|e| format!("failed to read {:?}: {}", path, e))
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
fn spawn_injected_js_watcher(app_handle: tauri::AppHandle) {
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

        let debounce = std::time::Duration::from_millis(500);
        let mut last_reload = std::time::Instant::now() - debounce;

        for event in rx {
            let now = std::time::Instant::now();
            if now.duration_since(last_reload) < debounce {
                continue;
            }

            match event {
                Ok(event) => {
                    if event.paths.iter().any(|path| path == &source_path) {
                        last_reload = now;
                        // A brief buffer to wait for the file writing to complete (avoiding race conditions)
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        match read_injected_script() {
                            Ok(script) => inject_updated_script(&app_handle, script),
                            Err(err) => eprintln!("[tauri] failed to reload injected.js: {}", err),
                        }
                    }
                }
                Err(err) => {
                    eprintln!("[tauri] injected.js watch error: {:?}", err);
                }
            }
        }
    });
}

fn webview_cache_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("webview-cache")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![send_chat_prompt, mz_frontend_ready])
        .setup(move |app| {
            let cache_dir = webview_cache_dir(app.handle());
            let init_script = include_str!("../../src/assets/injected.js");

            // Start proxy and block until its port is ready
            let proxy_cache_dir = cache_dir.clone();
            match proxy::start_proxy(proxy_cache_dir) {
                Ok(port) => {
                    println!("[tauri] Proxy started on port: {}", port);
                    let mut state = app_state.lock().unwrap();
                    state.proxy_port = Some(port);

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
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()).into());
                }
            }

            #[cfg(debug_assertions)]
            spawn_injected_js_watcher(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
