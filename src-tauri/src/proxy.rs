use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::{fs, time::Duration};

use crate::commands::dispatch_command;
use crate::handlers::CommandPayload;
use blake3;
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use mime_guess::MimeGuess;
use serde_json::json;
use std::time::SystemTime;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::Message as TungMessage;
use warp::ws::Ws;
use warp::{http::Response as WarpResponse, hyper::StatusCode, Filter};

/*
 A function that forces the copying of past localStorage data to
 the new port even if the dynamic port changes
*/
fn migrate_local_storage(cache_dir: &Path, new_port: u16) {
    // Path to the Local Storage folder in Tauri/WebView2
    let storage_dir = cache_dir.join("localstorage");
    if !storage_dir.exists() {
        return;
    }

    // A text file that records the previous port number
    // (it will be created if it doesn't exist)
    let last_port_file = cache_dir.join("last_port.txt");

    // 1. Read the port number from the previous session
    if let Ok(last_port_str) = fs::read_to_string(&last_port_file) {
        let last_port = last_port_str.trim();
        let new_port_str = new_port.to_string();

        // Perform the copy operation only if the port number has changed.
        if last_port != new_port_str {
            println!(
                "[proxy] Detect port changes: {} -> {}",
                last_port, new_port_str
            );

            // List of 3 file extensions to copy
            let extensions = vec![
                ".localstorage".to_string(),
                ".localstorage-shm".to_string(),
                ".localstorage-wal".to_string(),
            ];

            for ext in extensions {
                let old_filename = format!("http_127.0.0.1_{}{}", last_port, ext);
                let old_file_path = storage_dir.join(&old_filename);
                if old_file_path.exists() {
                    let new_filename = format!("http_127.0.0.1_{}{}", new_port_str, ext);
                    let new_file_path = storage_dir.join(new_filename);

                    // Copy (duplicate) the entire set of historical data as a new port name
                    if let Err(e) = fs::copy(&old_file_path, &new_file_path) {
                        eprintln!("[proxy] ❌ Failed to copy localStorage: {}", e);
                    } else {
                        println!("[proxy] 📄 The file has been copied.: {}", old_filename);

                        // Once the copy is complete, delete the old files that are no longer needed.
                        if let Err(e) = fs::remove_file(&old_file_path) {
                            eprintln!(
                                "[proxy] ⚠️ Failed to delete old files: {}, Reason: {}",
                                old_filename, e
                            );
                        } else {
                            println!(
                                "[proxy] 🧹 I deleted some old junk files.: {}",
                                old_filename
                            );
                        }
                    }
                }
            }
        }
    }

    // 2. Save this new port number for future comparison.
    let _ = fs::write(&last_port_file, new_port.to_string());
}

fn proxy_origin(headers: &warp::http::HeaderMap) -> String {
    if let Some(host) = headers.get(http::header::HOST) {
        if let Ok(host_str) = host.to_str() {
            if host_str.contains("127.0.0.1") || host_str.contains("localhost") {
                return "https://microstudio.dev".to_string();
            }
            return format!("http://{}", host_str);
        }
    }
    "https://microstudio.dev".to_string()
}

fn ws_proxy_origin(origin: &str) -> String {
    if origin.starts_with("https://") {
        origin.replacen("https://", "wss://", 1)
    } else if origin.starts_with("http://") {
        origin.replacen("http://", "ws://", 1)
    } else {
        origin.to_string()
    }
}

fn should_cache_content_type(content_type: &str) -> bool {
    let normalized = content_type.to_lowercase();
    normalized.starts_with("image/")
        || normalized.starts_with("font/")
        || normalized.contains("css")
        || normalized.contains("javascript")
        || normalized.contains("markdown")
}

fn should_rewrite_content_type(content_type: &str) -> bool {
    let normalized = content_type.to_lowercase();
    normalized.starts_with("text/")
        || normalized.contains("javascript")
        || normalized.contains("json")
        || normalized.contains("xml")
        || normalized.contains("css")
}

fn rewrite_proxy_document(body: &[u8], origin: &str) -> Vec<u8> {
    if let Ok(text) = String::from_utf8(body.to_vec()) {
        let ws_origin = ws_proxy_origin(origin);
        let rewritten = text
            .replace("https://microstudio.dev", origin)
            .replace("https://www.microstudio.dev", origin)
            .replace("wss://microstudio.dev", &ws_origin)
            .replace("//microstudio.dev", origin)
            .replace("//www.microstudio.dev", origin);
        rewritten.into_bytes()
    } else {
        body.to_vec()
    }
}

const MAX_CACHE_BYTES: u64 = 200 * 1024 * 1024; // 200 MB

fn enable_proxy_cache() -> bool {
    if cfg!(not(debug_assertions)) {
        true
    } else {
        std::env::var("MICROZOUKEI_PROXY_CACHE")
            .map(|v| matches!(v.as_str(), "1" | "true" | "True" | "TRUE"))
            .unwrap_or(false)
    }
}

// Start a local reverse proxy that caches certain responses on disk.
// Returns the selected port (u16) on success.
pub fn start_proxy(cache_dir: PathBuf) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    // ensure cache dir exists
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir)?;
    }

    let cache_dir = Arc::new(cache_dir);

    // use mpsc channel to receive the chosen port from the server thread
    let (tx, rx) = mpsc::channel();

    // simple in-memory cookie store to maintain upstream session cookies
    let cookie_store: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));
    // try to load persisted cookies
    {
        let cookie_file = cache_dir.join("cookies.json");
        if cookie_file.exists() {
            if let Ok(s) = fs::read_to_string(&cookie_file) {
                if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&s) {
                    let mut store = cookie_store.lock().unwrap();
                    *store = map;
                    println!("[proxy] loaded {} cookies from disk", store.len());
                }
            }
        }
    }
    let cd = cache_dir.clone();
    let cs = cookie_store.clone();
    std::thread::spawn(move || {
        // build a runtime for the server in this thread
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[proxy] failed to build runtime: {}", e);
                let _ = tx.send(0u16);
                return;
            }
        };

        rt.block_on(async move {
            // build route inside runtime/thread to avoid cross-runtime issues
            let cache_dir_filter = warp::any().map(move || cd.clone());
            let cookie_store_filter = warp::any().map(move || cs.clone());
            // debug status endpoint
            let status_route = warp::path!("__microzoukei_cache_status")
                .and(cache_dir_filter.clone())
                .and_then(handle_cache_status);
            // New API command route (must be before general HTTP route)
            let api_command_route = warp::path!("api" / "command")
                .and(warp::body::json())
                .and_then(|payload: CommandPayload| async move {
                    let response = dispatch_command(payload).await;
                    Ok::<_, warp::Rejection>(warp::reply::json(&response))
                });
            // WebSocket route: accept ws upgrades and proxy to upstream wss
            let ws_route = warp::path::full()
                .and(warp::header::headers_cloned())
                .and(
                    warp::query::raw()
                        .or_else(|_| async { Ok::<(String,), warp::Rejection>((String::new(),)) }),
                )
                .and(warp::ws())
                .and(cookie_store_filter.clone())
                .and_then(handle_ws_upgrade);
            // HTTP route (catches everything else, including /api/command if not matched above)
            let http_route = warp::any()
                .and(warp::method())
                .and(warp::header::headers_cloned())
                .and(warp::path::full())
                .and(
                    warp::query::raw()
                        .or_else(|_| async { Ok::<(String,), warp::Rejection>((String::new(),)) }),
                )
                .and(cache_dir_filter.clone())
                .and(cookie_store_filter.clone())
                .and_then(handle_request);

            let route = status_route
                .or(api_command_route)
                .or(ws_route)
                .or(http_route);

            // bind to ephemeral port inside runtime
            let (addr, server) = warp::serve(route).bind_ephemeral(([127, 0, 0, 1], 0));
            let port = addr.port();
            let _ = tx.send(port);
            println!("[proxy] started on http://127.0.0.1:{}", port);

            server.await;
        });
    });

    // wait a short time for the server thread to send the port
    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(p) if p != 0 => {
            migrate_local_storage(&cache_dir, p);
            Ok(p)
        }
        Ok(_) | Err(_) => Err("proxy failed to start".into()),
    }
}

fn prune_cache(cache_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // compute total size of .body files
    let mut entries: Vec<(PathBuf, u64, SystemTime)> = Vec::new();
    let mut total: u64 = 0;
    for entry in fs::read_dir(cache_dir)? {
        let p = entry?.path();
        if let Some(ext) = p.extension() {
            if ext == "body" {
                if let Ok(md) = fs::metadata(&p) {
                    let sz = md.len();
                    let mtime = md.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                    entries.push((p.clone(), sz, mtime));
                    total += sz;
                }
            }
        }
    }
    if total <= MAX_CACHE_BYTES {
        return Ok(());
    }
    // sort by mtime ascending (oldest first)
    entries.sort_by_key(|e| e.2);
    for (p, sz, _t) in entries {
        if total <= MAX_CACHE_BYTES {
            break;
        }
        // remove body and meta
        let meta = p.with_extension("meta.json");
        let _ = fs::remove_file(&p);
        let _ = fs::remove_file(&meta);
        total = total.saturating_sub(sz);
        println!("[proxy] evicted cache file: {}", p.display());
    }
    Ok(())
}

async fn handle_cache_status(cache_dir: Arc<PathBuf>) -> Result<impl warp::Reply, warp::Rejection> {
    let mut items = Vec::new();
    let mut total: u64 = 0;
    if let Ok(read_dir) = fs::read_dir(&*cache_dir) {
        for e in read_dir.flatten() {
            let p = e.path();
            if let Some(ext) = p.extension() {
                if ext == "body" {
                    if let Ok(md) = fs::metadata(&p) {
                        let sz = md.len();
                        total += sz;
                        let key = p
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or_default()
                            .to_string();
                        items
                            .push(json!({"key": key, "path": p.display().to_string(), "size": sz}));
                    }
                }
            }
        }
    }
    let resp = json!({"total_bytes": total, "items": items});
    Ok(warp::reply::json(&resp))
}

async fn handle_request(
    method: warp::http::Method,
    headers: warp::http::HeaderMap,
    full_path: warp::path::FullPath,
    raw_query: String,
    cache_dir: Arc<PathBuf>,
    cookie_store: Arc<Mutex<HashMap<String, String>>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    // Build upstream URL
    let path = full_path.as_str();

    // Serve embedded ServiceWorker script for same-origin registration
    if path == "/__microzoukei_sw.js" && method == warp::http::Method::GET {
        let sw = r#"
const CACHE_NAME = 'microzoukei-sw-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
    if (e.request.mode === 'navigate') {
        e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match('/'))));
        return;
    }
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
"#;
        let response = WarpResponse::builder()
            .status(StatusCode::OK)
            .header("content-type", "application/javascript")
            .body(sw.as_bytes().to_vec());
        return Ok(response);
    }
    // Serve local assets first (cache or pre-placed files)
    let mut local_path = cache_dir.join(path);
    if local_path.to_string_lossy().starts_with('/') {
        local_path = cache_dir.join(path.trim_start_matches('/'));
    }

    if local_path.exists() {
        if let Ok(bytes) = fs::read(&local_path) {
            let content_type = MimeGuess::from_path(&local_path)
                .first_raw()
                .unwrap_or("application/octet-stream");

            let builder = WarpResponse::builder()
                .status(StatusCode::OK)
                .header("content-type", content_type);

            // Add some headers to prevent issues with local files
            let response = builder.body(bytes.to_vec());
            println!("[proxy] serving local asset: {}", path);
            return Ok(response);
        }
    }

    let mut upstream = format!("https://microstudio.dev{}", path);
    if !raw_query.is_empty() {
        upstream.push('?');
        upstream.push_str(&raw_query);
    }

    // compute cache key - normalize by removing query parameters for cacheable resources
    // to avoid cache misses due to cache-busting query params (e.g., ?v=timestamp)
    let cache_key_url = {
        let mut url = upstream.clone();
        if let Some(query_pos) = url.find('?') {
            // Check if the path suggests a static asset that should ignore query params
            let path_part = &url[..query_pos];
            let is_likely_static_asset = path_part.ends_with(".png")
                || path_part.ends_with(".jpg")
                || path_part.ends_with(".jpeg")
                || path_part.ends_with(".gif")
                || path_part.ends_with(".webp")
                || path_part.ends_with(".svg")
                || path_part.ends_with(".ico")
                || path_part.ends_with(".woff")
                || path_part.ends_with(".woff2")
                || path_part.ends_with(".ttf")
                || path_part.ends_with(".eot")
                || path_part.ends_with(".css")
                || path_part.ends_with(".js")
                || path_part.ends_with(".map");
            if is_likely_static_asset {
                url = path_part.to_string();
            }
        }
        url
    };
    let key = blake3::hash(cache_key_url.as_bytes()).to_hex().to_string();
    let body_path = cache_dir.join(format!("{}.body", key));
    let meta_path = cache_dir.join(format!("{}.meta.json", key));

    if enable_proxy_cache() && body_path.exists() && meta_path.exists() {
        if let Ok(bytes) = fs::read(&body_path) {
            if let Ok(meta_raw) = fs::read_to_string(&meta_path) {
                // meta contains minimal JSON with content_type and status
                if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&meta_raw) {
                    let status = meta.get("status").and_then(|s| s.as_u64()).unwrap_or(200) as u16;
                    let content_type = meta
                        .get("content_type")
                        .and_then(|c| c.as_str())
                        .unwrap_or("application/octet-stream");

                    let mut builder = WarpResponse::builder()
                        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK));
                    builder = builder.header("content-type", content_type);
                    // return cached body
                    let response = builder.body(bytes);
                    println!("[proxy] cache hit: {}", upstream);
                    return Ok(response);
                }
            }
        }
    }

    println!("[proxy] cache miss, fetching upstream: {}", upstream);

    // forward selected headers (user-agent) and include cookies from server-side store
    let client = reqwest::Client::new();
    // convert warp/http Method to reqwest::Method
    let req_method =
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut req = client.request(req_method, &upstream);
    if let Some(val) = headers.get("user-agent") {
        if let Ok(s) = val.to_str() {
            req = req.header("user-agent", s);
        }
    }

    if let Some(val) = headers.get("origin") {
        if let Ok(s) = val.to_str() {
            req = req.header("origin", s);
        }
    }
    if let Some(val) = headers.get("referer") {
        if let Ok(s) = val.to_str() {
            req = req.header("referer", s);
        }
    }

    // build Cookie header from server-side cookie_store
    let cookie_header = {
        let store = cookie_store.lock().unwrap();
        if store.is_empty() {
            None
        } else {
            let s = store.values().cloned().collect::<Vec<_>>().join("; ");
            Some(s)
        }
    };
    if let Some(ch) = cookie_header {
        req = req.header("cookie", ch);
    } else if let Some(val) = headers.get("cookie") {
        // fall back to client's cookie header if present
        if let Ok(s) = val.to_str() {
            req = req.header("cookie", s);
        }
    }

    // perform upstream request
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[proxy] upstream request failed: {}", e);
            return Ok(WarpResponse::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(format!("upstream error: {}", e).into()));
        }
    };

    let status = resp.status().as_u16();
    let headers_map = resp.headers().clone();
    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[proxy] reading upstream body failed: {}", e);
            return Ok(WarpResponse::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(format!("upstream read error: {}", e).into()));
        }
    };

    // determine content-type
    let content_type = headers_map
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| {
            MimeGuess::from_path(path)
                .first_raw()
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let host_origin = proxy_origin(&headers);
    let final_bytes = if should_rewrite_content_type(&content_type) {
        rewrite_proxy_document(&bytes, &host_origin)
    } else {
        bytes.to_vec()
    };

    // decide whether to cache (simple rule)
    if enable_proxy_cache() && should_cache_content_type(&content_type) {
        // write body and meta atomically
        let _ = fs::write(&body_path, &final_bytes);
        let meta = serde_json::json!({
            "status": status,
            "content_type": content_type,
            "fetched_at": Utc::now().to_rfc3339(),
        });
        let _ = fs::write(&meta_path, serde_json::to_string(&meta).unwrap_or_default());
        println!("[proxy] cached: {} -> {}", upstream, body_path.display());
        // prune cache if over limit
        if let Err(e) = prune_cache(&cache_dir) {
            eprintln!("[proxy] prune_cache failed: {}", e);
        }
    }

    let mut synthesized_set_cookie: Vec<String> = Vec::new();
    for (name, val) in headers_map.iter() {
        if name == reqwest::header::SET_COOKIE {
            if let Ok(s) = val.to_str() {
                // parse name=value
                if let Some(pair) = s.split(';').next() {
                    if let Some((k, v)) = pair.split_once('=') {
                        let k = k.trim().to_string();
                        let v = v.trim().to_string();
                        let mut store = cookie_store.lock().unwrap();
                        store.insert(k.clone(), format!("{}={}", k, v));
                        // synthesize a minimal Set-Cookie for the proxy origin so browser stores it
                        synthesized_set_cookie.push(format!("{}={}; Path=/", k, v));
                        println!("[proxy] stored cookie: {}", k);
                        // persist cookie store
                        let cookie_file = cache_dir.join("cookies.json");
                        if let Ok(s) = serde_json::to_string(&*store) {
                            let _ = fs::write(&cookie_file, s);
                        }
                    }
                }
            }
        }
    }

    // build response with upstream headers we care about
    let mut builder =
        WarpResponse::builder().status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK));
    if let Some(ct) = headers_map.get(reqwest::header::CONTENT_TYPE) {
        if let Ok(s) = ct.to_str() {
            builder = builder.header("content-type", s);
        }
    }
    if let Some(cc) = headers_map.get(reqwest::header::CACHE_CONTROL) {
        if let Ok(s) = cc.to_str() {
            builder = builder.header("cache-control", s);
        }
    }

    // attach synthesized Set-Cookie headers for client
    let mut builder2 = builder;
    for sc in synthesized_set_cookie.iter() {
        builder2 = builder2.header("set-cookie", sc.as_str());
    }

    let response = builder2.body(final_bytes);
    Ok(response)
}

async fn handle_ws_upgrade(
    full_path: warp::path::FullPath,
    headers: warp::http::HeaderMap,
    raw_query: String,
    ws: Ws,
    cookie_store: Arc<Mutex<HashMap<String, String>>>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let path = full_path.as_str();
    let mut upstream = format!("wss://microstudio.dev{}", path);
    if !raw_query.is_empty() {
        upstream.push('?');
        upstream.push_str(&raw_query);
    }

    let headers_cloned = headers.clone();

    Ok(
        ws.on_upgrade(move |client_ws: warp::ws::WebSocket| async move {
            let headers = headers_cloned;
            println!("[proxy] ws upgrade requested: {}", upstream);
            let cookie_header = {
                let store = cookie_store.lock().unwrap();
                if store.is_empty() {
                    None
                } else {
                    Some(store.values().cloned().collect::<Vec<_>>().join("; "))
                }
            };

            match upstream.clone().into_client_request() {
                Ok(mut client_req) => {
                    if let Some(ch) = cookie_header {
                        client_req
                            .headers_mut()
                            .insert("cookie", ch.parse().unwrap());
                    }

                    for (name, value) in headers {
                        if let Some(n) = name {
                            let name_str = n.to_string();
                            if name_str != "host" && name_str != "content-length" {
                                if let Ok(s) = value.to_str() {
                                    if let Ok(new_name) =
                                        reqwest::header::HeaderName::from_bytes(name_str.as_bytes())
                                    {
                                        client_req
                                            .headers_mut()
                                            .insert(new_name, s.parse().unwrap());
                                    }
                                }
                            }
                        }
                    }

                    println!("[proxy] forwarding headers to upstream");

                    match connect_async(client_req).await {
                        Ok((upstream_ws, resp)) => {
                            println!(
                                "[proxy] ws connected upstream: {} (status: {})",
                                upstream,
                                resp.status()
                            );
                            let (mut client_sink, mut client_stream) = client_ws.split();
                            let (mut upstream_sink, mut upstream_stream) = upstream_ws.split();

                            let c_to_u = async {
                                while let Some(Ok(msg)) = client_stream.next().await {
                                    let tmsg = if msg.is_text() {
                                        TungMessage::Text(
                                            msg.to_str().unwrap_or_default().to_string(),
                                        )
                                    } else if msg.is_binary() {
                                        TungMessage::Binary(msg.as_bytes().to_vec())
                                    } else if msg.is_close() {
                                        TungMessage::Close(None)
                                    } else if msg.is_ping() {
                                        TungMessage::Ping(msg.as_bytes().to_vec())
                                    } else if msg.is_pong() {
                                        TungMessage::Pong(msg.as_bytes().to_vec())
                                    } else {
                                        TungMessage::Binary(msg.as_bytes().to_vec())
                                    };
                                    if upstream_sink.send(tmsg).await.is_err() {
                                        break;
                                    }
                                }
                                let _ = upstream_sink.close().await;
                            };

                            let u_to_c = async {
                                while let Some(msg) = upstream_stream.next().await {
                                    match msg {
                                        Ok(m) => match m {
                                            TungMessage::Text(s) => {
                                                if client_sink
                                                    .send(warp::ws::Message::text(s))
                                                    .await
                                                    .is_err()
                                                {
                                                    break;
                                                }
                                            }
                                            TungMessage::Binary(b) => {
                                                if client_sink
                                                    .send(warp::ws::Message::binary(b))
                                                    .await
                                                    .is_err()
                                                {
                                                    break;
                                                }
                                            }
                                            TungMessage::Ping(p) => {
                                                let _ = client_sink
                                                    .send(warp::ws::Message::ping(p))
                                                    .await;
                                            }
                                            TungMessage::Pong(p) => {
                                                let _ = client_sink
                                                    .send(warp::ws::Message::pong(p))
                                                    .await;
                                            }
                                            TungMessage::Close(_) => {
                                                let _ = client_sink
                                                    .send(warp::ws::Message::close())
                                                    .await;
                                                break;
                                            }
                                            TungMessage::Frame(_) => {}
                                        },
                                        Err(_) => break,
                                    }
                                }
                                let _ = client_sink.close().await;
                            };

                            tokio::select! {
                                _ = c_to_u => (),
                                _ = u_to_c => (),
                            }
                        }
                        Err(e) => {
                            eprintln!("[proxy] ws connect failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[proxy] into_client_request failed: {}", e);
                }
            }
        }),
    )
}
